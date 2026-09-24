// JLCPCB Parts Quick Look - content script.
// Shows a DeepL-style floating button next to a text selection; clicking it
// opens a popover with JLCPCB parts-library stock and pricing.

"use strict";

(() => {
  const HOST_ID = "jlcpcb-quicklook-host";
  if (document.getElementById(HOST_ID)) return;

  const POPOVER_WIDTH = 340;
  const MAX_CANDIDATES = 6;

  const CSS = [
    ":host { all: initial; }",
    ".jlc-btn { position: fixed; z-index: 2147483647; display: flex; align-items: center; gap: 5px;",
    "  padding: 5px 9px; border: none; border-radius: 8px; background: #1f2937; color: #fff;",
    '  font: 600 11px/1.2 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
    "  letter-spacing: .03em; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.28);",
    "  pointer-events: auto; user-select: none; transition: transform .08s ease, background .12s ease; }",
    ".jlc-btn:hover { background: #2563eb; transform: translateY(-1px); }",
    ".jlc-btn img { width: 14px; height: 14px; display: block; }",
    "",
    ".jlc-pop { position: fixed; z-index: 2147483647; width: " + POPOVER_WIDTH + "px;",
    "  background: #fff; color: #1f2937; border-radius: 12px; border: 1px solid #e5e7eb;",
    "  box-shadow: 0 12px 40px rgba(15,23,42,.22);",
    '  font: 13px/1.45 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
    "  pointer-events: auto; overflow: hidden; }",
    ".jlc-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px;",
    "  border-bottom: 1px solid #f1f5f9; background: #f8fafc; }",
    ".jlc-head input { flex: 1; min-width: 0; border: 1px solid #e2e8f0; border-radius: 6px;",
    "  padding: 4px 8px; font: inherit; font-size: 12px; color: inherit; background: #fff; outline: none; }",
    ".jlc-head input:focus { border-color: #2563eb; }",
    ".jlc-x { border: none; background: none; color: #94a3b8; font-size: 16px; line-height: 1;",
    "  cursor: pointer; padding: 2px 4px; border-radius: 4px; }",
    ".jlc-x:hover { color: #1f2937; background: #e2e8f0; }",
    ".jlc-body { padding: 10px 12px 12px; max-height: 380px; overflow-y: auto; }",
    "",
    ".jlc-status { padding: 14px 4px; color: #64748b; text-align: center; }",
    ".jlc-err { color: #b91c1c; }",
    "",
    ".jlc-row { display: flex; align-items: center; gap: 8px; width: 100%;",
    "  padding: 8px 6px; border: none; border-bottom: 1px solid #f1f5f9;",
    "  background: none; text-align: left; cursor: pointer; font: inherit; color: inherit; border-radius: 6px; }",
    ".jlc-row:hover { background: #f1f5f9; }",
    ".jlc-row:last-child { border-bottom: none; }",
    ".jlc-row-main { flex: 1; min-width: 0; }",
    ".jlc-row-mpn { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".jlc-row-sub { color: #64748b; font-size: 11px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".jlc-row-side { text-align: right; flex-shrink: 0; }",
    ".jlc-row-price { font-weight: 600; font-size: 12px; }",
    ".jlc-caret { color: #94a3b8; font-size: 14px; flex-shrink: 0; }",
    "",
    ".jlc-detail-head { display: flex; gap: 10px; align-items: flex-start; }",
    ".jlc-thumb { width: 44px; height: 44px; flex-shrink: 0; object-fit: contain;",
    "  border: 1px solid #e5e7eb; border-radius: 6px; background: #fff; }",
    ".jlc-title { font-size: 14px; font-weight: 700; word-break: break-all; }",
    ".jlc-brand { color: #64748b; font-size: 12px; margin-top: 1px; }",
    ".jlc-code { display: inline-block; margin-top: 4px; padding: 1px 6px;",
    "  background: #eff6ff; color: #1d4ed8; border-radius: 4px; font-size: 11px; font-weight: 600; }",
    "",
    ".jlc-meta { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px;",
    "  margin: 10px 0; padding: 8px 10px; background: #f8fafc; border-radius: 8px; font-size: 12px; }",
    ".jlc-meta dt { color: #64748b; margin: 0; }",
    ".jlc-meta dd { margin: 0; text-align: right; font-weight: 500; word-break: break-word; }",
    "",
    ".jlc-stock-ok { color: #15803d; }",
    ".jlc-stock-out { color: #b91c1c; }",
    ".jlc-badge { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }",
    ".jlc-badge-basic { background: #dcfce7; color: #166534; }",
    ".jlc-badge-extended { background: #fef3c7; color: #92400e; }",
    ".jlc-badge-other { background: #e2e8f0; color: #475569; }",
    "",
    ".jlc-prices { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 2px; }",
    ".jlc-prices th { text-align: left; color: #64748b; font-weight: 500; font-size: 11px;",
    "  padding: 3px 4px; border-bottom: 1px solid #e2e8f0; }",
    ".jlc-prices th:last-child, .jlc-prices td:last-child { text-align: right; }",
    ".jlc-prices td { padding: 4px; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }",
    ".jlc-prices tr:last-child td { border-bottom: none; }",
    "",
    ".jlc-note { color: #64748b; font-size: 11px; margin: 8px 0 0; }",
    ".jlc-note.jlc-err { color: #b91c1c; }",
    "",
    ".jlc-actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }",
    ".jlc-act { border: 1px solid #e2e8f0; background: #fff; color: #1f2937;",
    "  border-radius: 6px; padding: 4px 9px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit; }",
    ".jlc-act:hover { background: #f1f5f9; }",
    ".jlc-link { color: #2563eb; text-decoration: none; font-size: 11px; font-weight: 600;",
    "  padding: 4px 2px; margin-left: auto; }",
    ".jlc-link:hover { text-decoration: underline; }",
    "",
    ".jlc-foot { display: flex; justify-content: space-between; align-items: center;",
    "  padding: 6px 12px; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 10px; }",
    ".jlc-foot a { color: #64748b; text-decoration: none; }",
    ".jlc-foot a:hover { text-decoration: underline; }",
  ].join("\n");

  // ---------- DOM scaffold ----------

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "jlc-btn";
  btn.style.display = "none";
  const btnIcon = document.createElement("img");
  btnIcon.src = chrome.runtime.getURL("icons/icon32.png");
  btnIcon.alt = "";
  btnIcon.onerror = () => btnIcon.remove();
  const btnLabel = document.createElement("span");
  btnLabel.textContent = "JLC";
  btn.append(btnIcon, btnLabel);
  shadow.appendChild(btn);

  const pop = document.createElement("div");
  pop.className = "jlc-pop";
  pop.style.display = "none";
  pop.setAttribute("role", "dialog");
  shadow.appendChild(pop);

  function mountHost() {
    if (host.isConnected) return;
    const target = document.documentElement || document.body;
    if (target) target.appendChild(host);
  }
  mountHost();
  if (!host.isConnected) {
    const mo = new MutationObserver(() => {
      mountHost();
      if (host.isConnected) mo.disconnect();
    });
    mo.observe(document, { childList: true, subtree: true });
  }

  // ---------- State ----------

  let currentKeyword = null;
  let anchorRange = null; // live Range used to re-anchor on scroll
  let anchorRect = null;  // fallback rect (viewport coords)
  let reqSeq = 0;
  let popOpen = false;

  // ---------- Helpers ----------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function isPlausiblePart(text) {
    const t = text.trim();
    if (t.length < 3 || t.length > 60) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9\-_.+()\/\\ ]*$/.test(t)) return false;
    if (!/[0-9]/.test(t)) return false;
    if ((t.match(/\s/g) || []).length > 3) return false;
    return true;
  }

  function fmtQtyRange(start, end) {
    const s = start.toLocaleString();
    if (end == null || end < 0) return s + "+";
    if (end === start) return s;
    return s + "\u2013" + end.toLocaleString();
  }

  function fmtPrice(p) {
    if (!p || p.price == null) return "\u2014";
    return "$" + Number(p.price).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  }

  function firstPrice(comp) {
    return comp.prices && comp.prices.length ? fmtPrice(comp.prices[0]) : "\u2014";
  }

  function stockLabel(comp) {
    if (comp.stock == null) return { text: "\u2014", ok: false };
    if (comp.stock > 0)
      return { text: comp.stock.toLocaleString() + " pcs", ok: true };
    return { text: "Out of stock", ok: false };
  }

  function libBadge(comp) {
    if (!comp.libType) return null;
    const cls =
      comp.libType === "Basic"
        ? "jlc-badge-basic"
        : comp.libType === "Extended"
          ? "jlc-badge-extended"
          : "jlc-badge-other";
    return el("span", "jlc-badge " + cls, comp.libType);
  }

  function copyText(text, target) {
    const done = () => {
      if (!target) return;
      const prev = target.textContent;
      target.textContent = "Copied!";
      setTimeout(() => {
        target.textContent = prev;
      }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (_) {
        /* ignore */
      }
      ta.remove();
      done();
    }
  }

  function currentAnchorRect() {
    if (anchorRange) {
      try {
        const r = anchorRange.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) {
          anchorRect = r;
          return r;
        }
      } catch (_) {
        /* keep last rect */
      }
    }
    return anchorRect;
  }

  // ---------- Positioning ----------

  function placeButton(rect) {
    btn.style.display = "flex";
    const bw = btn.offsetWidth || 56;
    const bh = btn.offsetHeight || 24;
    let left = rect.right + 6;
    let top = rect.bottom + 6;
    if (left + bw > window.innerWidth - 8) left = rect.left - bw - 6;
    if (left < 8) left = Math.min(rect.left, window.innerWidth - bw - 8);
    if (top + bh > window.innerHeight - 8) top = rect.top - bh - 6;
    if (top < 8) top = 8;
    btn.style.left = Math.max(8, left) + "px";
    btn.style.top = top + "px";
  }

  function placePopover() {
    const rect = currentAnchorRect();
    if (!rect) return;
    pop.style.display = "block";
    const ph = pop.offsetHeight || 300;
    let left = rect.right + 6 - POPOVER_WIDTH / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - POPOVER_WIDTH - 8));
    let top = rect.bottom + 34;
    if (top + ph > window.innerHeight - 8) {
      top = Math.max(8, rect.top - ph - 10);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function hideButton() {
    btn.style.display = "none";
  }

  function closePopover() {
    popOpen = false;
    pop.style.display = "none";
  }

  // ---------- Selection handling ----------

  function handleSelection() {
    if (popOpen) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideButton();
      return;
    }
    const text = sel.toString();
    if (!isPlausiblePart(text)) {
      hideButton();
      return;
    }
    let rect;
    try {
      const range = sel.getRangeAt(0);
      rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        const rects = range.getClientRects();
        rect = rects.length ? rects[rects.length - 1] : null;
      }
      if (rect) anchorRange = range.cloneRange();
    } catch (_) {
      rect = null;
    }
    if (!rect) {
      hideButton();
      return;
    }
    currentKeyword = text.trim();
    anchorRect = rect;
    placeButton(rect);
  }

  let selTimer = null;
  document.addEventListener("pointerup", () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(handleSelection, 30);
  });

  document.addEventListener("selectionchange", () => {
    if (popOpen) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideButton();
  });

  // ---------- Events ----------

  // Keep the selection alive when the floating button is pressed.
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPopover(currentKeyword);
  });

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target === host) return; // click inside our UI (retargeted to host)
      if (popOpen) closePopover();
      hideButton();
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (popOpen) closePopover();
      hideButton();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!popOpen && btn.style.display !== "none") {
        const rect = currentAnchorRect();
        if (rect) placeButton(rect);
      }
      if (popOpen) placePopover();
    },
    { capture: true, passive: true }
  );

  // ---------- Popover ----------

  function openPopover(keyword) {
    if (!keyword) return;
    popOpen = true;
    hideButton();

    // After the extension is reloaded/updated, this content script's runtime
    // context is invalidated: sendMessage throws synchronously and the popover
    // would otherwise stay on "Searching..." forever.
    if (!chrome.runtime || !chrome.runtime.id) {
      renderError(
        "Extension was reloaded. Please refresh this page (F5) and try again."
      );
      placePopover();
      return;
    }

    renderLoading(keyword);
    placePopover();
    const seq = ++reqSeq;

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled || seq !== reqSeq || !popOpen) return;
      settled = true;
      renderError("Request timed out. Please try again.");
    }, 20000);

    const onResponse = (res) => {
      if (settled || seq !== reqSeq || !popOpen) return;
      settled = true;
      clearTimeout(timeout);
      if (chrome.runtime.lastError || !res) {
        const msg = chrome.runtime.lastError
          ? chrome.runtime.lastError.message
          : "";
        renderError(
          msg && msg.indexOf("invalidated") >= 0
            ? "Extension was reloaded. Please refresh this page (F5) and try again."
            : "Extension error: could not reach the background worker."
        );
        return;
      }
      if (!res.ok) {
        renderError(res.error || "Request failed.");
        return;
      }
      renderResults(res);
    };

    try {
      chrome.runtime.sendMessage({ type: "JLC_SEARCH", keyword }, onResponse);
    } catch (e) {
      clearTimeout(timeout);
      renderError(
        "Extension was reloaded. Please refresh this page (F5) and try again."
      );
    }
  }

  function buildHead() {
    const head = el("div", "jlc-head");
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentKeyword || "";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Search keyword");
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const v = input.value.trim();
        if (v) {
          currentKeyword = v;
          openPopover(v);
        }
      } else if (e.key === "Escape") {
        closePopover();
      }
    });
    const close = el("button", "jlc-x", "\u00d7");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", closePopover);
    head.append(input, close);
    return head;
  }

  function buildFoot() {
    const foot = el("div", "jlc-foot");
    const left = el("span", null, "JLCPCB Parts Library");
    const right = document.createElement("a");
    right.href =
      "https://jlcpcb.com/parts/componentSearch?searchTxt=" +
      encodeURIComponent(currentKeyword || "");
    right.target = "_blank";
    right.rel = "noopener noreferrer";
    right.textContent = "View all results \u2197";
    foot.append(left, right);
    return foot;
  }

  function renderShell(bodyNode) {
    pop.textContent = "";
    pop.append(buildHead(), bodyNode, buildFoot());
    placePopover();
  }

  function renderLoading(keyword) {
    const body = el("div", "jlc-body");
    body.append(
      el("div", "jlc-status", "Searching JLCPCB for \u201c" + keyword + "\u201d\u2026")
    );
    renderShell(body);
  }

  function renderError(message) {
    const body = el("div", "jlc-body");
    body.append(el("div", "jlc-status jlc-err", message));
    renderShell(body);
  }

  function renderResults(res) {
    const list = res.results || [];
    if (list.length === 0) {
      const body = el("div", "jlc-body");
      body.append(
        el("div", "jlc-status", "No parts found for \u201c" + currentKeyword + "\u201d.")
      );
      renderShell(body);
      return;
    }
    if (list.length === 1) {
      renderDetail(list[0]);
      return;
    }
    renderCandidates(list, res.total);
  }

  function renderCandidates(list, total) {
    const body = el("div", "jlc-body");
    for (const comp of list.slice(0, MAX_CANDIDATES)) {
      const row = el("button", "jlc-row");
      row.type = "button";

      const main = el("div", "jlc-row-main");
      main.append(el("div", "jlc-row-mpn", comp.mpn || comp.code || "?"));
      const sub = [comp.code, comp.brand, comp.package]
        .filter(Boolean)
        .join(" \u00b7 ");
      main.append(el("div", "jlc-row-sub", sub));

      const side = el("div", "jlc-row-side");
      side.append(el("div", "jlc-row-price", firstPrice(comp)));
      const st = stockLabel(comp);
      side.append(
        el("div", "jlc-row-sub " + (st.ok ? "jlc-stock-ok" : "jlc-stock-out"), st.text)
      );

      row.append(main, side, el("span", "jlc-caret", "\u203a"));
      row.addEventListener("click", () => renderDetail(comp));
      body.append(row);
    }
    if (total && total > MAX_CANDIDATES) {
      body.append(
        el("div", "jlc-note", total.toLocaleString() + " results \u2014 open a row for details.")
      );
    }
    renderShell(body);
  }

  function renderDetail(comp) {
    const body = el("div", "jlc-body");

    const head = el("div", "jlc-detail-head");
    if (comp.image) {
      const img = document.createElement("img");
      img.className = "jlc-thumb";
      img.src = comp.image;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.remove();
      head.append(img);
    }
    const info = el("div");
    info.append(el("div", "jlc-title", comp.mpn || comp.name || comp.code || "?"));
    if (comp.brand) info.append(el("div", "jlc-brand", comp.brand));
    if (comp.code) info.append(el("span", "jlc-code", comp.code));
    head.append(info);
    body.append(head);

    const meta = el("dl", "jlc-meta");
    const st = stockLabel(comp);
    meta.append(el("dt", null, "Stock"));
    meta.append(
      el("dd", st.ok ? "jlc-stock-ok" : "jlc-stock-out", st.text)
    );
    const badge = libBadge(comp);
    if (badge) {
      meta.append(el("dt", null, "Type"));
      const dd = el("dd");
      dd.append(badge);
      meta.append(dd);
    }
    if (comp.package) {
      meta.append(el("dt", null, "Package"));
      meta.append(el("dd", null, comp.package));
    }
    if (comp.category) {
      meta.append(el("dt", null, "Category"));
      meta.append(el("dd", null, comp.category));
    }
    body.append(meta);

    if (comp.prices && comp.prices.length) {
      const table = el("table", "jlc-prices");
      const thead = document.createElement("thead");
      const htr = document.createElement("tr");
      htr.append(el("th", null, "Qty"), el("th", null, "Unit price (USD)"));
      thead.append(htr);
      table.append(thead);
      const tbody = document.createElement("tbody");
      for (const p of comp.prices) {
        const tr = document.createElement("tr");
        tr.append(
          el("td", null, fmtQtyRange(p.start, p.end)),
          el("td", null, fmtPrice(p))
        );
        tbody.append(tr);
      }
      table.append(tbody);
      body.append(table);
    }

    if (comp.moq) {
      body.append(
        el("div", "jlc-note", "Min. order qty: " + comp.moq.toLocaleString())
      );
    }
    if (comp.loss) {
      body.append(
        el("div", "jlc-note", "Attrition (loss) qty: " + comp.loss.toLocaleString())
      );
    }
    if (!comp.canBuy && comp.noBuyReason) {
      body.append(el("div", "jlc-note jlc-err", comp.noBuyReason));
    }

    const actions = el("div", "jlc-actions");
    if (comp.code) {
      const b1 = el("button", "jlc-act", "Copy " + comp.code);
      b1.type = "button";
      b1.addEventListener("click", () => copyText(comp.code, b1));
      actions.append(b1);
    }
    if (comp.mpn) {
      const b2 = el("button", "jlc-act", "Copy MPN");
      b2.type = "button";
      b2.addEventListener("click", () => copyText(comp.mpn, b2));
      actions.append(b2);
    }
    if (comp.productUrl) {
      const a = document.createElement("a");
      a.className = "jlc-link";
      a.href = comp.productUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Details \u2197";
      actions.append(a);
    }
    if (comp.datasheet) {
      const a = document.createElement("a");
      a.className = "jlc-link";
      a.style.marginLeft = "0";
      a.href = comp.datasheet;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Datasheet \u2197";
      actions.append(a);
    }
    body.append(actions);

    renderShell(body);
  }
})();
