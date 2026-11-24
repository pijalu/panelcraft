// SPDX-License-Identifier: GPL-3.0-only

/**
 * Service worker (M7-WP3 + UX08-WP04, SPEC N8): offline app shell — precaches the
 * whole hashed bundle; user data never touches the SW (IDB stays page-owned).
 * Strategies: hashed assets → cache-first (immutable); navigation → network-first
 * with the cached shell as fallback; everything else → network only.
 *
 * Update flow (consented, never silent):
 *   install → precache, then WAIT (no skipWaiting) so the running editor keeps its
 *             controller and unsaved buffers;
 *   page     → sees `registration.waiting`, offers "Update available";
 *   accept   → page flushes its own state, posts {type:'panelcraft:sw-activate'},
 *             we skipWaiting + claim, and the page reloads once on
 *             controllerchange.
 *
 * Every URL is resolved against the worker's own scope, so a build under a
 * sub-path (`--base=/panelcraft/`) precaches and serves the same way as one at /.
 *
 * Generated at build time by the inline vite plugin in vite.config.ts: the
 * precache manifest (scope-relative hashed assets, manifest, icons) and the
 * cache version (a content hash of that list) are substituted in place of the
 * ambient declarations below.
 */
declare const __PRECACHE_MANIFEST__: string[];
declare const __SHELL_VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `panelcraft-shell-${__SHELL_VERSION__}`;
const PRECACHE: string[] = __PRECACHE_MANIFEST__;
const SHELL = new URL('index.html', sw.location.href).href;

/** Resolve a manifest entry (scope-relative) to an absolute URL. */
const abs = (path: string): string => new URL(path, sw.location.href).href;

sw.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map(abs));
      // No skipWaiting: the page decides when to take the update (WP04).
    })(),
  );
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // Drop every shell cache from another build; workspace data is not here.
      for (const name of await caches.keys()) {
        if (name.startsWith('panelcraft-shell-') && name !== CACHE) await caches.delete(name);
      }
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event: ExtendableEvent) => {
  const data = (event as unknown as MessageEvent).data as { type?: string } | undefined;
  if (data?.type !== 'panelcraft:sw-activate') return;
  event.waitUntil(sw.skipWaiting());
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== sw.location.origin) return;
  // Anything outside this worker's scope (e.g. /files/*) stays network-only.
  const scope = new URL('./', sw.location.href).pathname;
  if (!url.pathname.startsWith(scope)) return;
  // Workspace revisions must always reach their server; never answer from a shell cache.
  if (url.pathname.startsWith(`${scope}api/`)) return;

  // hashed, immutable asset → cache-first
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          void cache.put(event.request, res.clone());
        }
        return res;
      })(),
    );
    return;
  }

  // navigation / index → network-first, offline falls back to the cached shell
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(event.request);
        if (res.ok && event.request.mode === 'navigate') {
          const cache = await caches.open(CACHE);
          void cache.put(SHELL, res.clone());
        }
        return res;
      } catch {
        // Icons and the manifest are precached outside /assets/: return their own
        // responses offline. Only a navigation may fall back to the HTML shell.
        const hit = await caches.match(event.request);
        if (hit) return hit;
        if (event.request.mode === 'navigate') {
          const shell = await caches.match(SHELL);
          if (shell) return shell;
        }
        throw new Error('offline and no matching cached response');
      }
    })(),
  );
});
