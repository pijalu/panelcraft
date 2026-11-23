<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed bug: selected-link handles obscured connector labels

Source: `bugs.md`, item “Keep selected-link handles clear of label text”.
Status: fixed, browser-verified and closed.

## Observed behaviour and expected contract

Adding a label to a bent connector and leaving the connector selected painted the
square segment-move handle over the label. The supplied capture,
`/Users/muaddib/Library/Caches/goa/images/goa-image-342661182.png`, showed the
handle obscuring the middle of `test`.

The complete label and every editing handle must remain legible while a connector
is selected. Handles must not cover label text at any supported zoom, and pointer
and keyboard movement of the same segment must continue to work.

**Severity: medium.** The connector remained editable, but its label became
difficult to read during that edit. The editing overlay is painted above the label
layer, and each fixed 9×9 handle was centred on its channel midpoint without
checking label geometry. This localised the defect to handle placement rather than
text rendering. Reversing the layers would only hide the handle instead.

The UX review used the **Flow** lens: routine editing chrome must not interrupt
reading and editing the connector's label.

## Fix plan and test approach

1. Reproduce with an orthogonal connector whose label occupies the midpoint of a
   slidable horizontal segment; record the failing browser capture.
2. Compare the painted label box and every segment-handle box. Cover horizontal
   and vertical channels, short and wrapped labels, and confirm that the number of
   editable channels does not change.
3. Make handle placement label-aware and move a colliding handle to the nearest
   clear position on the same slidable channel.
4. Validate pointer dragging and keyboard nudging on the displaced handle, then
   review light and dark captures at several zoom levels.
5. Run the static checks, focused renderer/controller unit tests, connector-routing
   browser scenarios, full coverage suite, and each required Go quality tool.

## Reproduction evidence

Before the production change:

- `npx playwright test e2e/bugs-selected-link-labels.spec.ts --project=chromium`
  failed both new scenarios. The geometry assertion reported
  `segment handle 0 must clear {"x":212.5,"y":142.5,"w":37,"h":19}` with
  `Received: true` for the overlap check.
- `npx vitest run web/src/engine/render/overlay.test.ts web/src/ui/CanvasController.route.test.ts`
  failed three regressions: horizontal short-label clearance, vertical
  wrapped-label clearance, and controller use of the painted label bounds. The
  other 17 tests passed.

The failing browser capture was
`test-results/artifacts/bugs-selected-link-labels--2e57e-ay-legible-at-zoom-extremes-chromium/test-failed-1.png`.
The test artifacts directory was subsequently reused by later runs; the reviewed
fixed captures listed below are the retained visual evidence.

## Implementation

- `SceneRenderer.linkLabelRect` exposes the exact world-space rectangle already
  used to paint the selected connector's label.
- `CanvasController.drawLinkHandles` supplies that rectangle to the segment-handle
  renderer. Pointer dragging and keyboard nudging still identify the channel by
  its existing data attributes; no editing operation was rewritten.
- `drawSegmentHandles` leaves an already clear midpoint unchanged. On collision it
  computes the nearest clear position before or after the label, with a 4 px gap,
  moving only along the handle's horizontal or vertical channel. Label and handle
  geometry are both world-space, so the same clearance holds under viewport zoom.

## Plan updates during testing

- The first browser setup double-clicked a route where a segment handle already
  sat, so it did not open the label editor. The reproduction now selects the route
  and presses Enter, then edits the label while the connector remains selected.
- A drag can canonicalise a route and renumber its segment channels. The combined
  pointer/keyboard scenario now re-queries the equivalent current channel by axis
  instead of focusing a stale pre-drag index. This was a test correction; the
  pointer edit itself had already succeeded.
- Filmstrip review caught a dark capture mislabeled as light and an off-centre
  zoom anchor. The final scenario explicitly sets each theme and anchors wheel
  zoom on the label. It also asserts the actual 0.1 and 4 world scales.

## Verification

- Focused unit run:
  `npx vitest run web/src/engine/render/overlay.test.ts web/src/engine/render/scenegraph.test.ts web/src/engine/render/labelLayout.test.ts web/src/engine/render/routeEditing.test.ts web/src/ui/CanvasController.route.test.ts`
  exited 0: **5 files, 102 tests passed**.
- Full unit and coverage run: `npm test` exited 0: **167 files, 1836 tests passed**;
  configured coverage thresholds were enforced.
- `npm run check` exited 0: both TypeScript configurations and ESLint passed.
- `npm run build` exited 0. Vite retained its existing large-chunk warning.
- Focused browser run:
  `npx playwright test e2e/bugs-selected-link-labels.spec.ts e2e/ux08-connection-editing.spec.ts e2e/ux08-connection-labels.spec.ts e2e/ux08-link-properties.spec.ts e2e/p6-routing.spec.ts e2e/p3-waypoints.spec.ts --project=chromium`
  exited 0: **23 scenarios passed**. This includes short and wrapped labels,
  horizontal and vertical channels, unchanged channel counts, 10% and 400% zoom,
  pointer dragging, and keyboard nudging.
- `go vet ./...` exited 0 with no findings.
- `staticcheck ./...` exited 0 with no findings.
- `gocyclo -over 15 cmd internal web` exited 0 with no functions over the CI limit.
- `go test -count=1 -race -cover ./...` exited 0 for every package. No Go source
  changed in this fix.

### Filmstrip and vision review

Reviewed captures under `test-results/screenshots/`:

- `selected-link-label-handles-light.png`
- `selected-link-label-handles-dark.png`
- `selected-link-label-handles-zoomed-out-light.png`
- `selected-link-label-handles-zoomed-out-dark.png`
- `selected-link-label-handles-zoomed-in-light.png`
- `selected-link-label-handles-zoomed-in-dark.png`

Style-guide checklist outcome: existing panel alignment, contrast, spacing and
focus treatment are unchanged; the label and displaced handle have clear visual
separation; both themes retain the same geometry; no animation or external asset
was introduced. At 10% zoom the geometry assertion proves non-overlap where the
full-page text is naturally too small to read, while the 100% and 400% captures
make the clearance directly visible. No new visual defect remained.
