const CACHE = 'zentia-v1';
const ASSETS = [
  '/n8nMapService/',
  '/n8nMapService/index.html',
  '/n8nMapService/icons/icon-192.png',
  '/n8nMapService/icons/icon-512.png',
  '/n8nMapService/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // n8n webhook은 캐시하지 않음 (항상 네트워크)
  if (e.request.url.includes('n8n.cloud') || e.request.url.includes('nominatim')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
