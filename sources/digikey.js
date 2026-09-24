// DigiKey official Product Information API v4.
// Requires a free DigiKey Developer account (client ID + secret), configured
// on the extension's options page. https://developer.digikey.com/

const TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";
const SEARCH_URL = "https://api.digikey.com/products/v4/search/keyword";
const LIMIT = 8;

let tokenCache = null; // { token, expiresAt }

async function getToken(clientId, clientSecret, signal) {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=client_credentials&client_id=" +
      encodeURIComponent(clientId) +
      "&client_secret=" +
      encodeURIComponent(clientSecret),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      "DigiKey auth failed: " + (json.ErrorMessage || "HTTP " + res.status)
    );
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 600) * 1000,
  };
  return tokenCache.token;
}

function pickProduct(p) {
  const breaks = Array.isArray(p.PriceBreaks)
    ? p.PriceBreaks.filter((b) => !b.IsUnavailable)
        .map((b) => ({
          start: b.BreakQuantity,
          end: -1,
          price: b.UnitPrice,
        }))
        .sort((a, b) => a.start - b.start)
        .slice(0, 6)
    : [];
  const status = p.ProductStatus && p.ProductStatus.Status;
  const discontinued = status === "Discontinued" || status === "Obsolete";
  return {
    code: p.DigiKeyProductNumber || null,
    mpn: p.ManufacturerProductNumber || "",
    brand: (p.Manufacturer && p.Manufacturer.Name) || "",
    name: p.ProductDescription || "",
    package: "",
    category:
      (p.Category && (p.Category.Name || p.Category.Value)) || "",
    stock:
      typeof p.QuantityAvailable === "number" ? p.QuantityAvailable : null,
    stockText: status || null,
    libType: null,
    currency: "JPY",
    prices: breaks,
    moq:
      typeof p.MinimumOrderQuantity === "number" && p.MinimumOrderQuantity > 1
        ? p.MinimumOrderQuantity
        : null,
    loss: null,
    datasheet: (p.Datasheet && p.Datasheet.DatasheetUrl) || null,
    image: p.PrimaryPhoto || null,
    productUrl: p.ProductUrl || null,
    canBuy: !discontinued && (p.QuantityAvailable ?? 0) >= 0,
    noBuyReason: discontinued ? status : null,
  };
}

export async function search(keyword, { signal, settings } = {}) {
  const clientId = settings && settings.digikey && settings.digikey.clientId;
  const clientSecret =
    settings && settings.digikey && settings.digikey.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error(
      "DigiKey API credentials not set. Open the extension options to add a Client ID and Secret (free at developer.digikey.com)."
    );
  }
  const token = await getToken(clientId, clientSecret, signal);
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      "X-DIGIKEY-Client-Id": clientId,
      "X-DIGIKEY-Locale-Site": "JP",
      "X-DIGIKEY-Locale-Language": "ja",
      "X-DIGIKEY-Locale-Currency": "JPY",
      "X-DIGIKEY-Locale-ShipToCountry": "JP",
    },
    body: JSON.stringify({ Keywords: keyword, Limit: LIMIT, Offset: 0 }),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      "DigiKey API error: " +
        (json.ErrorMessage || json.message || "HTTP " + res.status)
    );
  }
  const products = Array.isArray(json.Products) ? json.Products : [];
  return {
    total:
      typeof json.ProductsCount === "number" ? json.ProductsCount : products.length,
    results: products.slice(0, LIMIT).map(pickProduct),
  };
}

export const searchUrl = (keyword) =>
  "https://www.digikey.jp/ja/products/result?keywords=" + encodeURIComponent(keyword);
