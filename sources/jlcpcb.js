// JLCPCB parts-library search.
// POST https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2

const SEARCH_URL =
  "https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2";
const JLCPCB_ORIGIN = "https://jlcpcb.com";
const PAGE_SIZE = 8;

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

export function pickComponent(c) {
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
    stockText: null,
    libType,
    currency: "USD",
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
  };
}

export async function search(keyword, { signal } = {}) {
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
    signal,
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
    total: typeof info.total === "number" ? info.total : results.length,
    results,
  };
}

export const searchUrl = (keyword) =>
  JLCPCB_ORIGIN + "/parts/componentSearch?searchTxt=" + encodeURIComponent(keyword);
