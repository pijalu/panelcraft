# Local Git workspace storage

Status: **closed — embedded local Git storage, history, preview, and forward restore implemented and validated on 2026-11-20. Remote Git remains design-only.**

## Observed

- `-storage-type git` returned `git storage is not implemented yet`.
- The basic Go storage port had no Git implementation. The separate version-store port had no
  history/show HTTP routes, TypeScript adapter, or persistent-version browser.
- Filesystem storage already owned confinement, depth filtering, reserved paths, UTF-8 policy,
  metadata, reconciliation, and optimistic content revisions. Git needed to compose that behavior
  rather than duplicate it.
- A system Git subprocess would add a runtime executable dependency to the single binary. An
  embedded library avoids that installation and process-contract dependency.
- Remote Git, credentials, clone/fetch/push, and GitHub integration remained outside this change.

## Accepted behavior

1. `panelcraft serve -local DIR -storage-type git` opens a standalone non-bare repository at
   exactly `DIR`, or initializes one because the command explicitly selected Git. It does not
   discover a parent repository. Linked-worktree `.git` files and bare repositories are rejected;
   empty repositories and detached HEAD are supported.
2. The Git store composes the confined filesystem store. A strong revision combines full HEAD and
   filesystem content hashes, detecting external commits and uncommitted file edits. Save, clear,
   and restore compare that revision before mutation.
3. Versionable content changes create local commits; tab, cursor, settings, and other metadata-only
   saves do not. Each content commit stages the complete visible workspace plus PanelCraft metadata,
   including unchanged but not-yet-tracked files, so every shown commit is a complete restorable
   snapshot. Binary, hidden, reserved, and out-of-depth files remain outside PanelCraft's commits.
4. Commit identity defaults to `PanelCraft <panelcraft@localhost>` and can be overridden with
   `-git-author-name` and `-git-author-email`. Global Git identity is not read. Embedded go-git
   performs no repository hook, credential, remote, or network operation.
5. Externally staged paths and `.git/MERGE_HEAD` block mutations with a conflict. Unrelated
   unstaged and binary files are preserved. Clear creates a content commit when it removes visible
   files; depth-limited clear preserves out-of-depth content.
6. The optional Go and TypeScript version-store ports support list, show, and restore without
   adding history methods to non-Git stores. The HTTP routes retain no-store responses, strong
   `ETag`/`If-Match` preconditions, and the existing mutation header.
7. **Application menu → File & data → Git versions** appears only for advertised Git storage and
   not in private mode. The dialog lists commits and shows the selected version's workspace name
   and file list. Restore requires confirmation, flushes current edits first, and adopts the server
   result only after success. It creates a forward commit even when content already matches;
   checkout, reset, and history rewriting are never used.
8. Historical snapshots follow Git's treatment of empty directories: empty directories are not
   promised. Multi-file filesystem/commit failure remains non-transactional.

## Implementation

- Added the embedded local Git decision in `docs/adr/0008-local-git-storage.md` before adding
  `github.com/go-git/go-git/v5 v5.19.3` (Apache-2.0). The module files were tidied and reviewed
  together. The final uncompressed binary measured 16,756,130 bytes versus 13,941,586 at the
  filesystem-storage baseline, an increase of 2,814,544 bytes.
- Added `internal/storage/git.go`: repository opening/initialization, HEAD+content revisions,
  committability checks, complete visible-workspace staging, content/clear commits, history,
  historical snapshot loading, and forward restore.
- Added same-origin history collection/item/restore handlers and mapped unknown versions to `404`,
  malformed IDs to `400`, and stale/index/merge states to `409`.
- Added CLI Git selection and author flags. TypeScript selection recognizes the served `git`
  capability marker while static hosting still performs no API discovery.
- Added the optional TypeScript version port, HTTP adapter methods, workspace-manager restore
  adoption, menu capability, dialog, centralized strings, and token-based light/dark styles.
- Added real go-git unit tests, real HTTP/API tests, TypeScript port/manager/dialog tests, and a
  real Go-binary/repository Playwright scenario.

## Findings and fixes during implementation

- The initial unrelated-file fixture used UTF-8 `notes.txt`, which correctly belongs to the
  workspace. It was replaced with invalid-UTF-8 `asset.bin`; the first attempted byte sequence was
  also valid UTF-8, so the final fixture uses `0xff, 0xfe, 0xfd`.
- CLI validation initially returned the Git-author/backend error before the more fundamental
  missing-`-local` error. Backend-specific validation now follows the no-local check. A final
  staticcheck run also caught a capitalized error string; the message and its assertion now use
  Go's lowercase error convention.
- History requests initially reached the SPA fallback when no store was configured. Explicit
  no-store history handlers now return `404` for filesystem and unconfigured servers.
- The new App wiring initially exceeded the 120-line function gate by three lines. Related JSX props
  were combined without changing behavior; TypeScript and ESLint then passed.
- The first browser assertion assumed exactly one commit after the first measured edit. Opening an
  externally authored file can canonicalize it before that edit, producing an earlier legitimate
  content commit. The E2E now measures revisions relative to settled post-edit history. Store unit
  tests still enforce exact commit counts; no assertion was skipped.
- **Final store review found an incomplete-snapshot defect.** Initializing Git around an existing
  directory and editing one file staged only changed paths, leaving unchanged workspace files out
  of the first commit. `go test ./internal/storage -run
  '^TestGitFirstCommitIncludesUnchangedWorkspaceFiles$' -count=1` failed with `first commit omitted
  "nested/unchanged.pcd"`; restoring that incomplete commit also failed while staging the omitted
  path. Content commits now stage all current visible files plus changed deletions. The regression
  and the complete storage package passed afterward.
- `go mod tidy` retained go-git's required transitive modules and checksums; `go mod verify` passed.
  The existing `golang.org/x/sys` module advanced from v0.42.0 to v0.47.0 through the resolved module
  graph. No remote operation was added to application code.

## Validation evidence

- `npm run check` — passed TypeScript checks for app/service worker and ESLint.
- `npm test` — passed the full Vitest suite with coverage thresholds enabled.
- `go test -count=1 -race -cover ./...` — passed with the race detector. Statement coverage:
  `internal/storage` 81.8%, `internal/server` 84.7%, `cmd/panelcraft` 70.4%.
- `go vet ./...` — passed.
- `staticcheck ./...` — passed after the CLI error-string fix.
- `gocyclo -over 15 cmd internal web` — passed. A focused `-over 10` scan over the new Git, history,
  CLI, and associated test files also passed.
- `npm run build` — passed; the production bundle used by browser tests was rebuilt.
- `go build ./...` and `go build -o /tmp/panelcraft-git-current ./cmd/panelcraft` — passed.
- `npx playwright test e2e/storage-browser.spec.ts e2e/storage-server.spec.ts
  e2e/storage-git.spec.ts --workers=1` — **5 passed**, covering static/no-API behavior, direct
  browser-directory behavior, real filesystem storage/conflicts, and real Git
  commit/preview/restore/reload. Both Git-dialog axe scans passed.
- `bash scripts/check-docs.sh` — passed: all documentation links resolve and PDL examples parse.
- `bash scripts/check-selfcontained.sh` — passed: no external-origin resource loads in the bundle.
- `bash scripts/check-jargon.sh HEAD` — passed.
- `git diff --check` — passed without whitespace errors.
- `bash scripts/check-repo-clean.sh` — passed: no generated content is tracked. A first-line scan
  confirmed the GPL-3.0-only SPDX header on every new Go, TypeScript, and TSX source file.
- `go mod verify` — passed: all modules verified.

### Screenshot review

Reviewed the final generated captures:

- `test-results/screenshots/storage-git-history-light.png`
- `test-results/screenshots/storage-git-history-dark.png`

Checked alignment, spacing, dialog hierarchy, selected-row visibility, file-preview boundaries,
action placement, theme-token contrast, and background/canvas end state. Both captures are readable
with no clipping or overlap; selected history and preview remain clear in light and dark themes.
No visual defect remains open. The browser-directory scenarios continue to use mocked directory
handles, while the Git scenario uses the actual Go CLI and a real repository.

## Follow-up — editor dock lifecycle regressions

The three unrelated baseline failures recorded in the original report were reproduced at
`1e3a602` and are now closed. Dock regrouping can mount a replacement code editor before the
predecessor's effect cleanup runs. The old cleanup then cleared the replacement's reveal port and
undo/redo ports, so selecting a canvas object produced no source highlight and flow shortcuts
had no document history to call. The editor also read its cached state before the predecessor
could save it, losing live history across the remount.

The editor now takes state from the active predecessor, and only the active editor caches state
or clears ports that it still owns. Machine-originated document writes start a new undo group so
a settled flow-delay edit cannot merge into the immediately preceding document edit. New unit
regressions cover replacement-port ownership, live-history handoff, and undo-group isolation.

Follow-up validation:

- `npx vitest run web/src/ui/codeview/CodeEditor.test.tsx --coverage.enabled=false` — **9 passed**.
- `npm test` — passed the full Vitest suite with coverage thresholds enabled.
- `npm run check` — passed TypeScript checks for app/service worker and ESLint.
- `npm run build && npm run e2e` — **269 passed**, including canvas-to-code highlighting and both
  flow undo cases. The previous three-failure baseline no longer exists.
- `go test ./...` — passed all Go packages.
- Reviewed `test-results/screenshots/p3-canvas-code-map.png` and
  `test-results/screenshots/p3-canvas-code-map-dark.png` against the style-guide checklist. The
  three highlighted statement lines are visible without moving focus or changing panel geometry;
  contrast, spacing, selection treatment, and theme parity remain intact. No visual defect was
  found. Undo/redo keyboard behavior is covered by the browser scenarios above.

## Residual risks and explicit non-goals

- Multi-file reconciliation followed by a Git commit is not a transaction. A partial failure is
  surfaced and may require local recovery; rollback is not claimed.
- Optimistic revisions and staged-change checks protect a local single-user workflow, not multiple
  servers or multi-user collaboration. External edits require conflict handling rather than
  automatic merging.
- Bare repositories and linked worktrees are unsupported. Empty directories are not represented in
  historical Git snapshots. Repository hooks are not run.
- Remote Git/GitHub, credentials, clone/fetch/push, and non-fast-forward remote policy remain future
  design work. No runtime network-backed Git operation exists in this implementation.
