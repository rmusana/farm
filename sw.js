const CACHE_NAME = 'rmusana-v1.2.1';
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
  './js/escape.js',
  './components/Form.js',
  './components/Topbar.js',
  './components/KPI.js',
  './components/Toast.js',
  './components/Modal.js',
  './components/Charts.js',
  './components/DataTable.js',
  './components/Sidebar.js',
  './pages/Dashboard.js',
  './pages/Operations.js',
  './pages/Finance.js',
  './pages/Reports.js',
  './pages/Alerts.js',
  './pages/Documents.js',
  './pages/Settings.js',
  './pages/Login.js',
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
  // Never cache third-party backends, CDNs, fonts, or auth endpoints
  if (url.hostname === 'script.google.com'
    || url.hostname.endsWith('.googleapis.com')
    || url.hostname.endsWith('.gstatic.com')
    || url.hostname === 'accounts.google.com'
    || url.hostname === 'cdn.jsdelivr.net'
    || url.hostname === 'unpkg.com') {
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
