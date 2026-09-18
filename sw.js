/* ==========================================================================
   BONGSHAI STEEL — PWA SERVICE WORKER (OFFLINE ENGINE)
   ========================================================================== */

const CACHE_NAME = 'bongshai-steel-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/apply.js',
  '/app.js',
  '/data/content.default.json',
  '/manifest.json',
  '/llms.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET. Never touch the CMS API or admin area (POST uploads/saves,
  // session cookies) — let those go straight to the network.
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('/admin/') !== -1) return;

  // Network first, fallback to cache for offline availability
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});
