// Test the Akizuki HTML parser against the live search page.
import { parseSearchHtml } from "../sources/akizuki.js";

const url =
  "https://akizukidenshi.com/catalog/goods/search.aspx?search=keyword&keyword=";

for (const kw of ["PIC16F1827", "STM32", "ZZZ999NOTAPART"]) {
  const res = await fetch(url + encodeURIComponent(kw), {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await res.text();
  const { total, results } = parseSearchHtml(html);
  console.log("=== " + kw + " (HTTP " + res.status + ", total=" + total + ") ===");
  for (const r of results) {
    console.log(
      "  " + (r.code || "?") + " | " + r.mpn + " | " +
        (r.stockText || "-") + " | qty=" + r.stock + " | " +
        r.prices.map((p) => p.start + "+:" + p.price).join(", ") +
        " | " + (r.productUrl || "-")
    );
  }
  if (!results.length) console.log("  (no results)");
}
