// SPDX-License-Identifier: GPL-3.0-only

/**
 * Service-worker registration + update UX (M7-WP3, SPEC N8). Dev-safe:
 * registration only when a SW is actually served (production/preview builds
 * emit /sw.js; the vite dev server does not). When a new shell takes over,
 * `panelcraft:sw-update` arrives → banner event dispatches once.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // an update is waiting while the old SW still controls the page:
        // listen for takeover and surface it (banner text = user-facing)
        navigator.serviceWorker.addEventListener('message', (e) => {
          if (e.data === 'panelcraft:sw-update') {
            window.dispatchEvent(new CustomEvent('panelcraft:updated'));
          }
        });
        // probing a waiting worker's state is enough for the banner trigger;
        // actual takeover happens after reload (network-first index)
        if (reg.waiting) window.dispatchEvent(new CustomEvent('panelcraft:updated'));
      })
      .catch(() => {
        // no SW (dev server / insecure context) — the app is plain online
      });
  });
}
