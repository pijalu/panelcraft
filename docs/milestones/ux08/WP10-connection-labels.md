<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP10 — Legible connection labels

**Severity:** High — semantic visibility and routing clarity

**Status:** Proposed  
**Requirement:** 8 — labels on connections are not always visible  
**Depends on:** nothing  
**Branch:** `feat/ux08-connection-labels`

## Single-task outcome

Keep connection labels readable and visibly associated with their routes across dense diagrams,
zoom, playback and exports. Fix paint/layer and measurement/placement; do not add manual label
offsets in this WP.

## Evidence and UX rationale

Labels live in the link layer painted before objects (`scenegraph.ts:128-133,264-301`), so fallback
placements can be covered. `labelLayout.ts:90-141` estimates width by character count and accepts
minimum collisions. Proximity requires unambiguous ownership; Selective Attention requires stable
readable feedback rather than hidden labels.

## Implementation steps

1. **RED:** create a dense fixture with solid-object overlap, route/label crossings and long text.
   Include a case where the current minimum-conflict fallback is painted beneath an object.
2. Split route and label paint layers: routes remain below objects; labels render above objects.
   Preserve hit testing and pointer pass-through.
3. Measure actual text, wrap to bounded width/line count and use identical boxes for collision
   and paint. Keep full text available to assistive technology and hover; do not silently discard
   labels.
4. Generate candidates along eligible route segments plus normal offsets. Score object, unrelated
   route and prior-label collisions, then distance with deterministic tie-breaking. Add a subtle
   leader only when displacement is large enough to make ownership unclear.
5. Use canvas-themed contrast/halo or backing, including faded/selected/playback states. Verify
   orthogonal/straight/curved geometry, minimap/export parity and 10%–400% zoom.
6. Re-run the 300-object performance baseline after adding the layer and spatial work.

## Required checks

```bash
npx vitest run web/src/engine/render/labelLayout.test.ts web/src/engine/render/scenegraph.test.ts
npm run check
npm run build
npx playwright test e2e/p6-routing.spec.ts e2e/cx02-overlap.spec.ts e2e/perf-baseline.spec.ts
```

Add dense-label browser geometry and screenshot assertions in light/dark and animation end states.
Update curated goldens only through `UPDATE_GOLDENS=1` after reviewing the intentional changes.

## Acceptance

- Every dense-fixture label is readable, inside the visible canvas when its route is visible, and
  not painted beneath an object.
- Displaced labels retain clear ownership; fallback placement is deterministic.
- No label is dropped for length alone; accessibility/export output contains the full content.
- Performance remains within N1 or a measured regression is fixed before completion.

## Evidence

Pending. Record original occlusion geometry, green checks, performance numbers and screenshots.
