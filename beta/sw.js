/* Wishwell service worker: keeps the app working offline.
   Bump VERSION whenever you change any file so phones pick up the update. */
const VERSION = "wishwell-beta-v12";
const FILES = ["./", "index.html", "config.js", "manifest.webmanifest", "img/mark.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("wishwell-beta-") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) {
    // Fonts: cache after first load. Everything else from other sites (AI service, stores) goes straight to the network.
    if (u.hostname.endsWith("fonts.googleapis.com") || u.hostname.endsWith("fonts.gstatic.com")) {
      e.respondWith(caches.open(VERSION).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { c.put(r, res.clone()); return res; }))));
    }
    return;
  }
  // Settings file: network first so config changes show right away, cache when offline.
  if (u.pathname.endsWith("/config.js")) {
    e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r, copy)); return res; })
      .catch(() => caches.match(r)));
    return;
  }
  // Pages: network first so updates show, cache when offline. Other files: cache first.
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html")));
  } else {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
  }
});
