<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queue bug: orthogonal endpoint approaches

Source: `bugs.md`, queued item 3.

## Reproduction

Two automatic-route cases violate the endpoint contract:

- A Customer–Blah-style horizontal connection with an intervening obstacle
  detours vertically out of the source's right side and vertically into the
  target's left side. Both endpoint legs are tangent to the shape.
- Avoidance candidates include a direct center-side-to-side segment. For some
  offset shapes this is a diagonal shortcut even though the link is orthogonal.

Explicit normalized anchors and explicit waypoints already have separate route
construction and must remain authoritative.

## Implementation plan

1. Add regression tests that require every segment of an orthogonal route to be
   axis-aligned and both automatic endpoint legs to be normal to their selected
   sides. Include the reported horizontal obstacle geometry and an offset case
   that currently selects a diagonal shortcut.
2. Replace the aligned obstacle detour with outward endpoint stubs, so its first
   and last legs leave and enter perpendicularly.
3. Reject diagonal and tangent candidates during automatic avoidance. Do not
   apply this filtering when either endpoint is explicit.
4. Add an explicit-anchor obstacle control and run the complete router suites,
   TypeScript/coverage gates, related browser scenarios, and light/dark visual
   review. Record the resulting geometry and checks here.

Residual scope: this fixes endpoint direction and orthogonality, not the
router's broader best-effort obstacle avoidance guarantees.

## Implementation and outcome

Automatic obstacle detours now include short outward stubs before the interior
channel and before the target. Automatic avoidance candidates are compacted and
accepted only when every segment is axis-aligned and both endpoint legs follow
the selected side normals. Equivalent stubbed candidates let avoidance retain
that contract while separating coincident links. Unavoidable short egress and
entry corridors shared by routes with the same endpoint do not outrank a clear
interior detour.

Explicit normalized anchors bypass the automatic candidate filter. The anchor
control retains exact endpoints `(80,20)` and `(300,20)`, and the existing
waypoint, endpoint-drag, reset, undo, and export scenarios remain green.

Updated detours include:

- Horizontal obstacle: `(80,20) → (92,20) → (92,52) → (288,52) →
  (288,20) → (300,20)`.
- Large obstacle: `(80,20) → (92,20) → (92,-24) → (288,-24) →
  (288,120) → (300,120)`.
- Offset coincident-link avoidance: `(200,190) → (212,190) → (212,204) →
  (508,204) → (508,130) → (520,130)`.

## Validation evidence

- RED: `npx vitest run web/src/engine/render/router.test.ts
  --coverage.enabled=false --reporter=dot` failed on the Customer–Blah tangent
  exit (`expected 52 to be 20`) and the offset diagonal (`expected false to be
  true`). A brute-force external reproducer found the diagonal fixture
  `(0,0,80,40) → (120,40,80,40)` with obstacle `(80,0,40,40)`.
- GREEN: focused router/avoidance/anchor/editing suites passed 75/75; the full
  render suite passed 283/283.
- `npm test`: 117 files and 1,316 tests passed with coverage thresholds;
  `router.ts` reached 95.37% statements, 92.79% branches, and 100% functions.
- `npx vitest run`: all 119 files and 1,324 tests passed, including performance
  smoke tests.
- `npm run check`: TypeScript, service-worker TypeScript, and ESLint passed.
- `npm run build`: production bundle completed successfully.
- `npx playwright test e2e/cx02-overlap.spec.ts e2e/cx01-endpoints.spec.ts
  e2e/ux08-connection-editing.spec.ts e2e/p3-waypoints.spec.ts`: 13/13 passed.
  Browser assertions cover axis alignment and horizontal endpoint legs for
  aligned and offset automatic routes. Existing explicit endpoint, waypoint,
  persistence, undo, SVG/PNG geometry, and axe checks passed.
- Reviewed `test-results/screenshots/cx02-automatic-{light,dark}.png` and
  `cx02-object-endpoint-edit-{light,dark}.png`. Routes enter shapes cleanly,
  selection and arrow markers remain visible, geometry and spacing match across
  themes, and no clipping or visual regression was found. Laws of UX review
  applied the Law of Prägnanz and the style-guide screenshot checklist; no new
  finding.
- `bash scripts/check-docs.sh`: all links and PDL fences passed.
- `bash scripts/check-jargon.sh HEAD`: no opaque identifier-only references.
- `go vet ./...` and `staticcheck ./...`: passed.
- `go test -count=1 -race -cover ./...`: all packages passed.
- `gocognit -over 15 .` and `gocyclo -over 12 .` reported only pre-existing
  warnings in untouched Go parser/printer/CLI tests and vendored
  `node_modules/flatted`; this TypeScript-only routing change added none.
