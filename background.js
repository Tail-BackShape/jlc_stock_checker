// JLCPCB Parts Quick Look - service worker.
// Routes search requests to per-vendor source modules and normalizes results.

"use strict";

import {
  SOURCES,
  URL_TEMPLATES,
  getSettings,
  enabledSources,
} from "./sources/registry.js";

const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const cache = new Map(); // source:keyword -> { at, result }

async function runSearch(source, keyword, settings) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const { total, results } = await source.search(keyword, {
      signal: controller.signal,
      settings,
    });
    return { ok: true, total, results };
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

function cachedSearch(source, keyword, settings) {
  const key = source.id + ":" + keyword.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Promise.resolve(hit.result);
  }
  return runSearch(source, keyword.trim(), settings).then((result) => {
    if (result.ok) {
      cache.set(key, { at: Date.now(), result });
      if (cache.size > CACHE_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value);
      }
    }
    return result;
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "JLC_SOURCES") {
    getSettings()
      .then((settings) => {
        sendResponse({
          ok: true,
          sources: enabledSources(settings).map((s) => ({
            id: s.id,
            label: s.label,
            urlTemplate: URL_TEMPLATES[s.id] || "",
          })),
        });
      })
      .catch(() => sendResponse({ ok: false, sources: [] }));
    return true;
  }

  if (msg.type === "JLC_SEARCH" && typeof msg.keyword === "string") {
    const keyword = msg.keyword.trim();
    const source = SOURCES[msg.source] || SOURCES.jlcpcb;
    if (!keyword) {
      sendResponse({ ok: false, error: "Empty keyword" });
      return false;
    }
    getSettings()
      .then((settings) => cachedSearch(source, keyword, settings))
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: (err && err.message) || "Request failed",
        })
      );
    return true; // async response
  }

  return false;
});
