<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP04 — Installable PWA and safe updates

**Severity:** Medium — offline reliability and application identity

**Status:** Implemented (see Evidence)  
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

Verified on 2026-11-15 from the repository root (all commands below were run, output pasted
verbatim in the summaries).

### What shipped

- `web/public/manifest.webmanifest` — `id: "./"`, names, relative `start_url`/`scope` `"./"`,
  `display: standalone` + `display_override`, `#ffffff`/`#1a1d21` colours, four icons
  (`any` + `maskable`, 192/512) and an SPDX/provenance comment.
- `scripts/gen-icons.go` (`//go:build ignore`) — icon generator using only the Go standard
  library; `go run scripts/gen-icons.go` writes `web/public/icons/*.png`. Mark: neutral back panel,
  accent front panel, connector and dot, with 10 % inset for the maskable variants.
- `web/index.html` — relative manifest link, icon/apple-touch-icon links, two `theme-color` metas
  (light/dark) and a description; nothing external.
- `web/src/sw.ts` — scope-relative precache (`new URL(entry, sw.location)`), cache identity
  `panelcraft-shell-<hash>`, **no `skipWaiting()` on install**, `panelcraft:sw-activate` message
  activates, `activate` drops other shells, navigation is network-first with a cached shell
  fallback, out-of-scope requests (`/files/`) stay network-only. Workspace data never enters the SW.
- `vite.config.ts` — owned ~50-line plugin: precache list is derived from the emitted bundle
  (index, manifest, `assets/**`, `icons/**`), the cache version is the first 12 hex chars of the
  sha256 of that list, `sw.ts` is transpiled with `transformWithOxc` (`transformWithEsbuild` is
  deprecated in Vite 8 and emits nothing), and the worker is written next to the bundle that was
  actually produced (`writeBundle`'s `dir`), so `--outDir`/`--base` overrides stay correct.
- `web/src/pwa/updateController.ts` — waiting-worker state machine
  (`idle`/`available`/`deferred`/`applying`), `promptVisible()`, queue-while-busy, `later()`,
  `accept({force})` returning `applying`/`needs-confirmation`/`no-worker`, preparation before
  activation (a failed preparation keeps the old shell) and a reload that only fires after an
  explicit accept.
- `web/src/pwa/install.ts` — `beforeinstallprompt` capture with `preventDefault()`,
  `installed`/`ready`/`guidance` availability, prompt handling and `isStandalone()`.
- `web/src/sw-register.ts` — base-relative worker URL, offers an update only on a *controlled*
  page (a first visit may activate silently), keeps an already-waiting worker visible.
- `web/src/ui/usePwa.ts`, `useShellLifecycle.ts`, `UpdateBanner.tsx`, `Banners.tsx` (composition to
  stay inside the complexity gate), `appMenuEntries.ts` (install/restart entries), `AppHeader.tsx`.
- Chrome: the update banner uses the neutral banner surface, a filled primary Restart and a quiet
  Later (`--pc-button-primary-*`, `--pc-input-border`), 32 px targets.

### Tests

```text
$ npx vitest run web/src/pwa web/src/sw-register.test.ts web/src/ui/UpdateBanner.test.tsx \
    web/src/ui/appMenuEntries.test.ts
Test Files  5 passed (5)   Tests  38 passed (38)

$ npx vitest run            # whole suite
Test Files  108 passed (108)   Tests  1106 passed (1106)
```

New coverage: waiting/deferred/queued states, `Later`, one-shot reload, preparation failure,
unapplied-code confirmation, no reload on a worker `claim()`, `beforeinstallprompt` capture and
standalone detection, base-path worker URL, banner action ranking, menu entry availability.

### Browser checks

```text
$ npx playwright test            # built bundle, chromium
120 passed (44.8s)
```

`e2e/ux08-pwa.spec.ts` (new, serial) drives a real update: it rewrites the served `sw.js` bytes and
forces `registration.update()` (a `register()` right after the page's own claim is throttled by the
browser), then asserts the banner, Later, the menu offer, the single navigation on Restart with the
flushed object still in the document, and that playback queues the offer. It also asserts
**Chromium's own verdict**: `Page.getAppManifest` errors `[]` and `Page.getInstallabilityErrors`
`installabilityErrors: []`.

```text
$ npx playwright test e2e/ux08-pwa.spec.ts --workers 1
4 passed (5.4s)
```

Screenshots reviewed against the STYLE-GUIDE checklist: `ux08-update-banner-light.png`,
`ux08-update-banner-dark.png`, `ux08-app-menu-update.png` (artifact dir, gitignored). Review found
two defects, both fixed before commit: Restart and Later rendered identically (no primary/secondary
ranking — now a filled primary with a `banner-primary` class asserted in `UpdateBanner.test.tsx`),
and the banner's secondary action used a full-strength text-coloured border (now
`--pc-input-border`). Copy was tightened to *"Update available. Restart to load the new version, or
choose Later to keep working."* and the guidance entry renamed to **Install from browser menu**.

### Offline and base path

```text
$ npx playwright test e2e/m7-offline.spec.ts
2 passed   # offline reload + cache-first hashed assets; precache now also asserts
           # /manifest.webmanifest, /icons/icon-192.png, /icons/icon-512.png

$ npx vite build --base=/panelcraft/ --outDir dist-subpath
web/dist-subpath/{index.html,manifest.webmanifest,sw.js,assets/,icons/}
sw.js: CACHE = panelcraft-shell-0b0b5ae6937c, PRECACHE = ["./index.html", …]
index.html: href="./manifest.webmanifest", src="/panelcraft/assets/index-*.js"
```

Served `web/dist-subpath` at `/panelcraft/` and loaded it in Chromium:

```text
scope:      http://localhost:4199/panelcraft/
scriptURL:  http://localhost:4199/panelcraft/sw.js
baseURI:    http://localhost:4199/panelcraft/
offline reload: shell visible, 10 cache keys, first keys /panelcraft/{index.html,
                manifest.webmanifest, assets/…}
```

```bash
bash scripts/check-selfcontained.sh   # OK — no external-origin resource loads in web/dist
bash scripts/check-docs.sh            # OK — 9 docs, all links resolve, .pcd blocks valid
npm run check                         # tsc + tsc(sw) + eslint clean
go test ./... && staticcheck ./... && gocyclo -over 15 cmd internal web   # green
```

### Manual limitation

A real *standalone install* (clicking the install prompt in a headed browser and relaunching the
installed window) was **not** performed — headless Chromium cannot complete it. Installability is
instead asserted from Chromium's own CDP verdict (no manifest or installability errors), the
manifest/icon fetches, and unit coverage of the prompt and standalone-detection code paths.
