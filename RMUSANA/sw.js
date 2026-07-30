const CACHE_NAME = 'rmusana-v1.0.0';
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
  './manifest.json',
  './assets/icons/favicon.svg'
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
  // Never cache API / Apps Script
  if (url.hostname.includes('google.com') || url.hostname.includes('googleapis.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
