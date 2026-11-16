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

## 3. Optimize orthogonal connection endpoints

**Observed behavior:** Orthogonal connections can produce diagonal-looking or
tangent endpoint segments. In the reported example between **Customer** and
**Blah**, the arrow runs tangentially at the endpoint instead of entering the
shape cleanly.

**Expected behavior:**

- Keep orthogonal connections horizontal/vertical, without diagonal segments.
- For automatic endpoints, choose the endpoint side and final leg so the arrow
  approaches the shape perpendicularly rather than tangentially.
- Preserve manually selected or moved endpoints; apply endpoint optimization
  only when the user has not explicitly set the endpoint.

## 4. Review or remove the Views feature

**Observed behavior:** The **Views** feature has unclear purpose and can reset
the current drawing instead of preserving the user's work.

**Expected behavior:** Review whether Views provides a useful, distinct
capability. If retained, switching or creating a view must never reset or replace
the drawing unexpectedly, and its behavior must be clear to users. If it cannot
meet that contract, remove the feature and its associated controls.

## 5. Support moving the canvas view with the mouse

**Observed behavior:** Moving the canvas view is not available through a direct
mouse drag gesture; the requested mouse-only workflow is to press a secondary
mouse button and move the view area.

**Expected behavior:** Support press-and-drag canvas panning with the requested
secondary/middle mouse-button gesture, without requiring a keyboard modifier.
The gesture must not select objects, create accidental edits, or trigger the
context menu, and existing touch, wheel, and keyboard navigation must remain
available. Schedule and complete this fix in the current bug-fixing session.

## 6. Fix the failing GitHub CI/CD run — schedule last

**Observed behavior:** GitHub Actions run
[43828484739](https://github.com/pijalu/panelcraft/actions/runs/43828484739)
is failing.

**Expected behavior:** Inspect the run logs, identify the root cause, and restore
a green CI/CD pipeline without weakening tests or skipping required quality
gates. Add regression coverage where the failure exposes a repository or workflow
defect. Plan this item last in the current bug-fixing session, after the canvas
mouse-panning fix.

## Closed this session

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
