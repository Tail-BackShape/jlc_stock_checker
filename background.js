// JLCPCB Parts Quick Look - service worker.
// Performs the parts-library search on behalf of content scripts and
// normalizes the (large) API response into a small payload.

"use strict";

const SEARCH_URL =
  "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2";
const JLCPCB_ORIGIN = "https://jlcpcb.com";
const PAGE_SIZE = 8;
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const cache = new Map(); // normalizedKeyword -> { at, result }

const LIB_LABEL = {
  base: "Basic",
  expand: "Extended",
};

function normalizePrices(list) {
  if (!Array.isArray(list)) return [];
  const sorted = list
    .filter(
      (p) =>
        p &&
        typeof p.startNumber === "number" &&
        typeof p.productPrice === "number"
    )
    .map((p) => ({
      start: p.startNumber,
      end: typeof p.endNumber === "number" ? p.endNumber : -1,
      price: p.productPrice,
    }))
    .sort((a, b) => a.start - b.start);

  // Merge consecutive rows with the same price (the API sometimes splits
  // a single break into rows such as 100-101 / 102-103 / 104+).
  const merged = [];
  for (const row of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.price === row.price && row.start <= prev.end + 1) {
      prev.end = row.end;
    } else {
      merged.push({ ...row });
    }
  }
  return merged.slice(0, 6);
}

function pickComponent(c) {
  const libType =
    LIB_LABEL[c.componentLibraryType] || c.componentLibraryType || null;
  return {
    code: c.componentCode ?? null,
    mpn: c.componentModelEn ?? "",
    brand: c.componentBrandEn ?? "",
    name: c.componentName ?? "",
    package: c.componentSpecificationEn ?? "",
    category: c.firstSortName ?? c.componentTypeEn ?? "",
    stock: typeof c.stockCount === "number" ? c.stockCount : null,
    libType,
    prices: normalizePrices(c.componentPrices),
    moq:
      typeof c.minPurchaseNum === "number" && c.minPurchaseNum > 1
        ? c.minPurchaseNum
        : null,
    loss:
      typeof c.lossNumber === "number" && c.lossNumber > 0 ? c.lossNumber : null,
    datasheet: c.dataManualUrl || null,
    image: c.minImageAccessIdUrl || c.componentImageUrl || null,
    productUrl: c.componentCode
      ? JLCPCB_ORIGIN + "/partdetail/" + c.componentCode
      : c.lcscGoodsUrl || null,
    canBuy: c.isBuyComponent !== "0",
    noBuyReason: c.noBuyReason || null,
    description: c.describe || "",
  };
}

async function searchParts(keyword) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPage: 1,
        pageSize: PAGE_SIZE,
        keyword,
        searchSource: "search",
        presaleType: "stock",
        searchType: 2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("JLCPCB API returned HTTP " + res.status);
    const json = await res.json();
    if (json.code !== 200 || !json.data) {
      throw new Error(
        json.message || json.msg || "API error (code " + json.code + ")"
      );
    }
    const info = json.data.componentPageInfo || {};
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
      ok: true,
      total: typeof info.total === "number" ? info.total : results.length,
      results,
    };
  } catch (err) {
    const message =
      err && err.name === "AbortError"
        ? "Request timed out"
        : (err && err.message) || "Request failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function cachedSearch(keyword) {
  const key = keyword.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Promise.resolve(hit.result);
  }
  return searchParts(keyword.trim()).then((result) => {
    if (result.ok) {
      cache.set(key, { at: Date.now(), result });
      if (cache.size > CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
      }
    }
    return result;
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "JLC_SEARCH" || typeof msg.keyword !== "string") {
    return false;
  }
  const keyword = msg.keyword.trim();
  if (!keyword) {
    sendResponse({ ok: false, error: "Empty keyword" });
    return false;
  }
  cachedSearch(keyword)
    .then((result) => sendResponse(result))
    .catch((err) =>
      sendResponse({
        ok: false,
        error: (err && err.message) || "Request failed",
      })
    );
  return true; // async response
});
