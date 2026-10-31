// Imported by the generated service worker. When this worker REPLACES an older one,
// reload the open pages once it has taken over so nobody keeps looking at a stale shell.
let upgrading = false;
self.addEventListener('install', () => {
  upgrading = !!self.registration.active;
});
self.addEventListener('activate', (event) => {
  if (!upgrading) return;
  // Do NOT wait for the navigation inside waitUntil: the navigation is served by this very
  // worker, which is not active until activation finishes (deadlock). Fire and forget.
  event.waitUntil(
    self.clients.claim().then(() => {
      void self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const c of clients) c.navigate(c.url).catch(() => undefined);
      });
    }),
  );
});
