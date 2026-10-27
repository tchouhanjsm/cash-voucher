// Cache only the public application shell. Never cache arbitrary same-origin GETs.
const C = 'cv2-v33';
const F = [
  './',
  'index.html',
  'style.css',
  'frontend-ui-kit.css',
  'config.js',
  'manifest.webmanifest',
  'frontend/main.js',
  'frontend/core/actions.js',
  'frontend/core/api.js',
  'frontend/core/dom.js',
  'frontend/core/form-options.js',
  'frontend/core/pwa.js',
  'frontend/core/state.js',
  'frontend/core/unsaved-work.js',
  'frontend/core/storage.js',
  'frontend/core/theme.js',
  'frontend/core/ui.js',
  'frontend/core/utils.js',
  'frontend/core/offline-queue.js',
  'frontend/core/offline-auth.js',
  'frontend/core/recovery-validation.js',
  'frontend/features/administration.js',
  'frontend/features/auth.js',
  'frontend/features/bulk.js',
  'frontend/features/cash-close.js',
  'frontend/features/dashboard.js',
  'frontend/features/navigation.js',
  'frontend/features/onboarding.js',
  'frontend/features/payments.js',
  'frontend/features/printing.js',
  'frontend/features/register.js',
  'frontend/features/reports.js',
  'frontend/features/shell.js',
  'icons/logo.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

const SCOPE_URL = new URL(self.registration.scope);
const APP_SHELL_URL = new URL('index.html', SCOPE_URL).href;
const APP_ROOT_PATH = new URL('./', SCOPE_URL).pathname;
const APP_SHELL_PATH = new URL('index.html', SCOPE_URL).pathname;
const SHELL_URLS = new Set(F.map((asset) => new URL(asset, SCOPE_URL).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(C);
        await cache.addAll(F);
      } catch (error) {
        // A partial new shell must not replace the last working worker.
        await caches.delete(C).catch(() => {});
        throw error;
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('cv2-v') && name !== C)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAppShellNavigation(url) {
  return (
    url.origin === SCOPE_URL.origin &&
    !url.search &&
    (url.pathname === APP_ROOT_PATH || url.pathname === APP_SHELL_PATH)
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && response.status === 200 && isAppShellNavigation(url)) {
            try {
              const cache = await caches.open(C);
              await cache.put(APP_SHELL_URL, response.clone());
            } catch {
              // The live page remains usable if Cache Storage cannot be refreshed.
            }
          }
          return response;
        } catch (error) {
          const cachedShell = await caches.match(APP_SHELL_URL);
          if (cachedShell) return cachedShell;
          throw error;
        }
      })(),
    );
    return;
  }

  // Only exact, query-free shell assets may use the app cache. API and other
  // same-origin resources pass through the browser's normal network path.
  if (!SHELL_URLS.has(url.href)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.status === 200) {
          try {
            const cache = await caches.open(C);
            await cache.put(request, response.clone());
          } catch {
            // Do not fail a successful network request because caching failed.
          }
        }
        return response;
      } catch (error) {
        const cachedAsset = await caches.match(request);
        if (cachedAsset) return cachedAsset;
        throw error;
      }
    })(),
  );
});
