// End-to-end check for the extension's content script using headless Chrome + CDP.
//
// Headless Chrome does not inject extension content scripts reliably, so this
// script injects content.js itself via Page.addScriptToEvaluateOnNewDocument,
// with a chrome.* stub whose sendMessage calls the real vendor APIs from Node.
// The UI code under test is exactly the shipped content.js.
//
// Prereq: Chrome running with --headless=new --remote-debugging-port=9222.
// Usage: node scripts/verify.mjs

import http from "node:http";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { extname, join } from "node:path";

import { search as jlcSearch } from "../sources/jlcpcb.js";
import { search as akizukiSearch } from "../sources/akizuki.js";
import { search as digikeySearch } from "../sources/digikey.js";

const CDP_PORT = 9222;
const HTTP_PORT = 8765;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

const SOURCES = [
  { id: "jlcpcb", label: "JLCPCB", urlTemplate: "https://jlcpcb.com/parts/componentSearch?searchTxt={q}" },
  { id: "akizuki", label: "秋月", urlTemplate: "https://akizukidenshi.com/catalog/goods/search.aspx?search=keyword&keyword={q}" },
  { id: "digikey", label: "DigiKey", urlTemplate: "https://www.digikey.jp/ja/products/result?keywords={q}" },
];

const SEARCHERS = { jlcpcb: jlcSearch, akizuki: akizukiSearch, digikey: digikeySearch };

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
    const incoming = JSON.parse(m.params.payload);
    const callId = incoming.__id;
    const msg = { ...incoming };
    delete msg.__id;
    handleMessage(msg)
      .then((r) =>
        send("Runtime.evaluate", {
          expression:
            "window.__jlcResolve(" +
            JSON.stringify(callId) +
            "," +
            JSON.stringify(JSON.stringify(r)) +
            ")",
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

async function handleMessage(msg) {
  if (msg.type === "JLC_SOURCES") {
    return { ok: true, sources: SOURCES };
  }
  if (msg.type === "JLC_SEARCH") {
    const fn = SEARCHERS[msg.source];
    if (!fn) return { ok: false, error: "unknown source" };
    try {
      const { total, results } = await fn(msg.keyword, { settings: {} });
      return { ok: true, total, results };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  return { ok: false, error: "unknown message" };
}

await send("Page.enable");
await send("Runtime.enable");
await send("Runtime.addBinding", { name: "__jlcSearch" });

const stub =
  "window.__jlcMap={};window.__jlcSeq=0;" +
  "window.__jlcResolve=function(id,payload){var f=window.__jlcMap[id];if(f){delete window.__jlcMap[id];f(payload);}};" +
  "window.chrome={runtime:{id:'test-ext'," +
  "getURL:function(p){return 'http://127.0.0.1:" + HTTP_PORT + "/'+p;}," +
  "sendMessage:function(msg,cb){" +
  "  var k='c'+(++window.__jlcSeq);" +
  "  var payload=Object.assign({__id:k},msg);" +
  "  new Promise(function(res){window.__jlcMap[k]=res;__jlcSearch(JSON.stringify(payload));})" +
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
async function clickTab(index) {
  return evalJs(
    "(function(){var h=document.getElementById('jlcpcb-quicklook-host');" +
      "var t=h.shadowRoot.querySelectorAll('.jlc-tab');" +
      "if(!t[" + index + "])return false;t[" + index + "].click();return true;})()"
  );
}

// 1. MPN selection -> floating button -> JLCPCB detail card.
const selected = await selectCode(0);
check("select text", selected === "STM32H743ZIT6", String(selected));
await delay(250);
const bv = await btnVisible();
check("floating button appears", bv === "flex", String(bv));
await clickBtn();
await delay(5000);
let text = await popText();
check(
  "JLCPCB detail card shows LCSC code",
  text && text.includes("C114408"),
  (text || "").slice(0, 160).replace(/\n/g, " / ")
);
check("JLCPCB shows price", text && /\$\d/.test(text), "");
check("JLCPCB shows stock", text && /pcs|Out of stock/i.test(text), "");
check("tabs rendered", text && /JLCPCB/.test(text) && /秋月/.test(text), "");

// 2. Akizuki tab - re-select a part Akizuki actually sells.
await pressEscape();
await delay(300);
await evalJs(
  "(function(){var ns=document.querySelectorAll('code');" +
    "var n=[...ns].find(x=>x.textContent==='PIC16F1827');" +
    "if(!n)return false;var r=document.createRange();r.selectNodeContents(n);" +
    "var s=getSelection();s.removeAllRanges();s.addRange(r);" +
    "document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));" +
    "return s.toString();})()"
);
await delay(250);
await clickBtn();
await delay(5000);
await clickTab(1);
await delay(4000);
text = await popText();
check(
  "Akizuki shows result",
  text && /104430|在庫|\u00a5|￥|円/.test(text),
  (text || "").slice(0, 160).replace(/\n/g, " / ")
);

// 3. DigiKey tab -> expected credentials error.
await clickTab(2);
await delay(1500);
text = await popText();
check(
  "DigiKey shows credentials error",
  text && /credentials|developer\.digikey/i.test(text),
  (text || "").slice(0, 160).replace(/\n/g, " / ")
);

await pressEscape();
ws.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(
  failed.length === 0
    ? "\nALL CHECKS PASSED"
    : "\n" + failed.length + " CHECK(S) FAILED"
);
process.exit(failed.length === 0 ? 0 : 1);
