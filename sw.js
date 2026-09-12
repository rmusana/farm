const CACHE_NAME = 'rmusana-v1.2.0';
const ASSETS = [
  './',
  './index.html',
  './css/themes.css',
  './css/app.css',
  './css/layout.css',
  './css/components.css',
  './js/config.js',
  './js/app.js',
  './js/router.js',
  './js/api.js',
  './js/auth.js',
  './js/state.js',
  './js/datetime.js',
  './manifest.json',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.hostname.includes('google.com') || url.hostname.includes('googleapis.com') || url.hostname.includes('script.google')) {
    return;
  }
  // stale-while-revalidate with 3s network timeout
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request, { cache: 'no-cache' }).then((response) => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      // return cached instantly, update in background
      if (cached) return cached;
      return fetched;
    })
  );
});
