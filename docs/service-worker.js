/*
  Daily Briefing service worker.
  Strategy:
    - App shell (HTML/CSS/JS/fonts/icons): cache-first
    - Data (news.json, theory.json): network-first, cache fallback
    - Navigations: network-first, offline fallback to cached index.html
*/

const VERSION = 'v1-2026-09-20';
const SHELL_CACHE = `shell-${VERSION}`;
const DATA_CACHE = `data-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/push.js',
  './fonts/Carlito-Regular-latin.woff2',
  './fonts/Carlito-Regular-latin-ext.woff2',
  './fonts/Carlito-Bold-latin.woff2',
  './fonts/Carlito-Bold-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll is atomic — if one asset 404s the whole install fails.
      // We use individual adds so a missing optional asset (font, icon) does not brick install.
      Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn('SW skip cache:', url, err.message))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Data files: network-first
  if (url.pathname.endsWith('/data/news.json') || url.pathname.endsWith('/data/theory.json')) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // Navigations: network-first with offline fallback to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (shell assets): cache-first
  event.respondWith(cacheFirst(req, SHELL_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Push handler (used from M7 onward; safe to have now)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Daily Briefing', body: 'New briefing available' };
  }
  const title = data.title || 'Daily Briefing';
  const options = {
    body: data.body || 'New briefing available',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
