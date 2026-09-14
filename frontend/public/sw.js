// Frontline/offline support (12 Sep 2026) — UOS_Final.docx audit
// §"ground and frontline worker mobile mode". Hand-rolled, no build
// plugin: Vite content-hashes every built asset filename, so a
// cache-first strategy for /assets/* is safe forever (a cached file is
// either the exact file still being served, or gone from the manifest
// entirely) without this worker needing to know the hashed names ahead of
// time — it just caches whatever it's asked for, the first time it's
// asked for it.
//
// Deliberately does NOT intercept API requests (anything not same-origin,
// i.e. calls to the backend) — those stay real network requests that
// either succeed or fail normally. Offline handling for API calls is the
// app's own job (src/offline/syncManager.ts's outbox), not this worker
// pretending to serve a fake API response. This worker's only job is
// making the app shell itself (HTML/JS/CSS) load with zero connectivity,
// so a Frontline screen can open at all before syncManager's own cached
// reads (IndexedDB, not this Cache Storage) take over showing real data.
const CACHE_NAME = 'hostel-app-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin || event.request.method !== 'GET') return; // API calls and any non-GET pass straight through, untouched

  if (event.request.mode === 'navigate') {
    // App shell HTML: try the network first (so a normal online visit
    // always sees the latest deploy), fall back to whatever was last
    // cached if there's no connection at all.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/')))
    );
    return;
  }

  // Built, content-hashed assets (JS/CSS/fonts/images): cache-first — a
  // hit is always valid, a miss falls back to network and caches the
  // result for next time (including the very first, still-online visit).
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
    )
  );
});
