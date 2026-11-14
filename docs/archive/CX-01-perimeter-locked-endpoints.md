# CX-01 — Draggable connector endpoints locked to entity perimeters

Status: **closed** on 2026-11-14.

## Observed behavior

Automatic routing chose each connector side and midpoint. Intermediate waypoints could
be edited, but start/end attachment points could not.

## Expected behavior

- Selecting a connector reveals start, destination, and intermediate waypoint handles.
- Start/destination dragging follows the entity perimeter, changes sides and corners,
  and clamps inside/outside pointers rather than detaching.
- Both normalized anchors persist in PDL and retain side-relative attachment on resize.
- Every route mode and every geometry consumer uses the same exact endpoints.
- Missing anchors preserve the previous automatic routing behavior.

## Executed implementation plan

1. Extended TS and Go IR to v4 with optional `fromAnchor` / `toAnchor`, added atomic
   PDL `anchor from|to <n>` parsing/printing, validation, serializers, workspace merge,
   docs, shared corpus fixtures, and TS⇄Go parity cases.
2. Added normalized side-quarter perimeter geometry (top/right/bottom/left), exact
   corner handling, nearest-perimeter projection, and side-relative resize semantics.
3. Added selected-link endpoint handles, transient view-only drag rendering, Escape
   restoration, one undo command per committed drag, and localized accessible names
   and drag descriptions. Direct PDL editing remains the keyboard-accessible alternative.
4. Routed explicit endpoints through orthogonal, straight, curved, waypoint, labels,
   hit-testing, minimap, SVG/PNG, and CLI geometry. Kept absent-anchor routing on its
   legacy path. Declared the unavoidable Mermaid anchor loss.
5. Ran focused unit/browser/terminal checks, active-state axe scans, and a light/dark
   screenshot filmstrip; fixed all issues found before closing.

## Issues found during validation and fixes

- Initial E2E coordinates were occluded by open docks. The scenario now collapses the
  palette/files docks while retaining the code panel for persistence assertions.
- Chromium rejected even a minimal SVG blob in `createImageBitmap`. PNG export now
  gives its clone absolute intrinsic dimensions and falls back to decoding the same
  sanitized local blob with `HTMLImageElement.decode()`; no network is used. Toolbar
  errors now display the actual rejection message instead of a blank alert. A unit
  regression checks raster dimensions and E2E verifies a real PNG signature.
- CLI visual inspection found that an early orthogonal Z-channel could backtrack
  through the source/target for opposite side anchors. Explicit-anchor routing now
  turns perpendicular to both outward stubs around deterministic X/Y channels. A
  regression failed before the fix and passes afterward; legacy routes are unchanged.
- New branches initially raised five functions above ESLint complexity 12. Small
  attribute/loss/print/route/handle helpers restored the gate without behavior changes.

## Focused evidence

- `npx vitest run web/src/ui/CanvasController.test.ts web/src/ui/strings.test.ts` —
  49 tests passed.
- `npx vitest run web/src/engine/format/anchors.test.ts
  web/src/engine/format/mermaidExport.test.ts web/src/engine/render/anchors.test.ts
  web/src/ui/CanvasController.test.ts` — 106 tests passed at that stage.
- `npx vitest run web/src/engine/render/anchors.test.ts
  web/src/engine/render/router.test.ts web/src/ui/CanvasController.test.ts` —
  71 tests passed after the terminal-routing regression fix.
- `go test ./internal/pdl ./internal/ir` — parser/IR parity passed.
- `node scripts/corpus-accept.mjs` — fixtures regenerated; subsequent full TS and Go
  suites passed. No `.ir.json` golden was hand-edited.
- `npx playwright test e2e/cx01-endpoints.spec.ts e2e/p6-routing.spec.ts
  e2e/p3-waypoints.spec.ts` — 4 tests passed.

## Terminal render evidence

The real binary was built and run against `/tmp/cx01-cli.pcd`:

- `panelcraft validate` — `1 files checked, 0 errors, 0 warnings, 0 infos`.
- `panelcraft convert` — preserved all six explicit anchors canonically.
- `panelcraft render --out ...svg` and `--out ...png` — both files written and the PNG
  visually inspected. SVG route inspection confirmed exact endpoints:
  - L1 `(190,100) → (480,200)`, orthogonal;
  - L2 `(660,150) → (280,380)`, straight;
  - L3 `(190,500) → (480,430)`, curved through `(620,560)`.

## Accessibility and visual evidence

`e2e/cx01-endpoints.spec.ts` covers person and datastore perimeters, inside/outside
projection, corners, waypoint dragging, all three route modes, resize preservation,
undo/redo, reload, SVG and PNG export. Axe WCAG 2 A/AA and 2.1 AA scans run on the
selected link, during active endpoint dragging, and after resizing in both themes;
none are skipped and all passed.

Reviewed `test-results/screenshots/cx01-{selected,drag-preview,corner,route-straight,
route-curved,route-orthogonal,resized}-{light,dark}.png`. Both entity kinds remain
fully visible; hollow start/filled destination handles are distinct; arrows and labels
remain legible; corner/resize attachment stays exact; no contrast, clipping, spacing,
or end-state defects remain. The earlier clipped-dock and history-flash captures were
re-shot with a clear canvas and transient messages dismissed.

## Common gates

- `npm run check` — TypeScript and ESLint passed.
- `npm test` — 93 files, 988 tests passed; coverage thresholds passed.
- `npm run build` — passed.
- `npx playwright test` — 93 tests passed.
- `go vet ./...` — passed.
- `staticcheck ./...` — passed.
- `gocyclo -over 15 cmd internal web` — passed.
- `go test -count=1 -race -cover ./...` — all packages passed.
- `bash scripts/check-docs.sh` — 9 docs checked, links and PCD fences valid.
- `bash scripts/check-selfcontained.sh web/dist` — no external resource origins.
- `git diff --check` — passed.

The advisory `gocognit -over 15 .` and `gocyclo -over 12 .` scans retain only the
pre-existing unrelated findings in vendored `node_modules/flatted`, existing Go tests,
Mermaid conversion, lexer, flow-step and style helpers. No new CX-01 function appears.

## Residual scope

Perimeter means the normalized rectangular object bounds shared by all entity kinds,
not a separate curved glyph outline. Explicit-anchor orthogonal routing preserves
outward attachment and legacy behavior; broader object/connector avoidance belongs
to CX-02. Storage remains browser-local and all rendering/conversion is self-contained.
