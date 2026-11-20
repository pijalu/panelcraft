# Pluggable workspace storage: server files, browser directories, and Git

Status: **closed — filesystem MVP and optional browser-directory adapter implemented and validated on 2026-11-20. Local Git is the next backend; remote Git is design-only.**

## Observed

- `web/src/workspace/store/port.ts` already defined a useful `StoragePort` seam, but its
  contract was documented as browser-only. `useWorkspace` selected IndexedDB directly,
  and leaving private mode also selected IndexedDB, so another backend would not survive
  that lifecycle transition.
- The Go server exposed only the embedded application and optional read-only `/files/*`
  responses. It had no workspace API or storage port.
- The product specification and ADR-0003 explicitly forbade server persistence. This
  feature was an intentional product decision, so those contracts changed with the code.
- Static hosting had to avoid probing a nonexistent API. GitHub Pages and offline operation
  continue to use IndexedDB without runtime API requests.
- A browser-only build can access a user-selected local directory through the File System
  Access API. This requires a secure context, an explicit picker gesture, and a supporting
  browser. It remains optional rather than replacing IndexedDB.

## Accepted behavior

1. `panelcraft serve -local DIR` starts with real file-backed workspace storage.
   `-storage-type filesystem` is explicit and `filestorage` is accepted as an alias.
   Omitting `-local` preserves browser storage and read-only positional `DIR` behavior.
2. `-depth N` limits visible and mutable descendants. `0` permits root files only, `1`
   permits one directory level, and omitted/`-1` is unlimited. Content below the limit is
   neither listed nor changed.
3. All server file access remains below the canonical `-local` root, including symlink and
   rename paths. `.git`, PanelCraft metadata, non-regular files, binary/non-UTF-8 files,
   and the reserved ZIP manifest are not exposed as workspace documents.
4. The server and browser speak a versioned, same-origin workspace API. Server selection
   is advertised in served HTML so static builds make no discovery request. Writes use an
   optimistic revision token, so an external edit is a conflict rather than a lost update.
5. Workspace files remain ordinary UTF-8 files in `DIR`. Open tabs, workspace display name,
   and UI settings use `.panelcraft/workspace.json`; this metadata is hidden from the
   document tree. Clearing server or directory storage retains typed confirmation and
   states that real files will be deleted.
6. The TypeScript storage port remains the common contract. HTTP, IndexedDB, memory, and
   browser-directory implementations are interchangeable. Backend selection and
   private-mode restoration do not import a concrete backend into the workspace manager.
7. A supported browser exposes **Open local folder…** under File & data. Choosing a folder
   switches the active workspace only after a successful picker and load; cancelling leaves
   the current workspace untouched. Unsupported browsers do not show the command. This
   browser-only path makes no network request.
8. The Files panel names non-default storage. Save/open failures remain visible and no save
   failure is reported as success. Browser-directory selection is session-scoped: after a
   reload, use **Open local folder…** again. No silent fallback copies a directory workspace
   into IndexedDB or vice versa.
9. Local Git will implement the same Go store contract and add a separate optional
   version-history port. Remote Git remains planned only; no credentials, push, pull,
   clone, or GitHub integration were implemented.

## Architecture and SOLID decisions

- Kept the existing snapshot-oriented `StoragePort` for the UI, avoiding separate canvas,
  tab, import, and tree logic per backend. Saves serialize through the existing autosaver.
- Added a Go `storage.Store` contract for load, compare-and-save, and clear. The filesystem
  implementation owns path policy and persistence; HTTP handlers own transport status;
  CLI composition owns backend selection.
- Kept optional version control behind `VersionStore`, separate from the basic storage
  contract. Filesystem and browser stores need not invent Git history operations.
- Injected `fetch`, directory-picker/handle access, clocks where needed, and filesystem
  roots in tests. Core workspace behavior remains independent of HTTP, IndexedDB, and
  browser directory APIs.
- Preserved a single writer per browser through the autosaver and compare revisions in the
  server store. The API does not claim multi-user collaboration or transactional rollback.
- Restricted the writable server to loopback. The default listen address is
  `127.0.0.1:8080`; non-loopback writable listeners are rejected until authentication and
  authorization exist. Existing read-only serving can still use an explicit address.

## API contract

- `GET /api/v1/workspace` returns `200` with stored-workspace JSON and a strong `ETag`;
  `404` when no server store is configured.
- `PUT /api/v1/workspace` with JSON and `If-Match` returns `204` and a new `ETag`; `400`
  for invalid records, `403` for root/depth violations, `409` for stale revisions, `413`
  for oversized requests, and `428` when the precondition is missing.
- `DELETE /api/v1/workspace` with `If-Match` returns `204` and a new `ETag`. It deletes only
  visible workspace content and PanelCraft metadata, never `.git` or out-of-depth content.
- API responses use `Cache-Control: no-store`; the service worker never caches workspace
  API requests. Mutations require JSON where applicable plus a non-simple request header,
  so a cross-origin form cannot modify local files. Request bodies are capped at 32 MiB.
- `<meta name="panelcraft-storage" content="filesystem">` advertises the configured
  backend. A static bundle has no marker and selects IndexedDB directly.

## Findings and fixes during implementation

- A storage test initially intersected memory and server literal kinds, producing a
  `never` type. Replaced it with a delegated `StoragePort` fixture.
- Storage UI regression tests initially failed because storage errors, backend labels,
  backend-specific clear copy, and a separate save-error banner did not exist. Implemented
  those behaviors rather than weakening the assertions.
- Asynchronous clearing initially left the existing App test observing an open dialog.
  The test now waits for actual dialog removal; the implementation closes only after
  successful persistence and reports failures.
- Extracted directory-open handling to keep App within the function-length gate.
- Browser-directory E2E exposed repeated `not-found: untitled.pcd` errors after backend
  replacement. A previous render's import-ghost effect could run after the tree changed.
  Added a manager membership guard and a regression test proving stale `old.pcd` ghosts
  are cleared.
- Server lifecycle E2E initially polled a synchronous file read that could throw `ENOENT`.
  Polling existence first fixed the test harness. Assertions now check the actual contract
  — creation, rename, deletion, and reload — without assuming whether a newly created empty
  document contains zero bytes or a canonical PDL header.
- Real-server smoke harness failures came from shell escaping and a platform `awk` that
  ignored `IGNORECASE`. Replaced the parsing with Node and case-normalized header matching;
  the corrected smoke passed against actual files.
- Screenshot review found a conflict banner alongside a misleading **Saved** status and a
  raw `conflict:` error code. Failed persistence now forces **Unsaved**, conflict copy tells
  the user to download edits before reloading, and the server label was shortened to fit
  the Files rail. Unit and real-server browser regressions cover these fixes.
- The full unit suite caught the user guide's naive PDL fence reader when a new `bash`
  fence changed its state. The shell example uses a bare fence, matching the existing
  reader, and the documented-examples test passes without weakening it.
- Split the new Go validation, entry-loading, and flag-parsing functions to meet the
  complexity target. Split the large filesystem test by behavior and added `ParentPath`
  coverage; the new storage package now has 81.7% statement coverage.
- Final store review found two revision-stability edges: omitted settings/tab arrays and
  clearing a workspace with an imported display name could make the next load look like an
  external edit. Normalizing optional collections before saving and deriving the cleared
  name from the storage root fixed both. Regression tests prove stable save→load→save and
  clear→load revisions.
- The jargon gate treated the specification's own requirement definitions as opaque
  references. Exempted that canonical definition file alongside the handbook, and removed
  the internal requirement code from the user-facing clear confirmation. The gate passes;
  prose requirements still carry their normative identifiers.

## Validation evidence

All commands below ran in the repository unless explicitly identified as baseline:

- `npm run check` — passed TypeScript checks for app and service worker plus ESLint.
- `npm test` — passed the full Vitest suite with coverage thresholds enabled.
- `go test -count=1 -race -cover ./...` — passed with the race detector; new
  `internal/storage` coverage 81.7%, `internal/server` 87.4%.
- `go vet ./...` — passed.
- `staticcheck ./...` — passed.
- `gocyclo -over 15 cmd internal web` — passed. Additional scans over the new storage,
  server, and `serve.go` code at `-over 10` passed; only unrelated pre-existing command
  functions remain above the target when scanning the whole command package.
- `go build ./...` — passed after the final Go changes.
- `npm run build` — passed and produced the self-contained production bundle used by E2E.
- `bash scripts/check-selfcontained.sh` — passed: no external-origin resource loads.
- `bash scripts/check-docs.sh` — passed: all documentation links resolve and PDL examples
  parse. `bash scripts/check-jargon.sh HEAD` and `bash -n scripts/check-jargon.sh` passed.
- `git diff --check` — passed without whitespace errors.
- `npx playwright test e2e/storage-browser.spec.ts e2e/storage-server.spec.ts --workers=1`
  — all four storage scenarios passed, including a final run after the copy and label fixes.
- Real-binary HTTP smoke passed in `/tmp/panelcraft-storage-smoke.QzfsvW`: capability
  marker present, GET `200` with an ETag, PUT `204` with a new ETag, actual `added.pcd`
  and `.panelcraft/workspace.json` created, and `.git/keep` preserved.
- Full `npm run e2e` result: 264 passed, four failed. One failure was this change's stale
  expected storage label and was fixed; its scenario then passed. The other three failures
  were canvas-to-code highlighting and two flow-undo cases. Each reproduced identically in
  a detached worktree at unchanged HEAD `2baad36`, confirming they are baseline failures,
  not regressions from this storage change. They remain known pre-existing suite failures;
  no storage assertion was skipped or weakened to hide them.

### Screenshot review

Reviewed generated, untracked captures under `test-results/screenshots/`:

- `storage-directory-light.png` and `storage-directory-dark.png`
- `storage-server-conflict-light.png` and `storage-server-conflict-dark.png`
- `storage-directory-clear-dark.png`

Checked the style guide's alignment, spacing, theme-token contrast, readable storage
identity, error-state visibility, destructive-dialog clarity, and consistent canvas end
state. The final captures show no clipping or overlap. The storage label stays within the
Files rail, conflict text remains visible in both themes, and **Unsaved** agrees with the
failed save. The clear dialog identifies deletion in the selected local folder. The
screenshot defects listed above were fixed and re-captured; no storage UI defect remains
open. Browser-directory scenarios use mocked File System Access handles; the server
scenarios use the real Go CLI and real temporary files.

## Residual risks

- Filesystem and browser-directory multi-file reconciliation is not transactional. A
  partial failure is surfaced; rollback is not claimed.
- Conflict handling protects against lost updates but does not automatically merge edits.
- Directory handles are session-scoped and browser support varies. The real operating-system
  picker was not exercised by the mocked browser test.
- Server-backed workspaces require the local server; workspace API responses are not
  available from the offline shell cache.
- The three pre-existing E2E failures listed above keep the repository-wide Playwright
  command red until separately addressed.

## Local Git follow-up

- Accept `-storage-type git -local DIR`; require or initialize a repository only after an
  explicit policy decision. Never run network-backed Git commands.
- Reuse filesystem reconciliation, then create one local commit per successfully persisted
  content revision with a configurable local author identity. Keep `.git` invisible and
  return the commit identifier as revision metadata.
- Add history/list/show/restore operations through the optional version-history port.
  Restore must be a new commit, not a destructive reset. Define empty-repository,
  detached-HEAD, unborn-branch, merge-conflict, hook-failure, and external-change behavior
  in tests.
- Decide how autosave commits are grouped so cursor/tab/layout changes do not create
  unusable history. Prefer content-only commits over committing every UI metadata update.

## Remote Git follow-up (plan only)

- Add provider-neutral clone/fetch/push ports and a separate credential provider; never put
  tokens in workspace records, URLs, logs, or browser storage without an explicit decision.
- Support bounded remote operations, offline/error states, authentication failure,
  non-fast-forward updates, conflict reporting, and user-controlled retry. Background pushes
  must never silently rewrite local history.
- A GitHub adapter can map repository/branch configuration onto those ports later. It needs
  its own security, dependency, UI, and end-to-end design review.
