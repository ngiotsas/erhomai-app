const CACHE_VERSION = 'erhomai-v1';
const lastRefreshed = new Map();
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CORE_URLS = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/icon.svg',
  '/icon-maskable.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/assets/maplibre-gl-shared.mjs',
  '/assets/maplibre-gl-worker.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(CORE_URLS.map((url) => cache.add(url)));
    const html = await fetch('/index.html').catch(() => null);
    if (html && html.ok) {
      const text = await html.text();
      const assetRe = /(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g;
      let match;
      while ((match = assetRe.exec(text)) !== null) {
        await cache.add(match[1]).catch(() => {});
      }
    }
    await cache.put('/index.html', html ?? new Response('', { status: 503 }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== CACHE_VERSION)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) {
        const last = lastRefreshed.get(request.url) ?? 0;
        if (Date.now() - last > REFRESH_INTERVAL_MS) {
          lastRefreshed.set(request.url, Date.now());
          event.waitUntil(fetch(request).then((res) => {
            if (res.ok) return cache.put(request, res.clone());
          }).catch(() => {}));
        }
        return cached;
      }
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        const cached = await cache.match(request)
          ?? await cache.match('/index.html')
          ?? await cache.match('/');
        if (cached) return cached;
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  })());
});
