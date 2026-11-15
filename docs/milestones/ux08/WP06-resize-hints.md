<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP06 — Active and selected resize size hints

**Severity:** Medium — direct-manipulation feedback

**Status:** Proposed  
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

Pending. Record original missing-hint failures, green checks and screenshot review here.
