<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-06 Add equal-size cues and snapping during component resize

**Status:** implemented, validated and reviewed.

## Observed behavior

The canvas snapped resize handles to its 8 px grid and offered a separate Equal size command, but an
active resize gave no indication that another visible object had a nearly equal width or height.

## Expected behavior

- During resize, snap to the nearest eligible visible width, height, or both within 4 canvas units.
  Preserve edges not owned by the active handle and break exact ties deterministically.
- Show subtle red brackets with `W = …` and `H = …` labels and a nonvisual accessible description.
  Cues exist only during resize and never enter PDL, IR, snapshots, or browser storage.
- Preserve the grid, minimum size, all eight handles, groups, read-only imported references, Escape,
  one undo command per resize, undo/redo, and durable dimensions after reload.

## Executed plan

1. Added pure `resizedRectWithCues` geometry around the unchanged `resizedRect` API. Matching applies
   after grid snapping, considers only dimensions owned by the handle, ignores nonfinite or below-minimum
   candidates, and resolves ties by distance, smaller value, then lexical id.
2. Fed other document objects and imported ghosts into the matcher. Ghosts remain read-only. West/north
   handles preserve the opposite edge, and existing minimum-size and eight-handle behavior remains intact.
3. Rendered resize-only horizontal/vertical `--pc-match` brackets with dimension labels, distinct dash
   treatments, and canvas-backed text. Added localized canvas ARIA descriptions while cues are active.
4. Retained the complete original object for Escape and undo. Intermediate resize geometry now repaints
   without emitting application state; commit/cancel owns code synchronization and persistence. This keeps
   transient dimensions out of the editor and storage and avoids live editor churn during accessibility scans.
5. Added pure geometry, controller interaction, persistence, History undo/redo, Escape, accessibility and
   light/dark filmstrip coverage. Documented the interaction and both theme tokens.

## Defects found during validation

- Initial fixtures assumed pointer coordinates were already grid-rounded. Tests now use explicit coordinates
  that account for the existing 8 px grid rather than changing production geometry.
- A persistence fixture made two height candidates equally near; it was corrected so the intended candidate
  is unique. The separate deterministic-tie unit tests retain explicit tie coverage.
- Escape initially left an intermediate resized width in durable state. Retaining/restoring the complete
  original object fixed cancellation and made undo restore the original `size` and label layout as well.
- Axe selector generation failed while the live editor mutated during an active-cue scan. A MutationObserver
  plus an exact static-DOM clone discriminated live DOM churn from cue markup: the clone passed. A new
  regression then failed because intermediate geometry was emitted, and passed after resize repainting was
  made view-only until commit/cancel. The unchanged live active-cue axe assertion now passes in both themes.
- ESLint initially measured `nearestDimension` at complexity 16. Extracting the deterministic comparator
  reduced it without changing behavior; geometry coverage remains 100%.

## Validation evidence

- `npx vitest run web/src/engine/render/resize.test.ts web/src/ui/CanvasController.test.ts web/src/ui/strings.test.ts`
  — 3 files, 71 tests passed.
- `npx playwright test e2e/ux06-resize-cues.spec.ts --workers=1` — 4 tests passed after the final build;
  active-cue WCAG 2.1 AA axe scans passed in light and dark themes, and terminal output showed clean
  persistence, undo/redo/reload and Escape journeys.
- Reviewed all eight captures in `test-results/screenshots/`: `ux06-{width,height,both,no-match}-{light,dark}.png`.
  Brackets align with their reference objects, labels are legible with canvas backing, dimensions and dash
  treatments are not color-only, spacing is consistent, and no-match/commit states leave no stale cues.
- `npm run check` — TypeScript and ESLint passed after the comparator extraction.
- `npm test` — 90 files, 958 tests passed; coverage thresholds passed and `resize.ts` reported 100%
  statements, branches, functions and lines.
- `npm run build` — production bundle passed; existing chunk-size warning remains.
- `npx playwright test` — 91 tests passed.
- `go vet ./...` and `staticcheck ./...` — passed with no diagnostics.
- Advisory `gocognit -over 15 .` and `gocyclo -over 12 .` retain only the previously recorded unrelated
  vendor, Go parser/printer/converter and test findings; UX-06 changes no Go files. The scoped
  `gocyclo -over 15 cmd internal web` gate passed.
- `go test -count=1 -race -cover ./...` — all packages passed.
- `bash scripts/check-docs.sh` — 9 docs checked, links resolve and PCD fences parse.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `git diff --check` and the post-commit clean-worktree gate provide final whitespace/repository evidence.
