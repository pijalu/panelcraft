// SPDX-License-Identifier: GPL-3.0-only

/**
 * Service worker (M7-WP3, SPEC N8): offline app shell — precaches the whole
 * hashed bundle; user data never touches the SW (IDB stays page-owned).
 * Strategies: hashed assets → cache-first (immutable); index.html →
 * network-first with cache fallback (updates land on next reload);
 * everything else → network only. Update flow: new SW waits → skipWaiting
 * + clients.claim on install; a `version` banner in the app is notified via
 * the `panelcraft:sw-update` message when an update took over.
 *
 * Generated at build time by the inline vite plugin in vite.config.ts —
 * `__PRECACHE_MANIFEST__` is substituted with the hashed asset list.
 */
declare const __PRECACHE_MANIFEST__: string[];

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = 'panelcraft-shell-v1';
const PRECACHE: string[] = __PRECACHE_MANIFEST__;

sw.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // drop stale caches from previous shell versions
      for (const name of await caches.keys()) {
        if (name !== CACHE) await caches.delete(name);
      }
      await sw.clients.claim();
      // notify open pages that a new shell took over (update flow, N8)
      const clients = await sw.clients.matchAll({ type: 'window' });
      for (const client of clients) client.postMessage('panelcraft:sw-update');
    })(),
  );
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== sw.location.origin) return;

  // hashed, immutable asset → cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, res.clone());
        }
        return res;
      })(),
    );
    return;
  }

  // navigation / index → network-first, offline falls back to cached shell
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put('/index.html', res.clone());
        }
        return res;
      } catch {
        const hit = (await caches.match('/index.html')) ?? (await caches.match(event.request));
        if (hit) return hit;
        throw new Error('offline and no cached shell');
      }
    })(),
  );
});
