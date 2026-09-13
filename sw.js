const CACHE_NAME = 'rmusana-v1.2.2';
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
  // App code (same-origin JS/CSS/HTML): network-first so the running
  // bundle is always a consistent set from one deploy. Falls back to
  // cache when offline — mixed old/new modules can never execute.
  const isAppCode = url.origin === self.location.origin &&
    (event.request.destination === 'script' ||
      event.request.destination === 'style' ||
      event.request.mode === 'navigate' ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html'));
  if (isAppCode) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const network = fetch(event.request, { cache: 'no-cache' }).then((response) => {
          if (response && response.status === 200) cache.put(event.request, response.clone());
          return response;
        });
        const timeout = new Promise((resolve) => setTimeout(async () => {
          resolve(await caches.match(event.request));
        }, 4000));
        try {
          const res = await Promise.race([network, timeout]);
          if (res) return res;
        } catch {}
        return (await caches.match(event.request)) || network;
      })()
    );
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
