const CACHE = 'cardswipe-shell-v6';
const CORE = ['./', './index.html', './styles.css', './app.js'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname === 'api.scryfall.com' || url.hostname.endsWith('scryfall.io')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, clone)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
