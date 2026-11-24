// SPDX-License-Identifier: GPL-3.0-only
//
// storage.ts — pin a legacy browser-storage spec to the IndexedDB backend.
//
// Since origin-private files became the preferred browser backend, a plain
// `page.goto('/')` no longer exercises IndexedDB. Specs whose whole point is
// that record (layout persistence, theme persistence, quota degradation) declare
// that intent instead of silently measuring a different store: the preferred
// backends are removed before the first script runs, so the app falls through to
// the legacy backend exactly as an older profile would.

/** Serialized into the page; must not reference module scope. */
export function legacyIndexedDbOnly(): void {
  Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined, configurable: true });
  Object.defineProperty(window, 'localStorage', {
    get() {
      throw new DOMException('blocked for a legacy-storage spec', 'SecurityError');
    },
    configurable: true,
  });
}
