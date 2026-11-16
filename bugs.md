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



## 7. Keep long menus inside the visible viewport — schedule after CI/CD

**Observed behavior:** Menus with many commands can extend beyond the visible
viewport, putting actions out of reach or requiring the page/menu to scroll out
of view.

**Expected behavior:** Limit menu size to the available viewport and use
submenus where appropriate so every command remains reachable. If the content
still cannot fit, provide a visible scrolling extension/affordance at the end of
the visible menu area. Preserve pointer, touch, and keyboard navigation, and keep
the menu anchored without clipping off-screen commands. Schedule this fix after
the GitHub CI/CD repair.

## 8. Keep long filenames and file actions reachable — schedule after long-menu fix

**Observed behavior:** In the Files panel, an overly long filename pushes the
file-action icons out of view.

**Expected behavior:** Wrap long filenames across lines so the visible action
icons remain reachable, and provide a context menu as an alternative way to
invoke the file actions. Preserve pointer, touch, and keyboard operation without
horizontal overflow.

**Fix plan:** Add component and browser regressions using a long filename in a
narrow Files panel. Verify the filename wraps, every action stays visible and
operable, the context menu exposes the same actions, and keyboard focus remains
usable. Review light/dark and narrow-viewport screenshots, then run the full
unit, end-to-end, accessibility, and quality gates.

## Closed this session

- **The CI/CD browser setup is deterministic again.** Flow creation now waits
  for the canvas-to-file write to settle, and grid fixtures replace the editor
  contents atomically instead of racing select-all against re-renders. The five
  presentation timeouts came from clicking intentionally pointer-transparent
  route strokes; the current connection-derived flow setup avoids that invalid
  test action. The exact failing revision reproduced five failures and passed
  all 10 targeted tests with the repairs. Current targeted coverage passed
  20/20, the full browser suite passed 160/160, and all unit, coverage, static,
  race, build, and accessibility gates remained green.
  Write-up: `docs/archive/bugs-ci-e2e-determinism.md`.

- **Secondary and middle mouse drags now pan the canvas.** Moving either button
  changes only the viewport, never object geometry, selection, document text, or
  undo history. A moved secondary drag suppresses the context menu; a stationary
  right-click preserves it. Space+drag, wheel, keyboard, and primary-pointer
  navigation remain available. Verified by controller and real-browser
  regressions, full coverage/static gates, 21 related browser tests,
  accessibility scans, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-canvas-mouse-panning.md`.

- **Views are retained with a non-destructive contract.** Creating a view
  snapshots current positions; switching restores only stored positions and
  never recomputes layout. Explicit apply/reset commands remain unchanged.
  Verified by component and browser regressions, full coverage/static gates,
  13 related browser tests, accessibility scans, and light/dark screenshots.
  Write-up: `docs/archive/bugs-views-non-destructive.md`.
- **Automatic orthogonal links now approach shapes perpendicularly.** Obstacle
  detours and avoidance candidates stay axis-aligned with outward endpoint
  stubs; explicit anchors and waypoints remain authoritative. Verified by
  regression and render suites, 13 related browser tests, full coverage/static
  gates, Go race tests, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-orthogonal-endpoints.md`.
- **Collapsed panels now share one tab-like column per dock.** All collapsed
  panels keep labelled, keyboard-accessible expand controls, the Code sync chip
  remains visible, and expanding one panel leaves the other tabs available.
  Verified by component tests, full unit/coverage gates, 16 targeted browser
  tests, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-collapsed-panel-rails.md`.
- **Flows now start from existing connections and support non-destructive
  visibility controls.** Stable topological source order uses creation index
  for ties; manual drag/drop remains authoritative. Hide removes only the
  flow's message card, while Hidden connections can Show the original link
  again. Descriptions, keyboard ordering, parallel-link references, and
  light/dark accessibility are covered.
  Write-up: `docs/archive/bugs-topological-flow-editing.md`.
- **BUG-08 — undo from the History dialog could revert far more than the last
  edit** (the connector-style end-to-end test went red on the shared CI runner,
  green locally). Fixed by removing the test's dependence on same-link command
  coalescing: the undo/redo contract is now asserted on a reloaded session that
  holds exactly one journal entry.
  Write-up: `docs/archive/bugs-cx04-undo-race.md`.
- **BUG-09 — cryptic identifiers in commits, comments and docs.** Fixed with a
  locally-defined glossary in `agents.md` ("Identifiers in this repo"), a rule
  that the sentence must stand without the tag, and `scripts/check-jargon.sh`
  wired into `verify.sh` and CI, which fails any change that adds a bare tag.
  Write-up: `docs/archive/bugs-identifier-clarity.md`.
- **BUG-10 — the deployed GitHub Pages site was blank.** Fixed by building the
  bundle for the `/<repo>/` sub-path and failing the job if an `/assets/`
  reference survives.
  Write-up: `docs/archive/bugs-pages-blank-page.md`.
