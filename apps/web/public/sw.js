// OverGarden service worker — INTENTIONALLY EMPTY (PWA carcass, Phase 5).
//
// It registers, installs, and activates, but does NO caching and NO offline
// queueing. The offline-capture write queue (service worker + IndexedDB) is a
// separate, deliberate task — do not add fetch/caching logic here without it.
self.addEventListener("install", () => {
  // Activate this SW immediately on first install.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of open clients without requiring a reload.
  event.waitUntil(self.clients.claim());
});

// No "fetch" handler on purpose — requests go straight to the network.
