/* Wishwell Advent: keeps the calendar and games working offline. Bump VERSION when any file here changes. */
const VERSION = "wishwell-advent-v2";
const FILES = ["./", "index.html", "advent.css", "advent.js", "../img/mark.png", "../icons/favicon-32.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("wishwell-advent-") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) {
    if (u.hostname.endsWith("fonts.googleapis.com") || u.hostname.endsWith("fonts.gstatic.com"))
      e.respondWith(caches.open(VERSION).then(c => c.match(r).then(hit => hit || fetch(r).then(res => { c.put(r, res.clone()); return res; }))));
    return;
  }
  // Network first so updates show right away; cache when offline.
  e.respondWith(fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(r.mode === "navigate" ? "index.html" : r, copy)); } return res; })
    .catch(() => caches.match(r.mode === "navigate" ? "index.html" : r).then(hit => hit || caches.match(r, { ignoreSearch: true }))));
});
