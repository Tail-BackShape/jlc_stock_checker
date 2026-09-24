// Akizuki Denshi search - HTML scraping of the catalog search page.
// GET https://akizukidenshi.com/catalog/goods/search.aspx?search=keyword&keyword=...

const ORIGIN = "https://akizukidenshi.com";
const SEARCH_URL =
  ORIGIN + "/catalog/goods/search.aspx?search=keyword&keyword=";
const MAX_RESULTS = 8;

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

// Exported for testing.
export function parseSearchHtml(html) {
  const items = [];
  // Each result lives in a <dl class="block-cart-i--goods ..."> block.
  const blocks = html.split("block-cart-i--goods js-enhanced-ecommerce-item");
  for (let i = 1; i < blocks.length && items.length < MAX_RESULTS; i++) {
    const b = blocks[i];

    const link = b.match(/href="(\/catalog\/g\/g(\d+)\/)"/);
    const name = b.match(/js-enhanced-ecommerce-goods-name"[^>]*>([^<]+)</);
    const mpn = b.match(/型番：<\/strong>([^<]+)</);
    const stockTxt = b.match(/block-cart-i--stock-info-[a-z]+">([^<]+)</);
    const qty = b.match(/通販購入可能数：<\/dt>\s*<dd>([\d,]+)個/);
    const img = b.match(/data-src="(\/img\/goods\/M\/\d+\.jpg)"/);

    // Price rows: <div class="block-cart-i--price-qty">1個</div>
    //             <div class="block-cart-i--price ...">￥270...</div>
    const prices = [];
    const priceRe =
      /block-cart-i--price-qty">\s*([\d,]+)個(以上)?[\s\S]*?block-cart-i--price[^"]*">￥([\d,]+)/g;
    let pm;
    while ((pm = priceRe.exec(b)) !== null) {
      prices.push({
        start: parseInt(pm[1].replace(/,/g, ""), 10),
        openEnded: !!pm[2],
        price: parseInt(pm[3].replace(/,/g, ""), 10),
      });
    }
    prices.sort((a, b2) => a.start - b2.start);
    const priceRows = prices.map((p, i2) => ({
      start: p.start,
      end: p.openEnded ? -1 : i2 + 1 < prices.length ? prices[i2 + 1].start - 1 : p.start,
      price: p.price,
    }));

    if (!link && !name) continue;

    const code = link ? link[2] : null;
    const stockNum = qty ? parseInt(qty[1].replace(/,/g, ""), 10) : null;
    const stockText = stockTxt ? decodeEntities(stockTxt[1]) : null;
    items.push({
      code,
      mpn: mpn ? decodeEntities(mpn[1]) : "",
      brand: "",
      name: name ? decodeEntities(name[1]) : "",
      package: "",
      category: "",
      stock: stockNum,
      stockText,
      libType: null,
      currency: "JPY",
      prices: priceRows,
      moq: null,
      loss: null,
      datasheet: null,
      image: img ? ORIGIN + img[1] : null,
      productUrl: link ? ORIGIN + link[1] : null,
      canBuy: stockNum == null ? true : stockNum > 0,
      noBuyReason:
        stockText && /なし|売切|終了|廃/.test(stockText) && !stockNum
          ? stockText
          : null,
    });
  }

  const totalM = html.match(/pager-count"><span>(\d+)<\/span>件/);
  return {
    total: totalM ? parseInt(totalM[1], 10) : items.length,
    results: items,
  };
}

export async function search(keyword, { signal } = {}) {
  const res = await fetch(SEARCH_URL + encodeURIComponent(keyword), {
    signal,
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error("Akizuki returned HTTP " + res.status);
  const html = await res.text();
  return parseSearchHtml(html);
}

export const searchUrl = (keyword) =>
  SEARCH_URL + encodeURIComponent(keyword);
