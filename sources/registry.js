// Source registry. Each source: { id, label, search(keyword, ctx), searchUrl(keyword) }
import * as jlcpcb from "./jlcpcb.js";
import * as akizuki from "./akizuki.js";
import * as digikey from "./digikey.js";

export const SOURCES = {
  jlcpcb: { id: "jlcpcb", label: "JLCPCB", ...jlcpcb },
  akizuki: { id: "akizuki", label: "秋月", ...akizuki },
  digikey: { id: "digikey", label: "DigiKey", ...digikey },
};

// Search-page URL templates shown as the footer link ("{q}" is replaced).
export const URL_TEMPLATES = {
  jlcpcb: "https://jlcpcb.com/parts/componentSearch?searchTxt={q}",
  akizuki:
    "https://akizukidenshi.com/catalog/goods/search.aspx?search=keyword&keyword={q}",
  digikey: "https://www.digikey.jp/ja/products/result?keywords={q}",
};

export const DEFAULT_SETTINGS = {
  sources: { jlcpcb: true, akizuki: true, digikey: false },
  digikey: { clientId: "", clientSecret: "" },
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get("settings");
  const s = stored.settings || {};
  return {
    sources: { ...DEFAULT_SETTINGS.sources, ...(s.sources || {}) },
    digikey: { ...DEFAULT_SETTINGS.digikey, ...(s.digikey || {}) },
  };
}

export function enabledSources(settings) {
  return Object.values(SOURCES).filter((s) => settings.sources[s.id]);
}
