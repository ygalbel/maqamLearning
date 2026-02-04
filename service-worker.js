const CACHE_NAME = "maqam-pwa-v1";

const normalizeBase = (base) => (base.endsWith("/") ? base : `${base}/`);

function getBasePath() {
  try {
    const base = new URL(self.registration.scope).pathname;
    return normalizeBase(base || "/");
  } catch {
    return "/";
  }
}

function getCoreAssets() {
  const base = getBasePath();
  const withBase = (path) => `${base}${path}`;
  return [
    base,
    withBase("index.html"),
    withBase("app.js"),
    withBase("config.js"),
    withBase("data.js"),
    withBase("audio.js"),
    withBase("i18n.json"),
    withBase("maqam-compact.json"),
    withBase("manifest.json"),
    withBase("favicon.svg"),
    withBase("icons/icon-192.svg"),
    withBase("icons/icon-512.svg")
  ];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(getCoreAssets()))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(getBasePath()).then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
