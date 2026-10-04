// ===============================================================
// K3 SAFETY MANAGEMENT SYSTEM - SERVICE WORKER
// Enables 100% Offline Operation for Mining & Industrial Field Teams
// ===============================================================

const CACHE_NAME = 'k3-safety-v1.1';

// Core shell and external CDN resources to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js'
];

// Domains eligible for runtime caching
const RUNTIME_CACHE_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
];

// 1. INSTALL LIFECYCLE
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[K3 ServiceWorker] Precaching App Shell and Offline Assets...');
      for (const asset of PRECACHE_ASSETS) {
        try {
          const response = await fetch(asset, { mode: asset.startsWith('http') ? 'cors' : 'same-origin' });
          if (response && (response.ok || response.type === 'opaque')) {
            await cache.put(asset, response);
          }
        } catch (err) {
          console.warn('[K3 ServiceWorker] Precache failed for:', asset, err);
        }
      }
    })
  );
});

// 2. ACTIVATE LIFECYCLE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[K3 ServiceWorker] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH STRATEGY
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Navigation Request (HTML page)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[K3 ServiceWorker] Offline fallback for navigation request');
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return caches.match('/index.html') || caches.match('/');
        })
    );
    return;
  }

  // CDN, Fonts, Scripts, Styles, and Images
  const isCdn = RUNTIME_CACHE_HOSTS.some(host => url.hostname.includes(host));
  const isLocalAsset = url.origin === self.location.origin;

  if (isCdn || isLocalAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// 4. MESSAGE EVENT LISTENER
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'GET_CACHE_STATS') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      if (event.source) {
        event.source.postMessage({
          type: 'CACHE_STATS_RESPONSE',
          cacheName: CACHE_NAME,
          itemCount: keys.length,
          timestamp: Date.now()
        });
      }
    });
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      if (event.source) {
        event.source.postMessage({
          type: 'CACHE_CLEARED_RESPONSE',
          success: true
        });
      }
    });
  }
});
