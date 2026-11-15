<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP04 — Installable PWA and safe updates

**Severity:** Medium — offline reliability and application identity

**Status:** Proposed  
**Requirement:** added application/PWA scope  
**Depends on:** WP01 for the install action and WP03 for final shell styling  
**Branch:** `feat/ux08-installable-pwa`

## Single-task outcome

Make PanelCraft installable as a standalone, offline-capable PWA with local icons and an explicit
update/restart action. Do not add native wrappers, File System Access or remote persistence.

## Evidence and UX rationale

`web/src/sw.ts` precaches the shell, but `web/index.html` has no manifest/icons/install UX.
`sw-register.ts` registers root-absolute `/sw.js`; `sw.ts:21-29` calls `skipWaiting` immediately,
so there is no real user-consented update. Goal-Gradient and Flow require truthful status and no
unexpected reload or lost editing context.

## Implementation steps

1. Add a base-aware `manifest.webmanifest` with stable ID, names, relative `start_url`/`scope`,
   `display: standalone`, theme/background colors and local 192/512 px any/maskable icons. Record
   asset provenance. Use checked-in assets or existing tooling; no new dependency without ADR.
2. Replace root-absolute manifest/SW/cache assumptions with Vite base-path-safe URLs. Verify Go
   serving at `/` and static hosting under `/panelcraft/`. Include manifest/icons in precache.
3. Capture `beforeinstallprompt` where supported. Show **Install application** in the app menu
   only when useful; otherwise provide on-demand browser install guidance. Hide it in standalone
   mode and never block startup with an install nag.
4. Change updates to a waiting-worker model. Surface non-blocking **Update available — Restart /
   Later**. Queue the prompt during presentation rather than interrupting playback.
5. On Restart, call an application preparation port that flushes IndexedDB and preserves or
   resolves unapplied CodeMirror buffers. If unsaved work cannot be preserved, require explicit
   confirmation. Then activate the waiting worker and reload once on controller change.
6. Derive cache identity from build content, remove stale caches and keep workspace data out of
   the service worker. No external request may be added.

## Required checks

```bash
npx vitest run web/src/sw-register.test.ts
npm run check
npm run build
npx playwright test e2e/m7-offline.spec.ts e2e/s7-smoke.spec.ts
bash scripts/check-selfcontained.sh
```

Add tests for manifest URLs/icons, waiting update defer/accept, dirty-work preparation and one-
shot reload. Use Chromium DevTools manifest/installability inspection where available; perform a
real standalone install smoke if the environment supports it, otherwise mark that part unverified.

## Acceptance

- Manifest/installability inspection has no blocking errors; standalone display and icons resolve
  under root and non-root base paths.
- Offline reload restores the app shell and browser-local workspace with external requests blocked.
- Update defer does not reload; accept preserves work and reloads once. No update prompt steals
  presentation focus.
- No server storage, external assets, telemetry or automatic update reload.

## Evidence

Pending. Record manifest inspection, offline/update E2E, base-path build evidence and any manual
install limitation here.
