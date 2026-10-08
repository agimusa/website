/* AGIM service worker: offline shell + runtime caching.
   Bump VERSION whenever the precached files change so visitors get the update. */
const VERSION = 'agim-v1';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const FONT_CACHE = VERSION + '-fonts';

const SHELL = [
  './',
  'index.html',
  'past-events.html',
  'offline.html',
  'manifest.webmanifest',
  'assets/logo.png',
  'assets/favicon.png',
  'assets/pastor_jerry.jpg',
  'assets/pastor_elizabeth.jpg',
  'assets/dr-swapna-1.jpg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page navigations: network first, fall back to cache, then the offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)); }
          return res;
        })
        .catch(async () => {
          return (await caches.match(req, { ignoreSearch: true })) ||
                 (await caches.match('index.html')) ||
                 (await caches.match('offline.html'));
        })
    );
    return;
  }

  // Google Fonts: cache so type stays correct offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }

  // Our own files (images, icons, manifest): serve fast from cache, refresh in background.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
  }
  // Everything else (YouTube streams etc.) goes straight to the network.
});
