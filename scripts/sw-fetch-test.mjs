// Attach to the extension's service worker and run a real fetch against the
// JLCPCB API, verifying the DNR Origin rewrite works end to end.
import { setTimeout as delay } from "node:timers/promises";

const base = "http://127.0.0.1:9222";

// Find our extension's service worker target.
let sw = null;
for (let i = 0; i < 30 && !sw; i++) {
  const targets = await (await fetch(base + "/json/list")).json();
  sw = targets.find(
    (t) =>
      t.type === "service_worker" &&
      t.url.startsWith("chrome-extension://") &&
      !t.url.includes("service_worker_bin_prod") &&
      !t.url.includes("nmmhkkegccagdldgiimedpiccmgmieda") &&
      !t.url.includes("fignfifoniblkonapihmkfakmlgkbkcf") &&
      !t.url.includes("ghbmnnjooekpmoecnnnilnnbdlolhkhi")
  );
  if (!sw) await delay(500);
}
if (!sw) {
  console.log("FAIL: extension service worker not found");
  process.exit(1);
}
console.log("SW:", sw.url);

const ws = new WebSocket(sw.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await send("Runtime.enable");

const r = await send("Runtime.evaluate", {
  expression:
    "fetch('https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2'," +
    "{method:'POST',headers:{'Content-Type':'application/json'}," +
    "body:JSON.stringify({currentPage:1,pageSize:2,keyword:'C114408',searchSource:'search',presaleType:'stock',searchType:2})})" +
    ".then(async res=>({status:res.status,body:(await res.text()).slice(0,400)}))" +
    ".catch(e=>({error:String(e)}))",
  returnByValue: true,
  awaitPromise: true,
});
console.log("fetch result:", JSON.stringify(r.result && r.result.result && r.result.result.value, null, 1));

// Also check the DNR ruleset loaded.
const rules = await send("Runtime.evaluate", {
  expression:
    "chrome.declarativeNetRequest.getStaticRules().then(rs=>rs.map(x=>x.id))",
  returnByValue: true,
  awaitPromise: true,
});
console.log("static rules:", JSON.stringify(rules.result && rules.result.result && rules.result.result.value));

ws.close();
