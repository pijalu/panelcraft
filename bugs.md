# Bug and feature tracking

## Guideline
1. Create a detailed fix plan for each bug - the plan must contain test approach and validation steps - execute the plan and validate the fix when all elements are in place.
2. Any issues found must be fixed and the fix plan must be updated accordingly.
3. Issues found during testing must be fixed and the fix plan must be updated accordingly.
4. Each bug should be moved to docs/archive when tested and closed as the associated plan.
5. Use interactive shell/filmstrip to validate the output of the tool - you must verify the actual terminal output.
6. Check code quality with each tool run separately (do not chain them with `;` or `&&`):
- `go vet ./...`
- `staticcheck ./...`
- `gocyclo -over 15 cmd internal web` (CI fails >15; target is ≤10. Scoped paths
  are required: `node_modules` ships Go code that would fail a bare `.` scan)
- `go test -count=1 -race -cover ./...`
- Fix any issues.
 ! For cognitive and cyclomatic complexity, Pre-existing warnings are acceptable only if they are unrelated to the change and explicitly noted !

 At the end of the session - the bug list should be empty, change committed and this file should only contain the guidelines for bug reporting.
 If new items are added, restart the process.

 Use goals to execute the fix plan - focus on micro tasks goals with new contextto lower context usage - use todos for micro tasks that should share context

 Commit at the end of each fix with a clear and descriptive commit message

## Report format
Describe the bug or feature request under `# To fix` below. Keep one section
per item with a short title, the observed behavior, and the expected behavior.
Copy this template for each new item:

### Short title of the item

Observed:

- What actually happens, with the exact command, screen or file that shows it.

Expected:

- What should happen instead, stated so a test could check it.

Fix plan and test approach:

1. Reproduce it and record the failing command or capture.
2. Add the failing test or regression that proves the defect.
3. Make the smallest change that fixes it, on both language sides when the file
   format is involved.
4. State the validation: the commands to run and the captures to review.

# To fix

### Blank file name is reachable, and a template click can land on a phantom buffer

Status: **investigated, not fixed**.

Observed (real browser, Chromium, built bundle):

1. **+ file** accepts a name that is only whitespace. `commitCreate()` passes the raw
   input to `createFileAt(path)` (`web/src/ui/FileTree.tsx:212-222`) with no trim and no
   emptiness check, so `createFileAt('   ')` succeeds. The tree then shows a row with no
   readable name and the tab strip shows a tab whose label is empty (only the ✕).
   Capture: `test-results/screenshots/probe-space-name-file.png` — blank row above
   `untitled.pcd`, plus an unnamed tab at the left of the tab strip.
2. **Clicking a gallery template with no open file does nothing useful and leaves a stale
   conflict.** After closing the last tab the gallery appears, but the code buffer still
   holds the *closed* file, so the click raises "Unsaved code changes — The editor buffer
   of untitled.pcd differs from the saved file" and the template text never reaches any
   file. The status pill reads **Unsaved** while the tab strip says no open files.
   Capture: `test-results/screenshots/probe-empty-name-1-closed-tab.png`.
   The write path drops text when there is no active file: `useCodeSync` applies the
   buffer through `manager.saveText(path, text)` only when `path !== null`
   (`web/src/ui/useCodeSync.ts:160-170`), and the gallery handlers write through
   `props.code.machine.textChanged(...)` with no file open (`web/src/ui/App.tsx:854-866`).

Together these produce exactly the reported state: an unnamed file/tab in the Files panel
after starting a diagram from a template.

Expected: a file or folder name is trimmed and rejected when empty (the editor stays open
and says why); starting from a template with no open file creates the file the template
belongs in — or the gallery is not offered at all — and never reports a divergence against
a file that is no longer open.

Root-cause pointers: `commitCreate` (FileTree) has no name validation; `machine.textChanged`
has no target when `activePath` is null, so the buffer diverges from a closed file; the
gallery answers per file key, and the `null` key is a legitimate one (`useGalleryPrompt`).

Test approach: unit tests for the name rules (whitespace, empty, path separators, reserved
names) and for the "template with no open file" branch; a Playwright scenario that closes
the last tab, starts from a template, and asserts one named file plus no conflict dialog.

### A collapsed panel rail must sit at the dock's outer edge, not between open panels

Status: **investigated, not fixed**.

Observed: with the left dock holding Files (open), Flow steps (collapsed) and Shapes
(open), the collapsed rail renders *between* Files and Shapes. Measured children of the
left dock: Files 0–200, splitter 200–206, rail group 206–242, Shapes 242–410 — the rail is
in the middle of the dock instead of its outer edge. Capture:
`test-results/screenshots/probe-rail-mixup.png` and the reported screenshot of the same
state.

Root cause: `dockedPanels()` (`web/src/ui/App.tsx:570-605`) renders one shared rail group
at the position of the *first collapsed panel in dock order*, so any open panel that comes
before it in the order pushes the group inward.

Expected: the rail group is the outermost element of its dock — before every open panel in
a left dock, after every open panel in a right dock (and the same rule for a horizontal
bottom dock: outermost left/right respectively). The mixed state must be impossible for
every open/collapsed combination and every theme.

Test approach: geometry assertions per dock and per combination (open/collapsed order
permutations), plus light/dark captures of each dock with a mixed state.

### Files-panel storage explanation and create actions should be quiet icons

Status: **investigated, not fixed**.

Observed: the storage explanation ("Browser files live only in this browser. They are not
visible in your file manager.") is a three-line paragraph that permanently occupies the top
of the Files panel, and the create actions are full-width text buttons **+ file** and
**+ folder** that take another row. Together they push the file list down and make the
panel read as documentation instead of a file browser. Capture:
`test-results/screenshots/probe-rail-mixup.png`.

Expected: the explanation moves behind an information icon placed next to the panel title
(reachable by keyboard, exposed as a tooltip *and* an accessible description, so the text
is still available without hovering); **+ file** and **+ folder** become icon buttons with
tooltips and accessible names. Targets stay at least 32 px, the panel keeps a visible
storage label, and nothing is announced only on hover.

Test approach: existing label tests stay green; new tests for the info trigger's accessible
name and description, and for both icon buttons' names/tooltips; light/dark captures.

### The collapse chevron belongs next to the panel title

Status: **investigated, not fixed**.

Observed: the '<' collapse control renders on a second row at the right edge of the panel
body (measured: collapse-sidebar button left 166–198 while the panel starts at 1), while
the title row itself is owned by the shared host header (`panel-host-header` in
`web/src/ui/WorkspacePanels.tsx:174-210`: title + ⋮). So each panel needs an extra row just
to hold the chevron, and the control sits far from the title it collapses.

Expected: the collapse chevron sits in the shared header row, immediately next to the panel
title (title, then chevron), with the same accessible name and the same focus behaviour
after collapse (`focusRail`). Panel bodies start with their content.

Test approach: header layout assertions (chevron inside the title row, left of the actions
button), a focus-after-collapse test, and light/dark captures of Files, Shapes, Code and
Properties headers.

Closed items live in [docs/archive/](docs/archive/).
