import { DATA_URL, I18N_URL } from "./config.js";

async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== "object") throw new Error(`${url} JSON is not an object`);
  return json;
}

export function loadData() {
  return loadJson(DATA_URL);
}

export function loadTranslations() {
  return loadJson(I18N_URL);
}
