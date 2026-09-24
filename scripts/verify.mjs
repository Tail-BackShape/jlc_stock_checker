// End-to-end check for the extension's content script using headless Chrome + CDP.
//
// Headless Chrome does not inject extension content scripts reliably, so this
// script injects content.js itself via Page.addScriptToEvaluateOnNewDocument,
// with a chrome.* stub whose sendMessage calls the real JLCPCB API from Node.
// The UI code under test is exactly the shipped content.js.
//
// Prereq: Chrome running with --headless=new --remote-debugging-port=9222.
// Usage: node scripts/verify.mjs

import http from "node:http";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { extname, join } from "node:path";

const CDP_PORT = 9222;
const HTTP_PORT = 8765;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

const SEARCH_URL =
  "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2";

// Same normalization as background.js (kept in sync for the harness).
const LIB_LABEL = { base: "Basic", expand: "Extended" };
function normalizePrices(list) {
  if (!Array.isArray(list)) return [];
  const sorted = list
    .filter(
      (p) =>
        p && typeof p.startNumber === "number" && typeof p.productPrice === "number"
    )
    .map((p) => ({
      start: p.startNumber,
      end: typeof p.endNumber === "number" ? p.endNumber : -1,
      price: p.productPrice,
    }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const row of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.price === row.price && row.start <= prev.end + 1)
      prev.end = row.end;
    else merged.push({ ...row });
  }
  return merged.slice(0, 6);
}
function pickComponent(c) {
  return {
    code: c.componentCode ?? null,
    mpn: c.componentModelEn ?? "",
    brand: c.componentBrandEn ?? "",
    package: c.componentSpecificationEn ?? "",
    category: c.firstSortName ?? c.componentTypeEn ?? "",
    stock: typeof c.stockCount === "number" ? c.stockCount : null,
    libType: LIB_LABEL[c.componentLibraryType] || c.componentLibraryType || null,
    prices: normalizePrices(c.componentPrices),
    moq:
      typeof c.minPurchaseNum === "number" && c.minPurchaseNum > 1
        ? c.minPurchaseNum
        : null,
    productUrl: c.componentCode
      ? "https://jlcpcb.com/partdetail/" + c.componentCode
      : c.lcscGoodsUrl || null,
    canBuy: c.isBuyComponent !== "0",
    noBuyReason: c.noBuyReason || null,
  };
}
async function apiSearch(keyword) {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPage: 1,
      pageSize: 8,
      keyword,
      searchSource: "search",
      presaleType: "stock",
      searchType: 2,
    }),
  });
  const j = await res.json();
  const info = (j.data && j.data.componentPageInfo) || {};
  const raw = Array.isArray(info.list) ? info.list : [];
  const seen = new Set();
  const results = [];
  for (const c of raw) {
    const key = c.componentCode || c.componentId;
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    results.push(pickComponent(c));
  }
  return {
    ok: j.code === 200,
    total: typeof info.total === "number" ? info.total : results.length,
    results,
  };
}

// --- tiny static server so the page runs on http:// (not file://) ---
const server = http.createServer(async (req, res) => {
  try {
    const path = req.url === "/" ? "/test.html" : req.url.split("?")[0];
    const data = await readFile(join(ROOT, decodeURIComponent(path)));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "text/plain" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));

const base = "http://127.0.0.1:" + CDP_PORT;
let version = null;
for (let i = 0; i < 40 && !version; i++) {
  try {
    version = await (await fetch(base + "/json/version")).json();
  } catch {
    await delay(500);
  }
}
if (!version) {
  console.error("FAIL: Chrome CDP endpoint not reachable");
  process.exit(2);
}
console.log("Chrome:", version.Browser);

// Close stale test pages, then open a fresh one.
const targets = await (await fetch(base + "/json/list")).json();
for (const t of targets) {
  if (t.type === "page" && t.url.includes("127.0.0.1:" + HTTP_PORT)) {
    await fetch(base + "/json/close/" + t.id).catch(() => {});
  }
}
const target = await (
  await fetch(base + "/json/new?about:blank", { method: "PUT" })
).json();

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let msgId = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === "Runtime.bindingCalled") {
    // Bridge: page called __jlcSearch(json) -> run real API, resolve in page.
    const msg = JSON.parse(m.params.payload);
    apiSearch(msg.keyword)
      .then((r) =>
        send("Runtime.evaluate", {
          expression:
            "window.__jlcResolve(" + JSON.stringify(JSON.stringify(r)) + ")",
        })
      )
      .catch(() => {});
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++msgId;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.result && r.result.exceptionDetails)
    return { __error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
  return r.result && r.result.result ? r.result.result.value : undefined;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Runtime.addBinding", { name: "__jlcSearch" });

// Inject chrome.* stub + content.js into every new document.
const stub =
  "window.__jlcQueue=[];" +
  "window.__jlcResolve=function(payload){var f=window.__jlcQueue.shift();if(f)f(payload);};" +
  "window.chrome={runtime:{" +
  "getURL:function(p){return 'http://127.0.0.1:" + HTTP_PORT + "/'+p;}," +
  "sendMessage:function(msg,cb){" +
  "  new Promise(function(res){window.__jlcQueue.push(res);__jlcSearch(JSON.stringify(msg));})" +
  "    .then(function(p){cb(JSON.parse(p));}).catch(function(){cb(null);});" +
  "}}};";
await send("Page.addScriptToEvaluateOnNewDocument", { source: stub });
const contentSrc = await readFile(join(ROOT, "content.js"), "utf8");
await send("Page.addScriptToEvaluateOnNewDocument", { source: contentSrc });

await send("Page.navigate", {
  url: "http://127.0.0.1:" + HTTP_PORT + "/test.html",
});
await delay(1800);

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log(
    (cond ? "PASS" : "FAIL") + "  " + name + (detail ? "  | " + detail : "")
  );
}

const hostExists = await evalJs(
  "!!document.getElementById('jlcpcb-quicklook-host')"
);
check("content script injected", hostExists === true, String(hostExists));

async function selectCode(index) {
  return evalJs(
    "(function(){var n=document.querySelectorAll('code')[" + index + "];" +
      "var r=document.createRange();r.selectNodeContents(n);" +
      "var s=getSelection();s.removeAllRanges();s.addRange(r);" +
      "document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));" +
      "return s.toString();})()"
  );
}
async function popText() {
  return evalJs(
    "(function(){var h=document.getElementById('jlcpcb-quicklook-host');" +
      "if(!h||!h.shadowRoot)return null;" +
      "var p=h.shadowRoot.querySelector('.jlc-pop');" +
      "return p&&p.style.display!=='none'?p.innerText:null;})()"
  );
}
async function btnVisible() {
  return evalJs(
    "(function(){var h=document.getElementById('jlcpcb-quicklook-host');" +
      "if(!h||!h.shadowRoot)return null;" +
      "var b=h.shadowRoot.querySelector('.jlc-btn');" +
      "return b?b.style.display:null;})()"
  );
}
async function clickBtn() {
  return evalJs(
    "(function(){var h=document.getElementById('jlcpcb-quicklook-host');" +
      "h.shadowRoot.querySelector('.jlc-btn').click();return true;})()"
  );
}
async function pressEscape() {
  return evalJs(
    "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true"
  );
}

// 1. MPN selection -> floating button -> detail card.
const selected = await selectCode(0);
check("select text", selected === "STM32H743ZIT6", String(selected));
await delay(250);
const bv = await btnVisible();
check("floating button appears", bv === "flex", String(bv));
await clickBtn();
await delay(4000);
let text = await popText();
check(
  "detail card shows LCSC code",
  text && text.includes("C114408"),
  (text || "").slice(0, 140).replace(/\n/g, " / ")
);
check("detail card shows price", text && /\$\d/.test(text), "");
check("detail card shows stock", text && /pcs|Out of stock/i.test(text), "");
await pressEscape();
await delay(200);

// 2. LCSC code search.
await selectCode(1);
await delay(250);
await clickBtn();
await delay(4000);
text = await popText();
check(
  "LCSC code search -> C114408",
  text && text.includes("C114408"),
  (text || "").slice(0, 140).replace(/\n/g, " / ")
);
await pressEscape();
await delay(200);

// 3. Fuzzy search -> candidate list.
await selectCode(2);
await delay(250);
await clickBtn();
await delay(4000);
text = await popText();
const codes = (text || "").match(/C\d{4,}/g) || [];
check(
  "fuzzy search shows candidates",
  codes.length >= 3,
  codes.join(",") + " | " + (text || "").slice(0, 140).replace(/\n/g, " / ")
);

ws.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(
  failed.length === 0
    ? "\nALL CHECKS PASSED"
    : "\n" + failed.length + " CHECK(S) FAILED"
);
process.exit(failed.length === 0 ? 0 : 1);
