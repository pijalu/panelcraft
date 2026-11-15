<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP06 — Active and selected resize size hints

**Severity:** Medium — direct-manipulation feedback

**Status:** Implemented and verified (2026-11-15).
**Requirement:** 2 — size hints on all selected elements, including the one being resized  
**Depends on:** nothing  
**Branch:** `feat/ux08-resize-hints`

## Single-task outcome

During resize, show current `W × H` on the active object and every selected object, even when no
equal-width/height match exists. Only the dragged object changes size.

## Evidence and UX rationale

`CanvasController.ts:1560-1598` excludes the active object from candidates and draws cues only
for matches. `resize.ts:90-116` produces match-only cues. Reviewed `ux06-both-light.png`: reference
objects show dimensions, active Target does not. Doherty Threshold requires immediate feedback;
Working Memory should not require reading a distant properties field.

## Implementation steps

1. **RED:** extend resize tests to require an active hint during a no-match resize and hints on
   every member of a multi-selection. Existing match-cue assertions remain unchanged.
2. Define the single active resize target as the sole selected object, or the selected object whose
   edge/corner handle was dragged; the active target must have a usable single-object overlay.
3. Introduce a pure transient hint model: active rect plus each selected rect, deduplicated by ID.
   Keep equal-size reference cues separate from unconditional size hints.
4. Reuse the shared formatted `W × H` string. Draw it adjacent to the active resize handle with a
   contrasting background and leader if necessary; clamp it within the visible canvas.
5. Draw one smaller badge near each other selected object using its unchanged model dimensions.
6. Update badges during drag with no post-release jump; end drag restores the same overlay. Keep
   screen-readable type and avoid handle/label overlap at extreme zoom.
7. Apply text/background tokens to the exported-overlay exclusion so labels never enter PNG/SVG or
   presentation. Update the accessible active-size description without per-frame live announcements.
8. Preserve snap/equal-size behavior and one-undo-per-drag. Escape restores geometry and clears
   hints; non-active selected objects and imported ghosts never resize.

## Required checks

```bash
npx vitest run web/src/engine/render/resize.test.ts web/src/ui/CanvasController.test.ts
npm run check
npm run build
npx playwright test e2e/ux06-resize-cues.spec.ts e2e/p1-size.spec.ts
```

Extend `ux06-resize-cues.spec.ts` for no-match active feedback, multi-select, commit and cancel.
Capture no-match, match and multi-select states in both themes.

## Acceptance

- Active and every selected object always show dimensions during resize.
- Equal-size references remain visually distinct; no duplicate hint for the same object.
- Escape restores geometry and removes all hints; commit produces one undo entry.
- No change to unrelated objects, PDL beyond the active object’s committed size, or export output.

## Evidence

Implemented on `feat/ux08-resize-hints`. **RED:** the new controller tests failed with
`svg.querySelector('.pc-size-hint-active')` returning `null` during a no-match resize (nothing
described the active size), and `web/src/engine/render/sizeHints.test.ts` failed to import the
module at all. Both went green after the module and the overlay painting landed.

### What shipped

- `web/src/engine/render/sizeHints.ts` — pure hint model: `sizeText(rect)` (the one rounded
  `W × H` format), `sizeHints(active, others)` (active first, peers with their unchanged rect,
  deduplicated by id), `hintAnchor(rect, handle, gap)` (outside the dragged edge or corner) and
  `clampToView(point, view, margin)`.
- `web/src/engine/render/overlay.ts` — `drawSizeHints()` / `drawSizeHint()`: a pill + label per
  hint, `pointer-events: none`, `aria-hidden` (the canvas narrates instead), the active badge in
  the match colour and every peer badge in the normal foreground. Metrics are divided by the
  world zoom, so the badge keeps the 11 px UI type size on screen instead of shrinking with the
  canvas.
- `web/src/ui/CanvasController.ts` — `resizeMove()` now always paints the active hint (clamped
  inside the viewport) plus a badge per other selected object; `viewRect()` gives the visible
  canvas in canvas units; `resizeStatus(cues, size)` always announces `Size W × H` and appends
  the equal-size matches, so assistive technology gets the same information without a live
  region per badge. `paintIdleOverlay()` draws one handle set per selected object for a
  multi-selection (halos stay single-selection, because linking from an ambiguous member is
  not a decision the canvas should make).
- `web/src/ui/app.css` — `.pc-size-hint*` rules on theme tokens; `web/src/workspace/io.ts`
  also strips `.pc-layer-overlay` from exports (the overlay is interaction chrome).
- `web/src/engine/render/sizeHints.test.ts`, controller tests, an export test and the extended
  `e2e/ux06-resize-cues.spec.ts` cover the model, the drag, the export and the visuals.

### Two defects found and fixed while verifying

1. **The passive badge was invisible in the dark theme.** `app.css` used `var(--pc-text)`, a
   token that does not exist (the real one is `--pc-fg`), so the fill fell back to black on a
   dark canvas. Found by the screenshot review; fixed, and guarded by a new `appTokens` test
   that fails when any `var(--pc-…)` reference is not declared (four runtime-written tokens are
   allow-listed with a comment).
2. **The menu popover stole focus back.** `Menu` focused its first item in a deferred effect, a
   frame *after* the popover was already interactive — a user (or the e2e driver) who had
   already moved into the list lost focus, and Enter activated the wrong item. Found as a
   1-in-6 flake in `ux03-files.spec.ts` under parallel load; the focus move is now a
   `useLayoutEffect`, and `--repeat-each=6 --workers=6` on that spec passes 24/24.

### Tests

```text
$ npx vitest run web/src/engine/render/sizeHints.test.ts web/src/ui/CanvasController.test.ts \
    web/src/ui/appTokens.test.ts web/src/workspace/io.test.ts
Test Files  4 passed (4)   Tests  86 passed (86)

$ npx vitest run            # whole suite
Test Files  110 passed (110)   Tests  1134 passed (1134)

$ npm run check             # tsc + tsc -p tsconfig.sw.json + eslint — clean
```

### Browser checks

```text
$ npm run build && npx playwright test e2e/ux06-resize-cues.spec.ts e2e/p1-size.spec.ts
8 passed (3.3s)

$ npx playwright test e2e/ux03-files.spec.ts --repeat-each=6 --workers=6
24 passed (13.2s)          # the focus-stealing flake was here

$ npx playwright test
124 passed (46.8s)
```

`e2e/ux06-resize-cues.spec.ts` now also asserts the no-match case (a `W × H` badge and a
`Size …` canvas description without any equal-size bracket), a multi-selection drag (one badge
per selected object, the passive object's size unchanged, `Escape` removing every badge and
restoring the geometry) and keeps the equal-size bracket assertions untouched alongside the new
badges.

Screenshots reviewed against the STYLE-GUIDE checklist: `ux06-no-match-{light,dark}` and
`ux08-resize-hints-multi-{light,dark}`. The active badge sits just outside the dragged corner in
the match colour, the peer badge above its object in normal foreground; both stay legible on the
canvas fill. The dark-theme review caught defect 1 above.
