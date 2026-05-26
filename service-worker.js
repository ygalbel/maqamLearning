// Kill-switch service worker.
//
// The old player (app.html) registered a service worker at this scope and
// precached the old app. The site has since migrated: the landing pages live
// at the root and the rebuilt app lives under /app/ (with its own worker).
// This replacement unregisters the stale worker and purges its caches so
// returning visitors are not served outdated, cached pages.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
