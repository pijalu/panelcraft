# Progressive web filesystem storage

Status: **fixed and validated**. Tracking item moved here from `bugs.md`.

## What was wrong

Static hosting always persisted in IndexedDB. Browsers that offer better local
backends were unused, a chosen device folder was session-scoped, and the Files panel
did not say where the files lived. Changing the default naively would have hidden
existing IndexedDB workspaces behind an empty new backend — which looks exactly like
data loss.

## What the fix guarantees

- Browser-only sessions pick one backend at startup: an explicitly authorized native
  directory, then the origin private file system, then Web Storage `localStorage`,
  then legacy IndexedDB, with memory as the final non-persistent safeguard.
- Selection is data-aware. Existing non-empty data in any tier beats an empty preferred
  backend, and a readable-but-corrupt record surfaces its own error instead of being
  skipped. Missing or denied APIs still fall through.
- No copying, migration or synchronization between backends, so an older release still
  finds its workspace (the rollback path). An active backend's save failure stays a
  visible error and never switches backends.
- A chosen folder is remembered in its own IndexedDB record and reused on later visits
  only while read/write permission is already granted. Otherwise the browser fallback
  stays active and **Reconnect local folder…** requests permission from that click; a
  page load never raises a permission prompt.
- **Open directory…**, **Reconnect local folder…** and **Use browser storage** live in
  the Files panel; every backend has its own label, and clear-data wording names the
  files it actually deletes.
- Static and direct-directory sessions still make no workspace network requests, and no
  dependency, CDN or third-party storage was added.

## Design

`StoragePort` stays snapshot-oriented; native handles, OPFS roots and permission checks
are separate capability ports. New adapters: `store/opfs.ts` (stable PanelCraft child
directory reusing the handle-backed reconciliation), `store/local.ts` (one namespaced
key, `decodeStored()`/`mapStoreError()`), `store/directoryHandles.ts` (handle metadata
only). `store/selection.ts` is the single composition root that owns the policy;
`ui/useStorageControls.ts` is the one shell seam, so no component knows the chain.

## Evidence

- `npx vitest run web/src/workspace/store --coverage.enabled=false` — 95 tests pass,
  including every row of the selection matrix (server marker short-circuit, granted
  handle, `prompt` without a startup request, denied/ unreadable handle, existing OPFS
  over lower tiers, existing `localStorage` over empty OPFS, non-empty legacy IndexedDB
  over empty preferred tiers, empty-profile order, unavailable vs corrupt, and no
  fallback on save rejection).
- `npx playwright test e2e/storage-browser.spec.ts` — 7 browser scenarios pass: static
  origin-private files without API calls, OPFS edit survives reload, Web Storage
  fallback and reload, legacy IndexedDB retained while preferred tiers exist but stay
  empty, native folder cancel/select/edit/remember, lapsed permission fallback without
  prompting plus reconnect grant/denial, and the explicit switch back to browser files.
- Full gates: `npm run check`, `npm test` (166 files, 1816 tests),
  `npm run test:perf`, `npm run build`, `npx playwright test` (274 passed),
  `go vet ./...`, `staticcheck ./...`, `go test -count=1 -race -cover ./...`,
  `gocyclo -over 15 cmd internal web` (no findings), `bash scripts/check-docs.sh`,
  `bash scripts/check-selfcontained.sh`, `git diff --check`.
- Screenshot review (light and dark) of `storage-opfs-*`, `storage-directory-*`,
  `storage-directory-clear-dark`: labels are readable and truthful, buttons meet the
  32 px target with visible focus, the explanation wraps instead of clipping, and no
  layout shift appeared. Review found the storage actions were using unstyled browser
  buttons; token-based `.storage-action`/`.storage-hint` styles were added and the
  captures re-shot.

## Two defects found by the browser run

- `defaultOpfsRoot()` read `globalThis.storage` instead of `navigator.storage`, so OPFS
  was never offered in a real browser and every profile silently fell through to Web
  Storage. Fixed, with a regression test.
- A fresh origin-private directory returned an empty workspace record, so a first visit
  showed "no open files" instead of bootstrapping the first document. OPFS now reports
  no record while untouched; a chosen device folder keeps the opposite behaviour so an
  empty folder never gains a file just by being opened.

## Not verified

- Real operating-system picker behaviour (the modal itself) is unexercised: browser
  tests drive `showDirectoryPicker` with real OPFS-backed handles. Manual Chrome/Edge
  exercise is still the only way to confirm the OS dialog.

## Rollback

No migration or deletion is included, so the previous release still reads its IndexedDB
workspace. Native handles are metadata; forgetting one never deletes device files.
