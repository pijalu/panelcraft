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

### Quick-add stacks every new shape on the previous one

Observed:

- On a fresh profile, pressing `1` then `2` (or any two quick-add keys) places
  the second shape exactly over the first: both land at the centre of the view
  (`CanvasController.addObject` uses `centerOfView()` with no collision check),
  so the first shape is hidden and the two must be dragged apart before they can
  be connected. Seen during the reproduction for the two items archived in
  `docs/archive/bugs-code-visible-by-default.md` (capture
  `test-results/screenshots/code-default-fresh-*.png` show `System 1` covering
  `Person 1`; the regression had to move the second shape clear to link them).

Expected:

- A quick-added (or palette-dropped) shape whose footprint would cover an
  existing object is placed beside the occupied spot instead — offset along a
  short cascade so the new shape is fully visible and immediately linkable,
  while the position still snaps to the grid and stays inside the current view.

Fix plan and test approach:

1. Reproduce with a browser filmstrip: two quick-adds on a fresh profile, capture
   the overlap; assert the second shape's rectangle intersects the first.
2. Add a failing unit test in `CanvasController` coverage: adding the same or a
   different kind twice yields non-overlapping bounds, grid-aligned positions,
   and the cascade stops inside the viewport (wraps to the next free slot).
3. Implement the smallest placement rule (a short cascade probe reusing the
   existing overlap/geometry helpers), keeping explicit `at` placement (palette
   drop at a point, paste, import) unchanged.
4. Validation: unit suite, the drawing Playwright scenarios, light/dark capture
   review, then each Go gate separately (no Go change expected).

Closed items live in [docs/archive/](docs/archive/).
