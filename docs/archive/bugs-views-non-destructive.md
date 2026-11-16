<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queue bug: retain Views without destructive drawing resets

Source: `bugs.md`, queued item 4.

## Review and reproduction

Views provide a distinct, useful capability already present in the file format:
per-view tag/element fades, saved object positions, pins, and an explicit layout
command. Removing them would discard those capabilities and require a format and
migration change, so the preferred fix is to retain them with a non-destructive
interaction contract.

The destructive path is `ViewBar`'s view-switch handler. It calls
`applyViewLayout`, which runs dagre whenever the destination uses `layout auto`.
A newly created view has no positions and defaults to auto mode. Creating it is
initially harmless, but leaving and returning to it recomputes every position,
replacing the current arrangement without an explicit layout command. Saved
positions in the source view remain in the file, making the visible result look
like an unexplained drawing reset.

This contradicts the repository's own layout rule in `docs/REVIEW-enhancements.md`:
view switches may restore stored positions but must not run dagre; only explicit
layout commands may reorganize the drawing.

## Non-destructive contract

- Creating a view snapshots current object positions into its view block and
  selects it. Objects, links, and current geometry remain unchanged. The
  snapshot is required because the normal code-to-canvas apply path otherwise
  gives the position-free destination its default grid positions.
- Switching views changes the active filter/position context and restores only
  positions explicitly stored in the destination view. Objects without a stored
  position stay where they are.
- Switching never computes automatic layout and never rewrites diagram text.
- `apply layout` remains the explicit command that computes and persists an
  automatic layout. `reset` remains an explicit position-clearing command; it
  does not delete objects or links.

## Test and implementation plan

1. Add a component regression proving that switching to a position-free auto
   view calls the controller with no replacement positions and retains the
   object/link source. Add a creation control proving no layout call occurs.
2. Add a browser regression with custom Default positions: create View 1, leave
   it, return to it, and require identical transforms, object/link counts, and
   preserved Default position text.
3. Run both tests before implementation and record the actual failures.
4. Make view switching restore only `EffectiveView.positions`; keep dagre in the
   explicit apply-layout/reset paths. Snapshot current positions during view
   creation so its required code-to-canvas apply cannot substitute grid
   positions. Clarify the selector and creation tooltips so the retained
   feature's purpose and non-destructive behavior are visible.
5. Run the Views/geometry/component suites, full coverage and static checks,
   related Playwright scenarios, accessibility checks, and light/dark screenshot
   review. Run each required Go quality command separately and document only
   unrelated pre-existing complexity warnings.
6. Record the decision and evidence here, close the queue item, and commit only
   this Views fix.

## Decision and implementation

Views are retained. Their filter and saved-position capabilities are distinct
from files, flows, and canvas camera state; no format migration or feature
removal is warranted.

`addView` now accepts the current controller positions and writes them into the
new view in document-object order. This makes the subsequent canonical
code-to-canvas apply reproduce the arrangement instead of substituting default
grid coordinates. Creation still does not call `applyPositions` or dagre.

The view-switch restore path now passes only `EffectiveView.positions` to the
controller. It no longer calls `layoutPositions`, so a position-free auto view
leaves every current object in place and a partially saved view changes only
listed objects. The explicit `apply layout` and `reset` paths retain their
existing computed-layout behavior.

Selector and creation tooltips explain the contract, and the user guide now
documents snapshots, non-computing switches, and partial-position behavior.

## Validation evidence

- Component RED: `npx vitest run web/src/ui/views/ViewBar.test.tsx
  --coverage.enabled=false --reporter=dot` produced 1 failure/12 passes. The
  position-free auto-view regression expected `{}` but received dagre positions
  `api (0,50)`, `db (240,0)`, and `web (240,100)`.
- Browser RED: `npm run build && npx playwright test e2e/p1-geometry.spec.ts -g
  "Views preserve"` failed immediately after `+ view`: expected B `(260,40)`
  and C `(480,40)`, received default-grid B `(230,40)` and C `(420,40)`.
  This exposed the second reset path and added the position-snapshot fix to the
  plan.
- Focused GREEN: ViewBar and view-model suites passed 26/26; the focused browser
  regression passed with accessibility scans and both screenshot captures.
- `npx playwright test e2e/p1-geometry.spec.ts e2e/s5-views.spec.ts
  e2e/p0-regressions.spec.ts e2e/cx03-stacking.spec.ts`: 13/13 passed,
  including filter isolation, explicit layout, reset, undo, persistence, and
  canvas-edit document preservation.
- `npm test`: 117 files and 1,318 tests passed with coverage thresholds. Views
  coverage reached 86.18% statements and 80.88% branches; `viewDoc.ts` reached
  90.99% statements and 89.41% branches.
- `npx vitest run --reporter=dot`: all 119 files and 1,326 tests passed,
  including performance smoke tests.
- `npm run check`: TypeScript, service-worker TypeScript, and ESLint passed.
- `npm run build`: production bundle completed successfully.
- Reviewed `test-results/screenshots/views-non-destructive-{light,dark}.png`.
  The new view and Default contain identical positions, canvas geometry remains
  stable, controls retain visible focus and theme parity, and no clipping or
  contrast regression was found. Axe reported no WCAG A/AA violations in either
  theme. Laws of UX Mental Model review found the visible behavior and explanatory
  tooltips consistent; no new finding.
- `bash scripts/check-docs.sh`: all links and PDL fences passed.
- `bash scripts/check-jargon.sh HEAD`: no opaque identifier-only references.
- `go vet ./...` and `staticcheck ./...`: passed.
- `go test -count=1 -race -cover ./...`: all packages passed.
- `gocognit -over 15 .` and `gocyclo -over 12 .` reported only pre-existing
  warnings in untouched Go parser/printer/CLI tests and vendored
  `node_modules/flatted`; this TypeScript-only Views change added none.

Residual behavior: switching intentionally restores explicit saved positions.
Automatic rearrangement now requires the user's explicit layout/reset command.
