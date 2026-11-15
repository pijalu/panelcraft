# Bug and feature Tracking

## Guideline
1. Create a detailed fix plan for each bug - the plan must contain test approach and validation steps - execute the plan and validate the fix when all elements are in place.
2. Any issues found must be fixed and the fix plan must be updated accordingly.
3. Issues found during testing must be fixed and the fix plan must be updated accordingly.
4. Each bug should be moved to docs/archive when tested and closed as the associated plan.
5. Use interactive shell/filmstrip to validate the output of the tool - you must verify the actual terminal output.
6. Check code quality with each tool run separately (do not chain them with `;` or `&&`):
- `go vet ./...`
- `staticcheck ./...`
- `gocognit -over 15 .`
- `gocyclo -over 12 .`
- `go test -count=1 -race -cover ./...`
 Fix any issues.
 ! For cognitive and cyclomatic complexity, Pre-existing warnings are acceptable only if they are unrelated to the change and explicitly noted !

 At the end of the session - the bug list should be empty, change committed and this file should only contain the guidelines for bug reporting.
 If new items are added, restart the process.

 Use goals to execute the fix plan - focus on micro tasks goals with new contextto lower context usage - use todos for micro tasks that should share context

 Commit at the end of each fix with a clear and descriptive commit message

## Report format
Describe the bug or feature request under `# To fix` below. Keep one section
per item with a short title, the observed behavior, and the expected behavior.

# To fix

_No queued items._

Last session: seven issues found reviewing UX-08 WP14/WP15 were fixed and
archived in `docs/archive/bugs-ux08-wp14-wp15-review.md`.

## BUG-08 — Undo from the History dialog can revert far more than the last edit

**Observed.** `e2e/cx04-connector-style.spec.ts` (CX-04) fails on the 2-core CI
runner and reproduces locally with CPU throttling. After "set width 2.5 → press
ArrowRight on the Line radio group → History → Undo", the document becomes
`pcd 1.0` (the state before the seed) instead of `a -requests-> b as L1`, while
the canvas and the properties panel keep showing `dashed`. The assertion
(`panel Line == solid`) can therefore never become true.

**Reproduced.** Add `Emulation.setCPUThrottlingRate {rate: 20}` (CDP) to the spec
and run `npx playwright test e2e/cx04-connector-style.spec.ts` → both themes fail
on the same line; without throttling it passed 60/60 locally.

**Evidence gathered.** With throttle + logging of document text, canvas link
class, panel radio group and history rows, at the moment of undo:

    rows = ["edit link" (canvas), "code edit" (code)]
    after undo: panel=["dashed"], link class=pc-dashed, document="pcd 1.0"

The canvas undo ran (`onUndo={() => history.undo(false)}` → `undoSurface(false,
last)` → `'canvas'`), yet the document collapsed to the pre-seed state: the canvas
command that undo invoked restores a whole-document state rather than the last
link edit, i.e. the canvas stack and the document journal disagree about the
previous state (the canvas→file write window recorded during WP12, now visible
through undo).

**Not fixed — needs its own slice.** A correct fix decides the single authority
for undo across the canvas stack and the document (per-surface undo means the
canvas stack must not hold whole-document snapshots); that changes user-visible
undo semantics, so it belongs in a reviewed change with app-level tests rather
than folded into a CI fix. The test stays unweakened: its assertion describes
what the brief promises.

**Partial fix landed.** `CanvasController.undoCommand()` / `redoCommand()` now call
`emit()` after `applyState()`, so panels reading the selection from `onState`
(the properties radio groups among them) refresh on undo/redo instead of showing
pre-undo values. Unit-tested in `CanvasController.test.ts` (RED first: the
published snapshot carried the stale value).
