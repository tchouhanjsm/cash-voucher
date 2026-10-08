// App-shell cache only. API calls (POST) are never cached.
const C = 'cv2-v3',
  F = [
    './',
    'index.html',
    'style.css',
    'config.js',
    'manifest.webmanifest',
    'frontend/main.js',
    'frontend/core/actions.js',
    'frontend/core/api.js',
    'frontend/core/dom.js',
    'frontend/core/form-options.js',
    'frontend/core/state.js',
    'frontend/core/storage.js',
    'frontend/core/ui.js',
    'frontend/core/utils.js',
    'frontend/core/offline-queue.js',
    'frontend/features/administration.js',
    'frontend/features/auth.js',
    'frontend/features/bulk.js',
    'frontend/features/dashboard.js',
    'frontend/features/navigation.js',
    'frontend/features/payments.js',
    'frontend/features/printing.js',
    'frontend/features/register.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/maskable-512.png',
  ];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(C)
      .then((c) => c.addAll(F))
      .catch(() => {}),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x))))
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r)
      .then((res) => {
        if (res.ok) {
          const cp = res.clone();
          caches.open(C).then((c) => c.put(r, cp));
        }
        return res;
      })
      .catch(() => caches.match(r).then((m) => m || caches.match('index.html'))),
  );
});
