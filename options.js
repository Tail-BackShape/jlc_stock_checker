"use strict";

const DEFAULTS = {
  sources: { jlcpcb: true, akizuki: true, digikey: false },
  digikey: { clientId: "", clientSecret: "" },
};

async function load() {
  const { settings } = await chrome.storage.sync.get("settings");
  const s = {
    sources: { ...DEFAULTS.sources, ...((settings && settings.sources) || {}) },
    digikey: { ...DEFAULTS.digikey, ...((settings && settings.digikey) || {}) },
  };
  document.getElementById("src-jlcpcb").checked = !!s.sources.jlcpcb;
  document.getElementById("src-akizuki").checked = !!s.sources.akizuki;
  document.getElementById("src-digikey").checked = !!s.sources.digikey;
  document.getElementById("dk-client-id").value = s.digikey.clientId;
  document.getElementById("dk-client-secret").value = s.digikey.clientSecret;
}

async function save() {
  const settings = {
    sources: {
      jlcpcb: document.getElementById("src-jlcpcb").checked,
      akizuki: document.getElementById("src-akizuki").checked,
      digikey: document.getElementById("src-digikey").checked,
    },
    digikey: {
      clientId: document.getElementById("dk-client-id").value.trim(),
      clientSecret: document.getElementById("dk-client-secret").value.trim(),
    },
  };
  await chrome.storage.sync.set({ settings });
  const status = document.getElementById("status");
  status.textContent = "保存しました";
  setTimeout(() => (status.textContent = ""), 2000);
}

document.getElementById("save").addEventListener("click", save);
load();
