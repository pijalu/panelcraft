# DOC-01: reconcile stacking-order documentation with actual commands

**Completed:** 2026-11-14

**Scope:** the user guide must describe the commands the canvas really offers, and must not
advertise stacking commands that do not exist.

## Problem

`docs/USER-GUIDE.md` claimed the context menu included "bring to front". The shipped menu
(`web/src/ui/CanvasMenu.tsx`) never had that command, and CX-03 deliberately shipped layering
as a properties control instead of menu commands.

## Implemented behaviour

- The guide now lists the menu labels exactly as they render: **Duplicate**, **Copy**,
  **Paste**, **Delete**, **Align left**, **Align centre (horizontal)**, **Align right**,
  **Align top**, **Align middle (vertical)**, **Align bottom**, **Distribute horizontally**,
  **Distribute vertically**, **Equal size**, and states that the multi-object commands stay
  listed but disabled when the selection is too small.
- The unsupported "bring to front" claim is gone; the same bullet points layering at
  **Stacking order** in properties → Advanced, which is what CX-03 shipped.
- `docs/SPEC.md` (FR-C10) and `docs/FIX-PLAN.md` (F-19) were re-read and already matched the
  shipped commands, so they needed no change.

## Regression guard

`e2e/doc01-context-menu.spec.ts` runs in light and dark and asserts three things:

1. A single-object selection renders exactly the documented label list, in order.
2. A three-object selection enables **Distribute** and **Equal size**, proving the documented
   multi-object behaviour is real.
3. The guide text contains every documented label, no longer matches `bring to front`, and
   still documents **Stacking order**.

The menu is also captured (`doc01-context-menu-{light,dark}.png`) and scanned with axe
WCAG 2.1 A/AA while open.

## Executed plan and debugging record

1. **Guide rewrite:** replaced the shorthand bullet with the exact labels plus the layering
   pointer.
2. **E2E, first RED:** `Distribute horizontally` was disabled — distribute requires three
   objects, so the fixture grew a third system and the guide text was corrected to say the
   multi-object commands need two or three objects.
3. **E2E, second RED:** shift-clicking the third object timed out because the Code panel
   covered it at that canvas width. The fixture now uses saved view positions and collapses
   the Code panel; `close-code` turned out to be a hidden action (playwright reported "element
   is not visible"), so the visible `collapse-code` chevron is used.
4. **E2E, third RED:** the guide-shape assertion demanded the literal label `Align left` while
   the guide used shorthand. The guide now lists literal labels — documentation follows the UI,
   the assertion was not weakened.

## Focused and common validation

- `npx playwright test e2e/doc01-context-menu.spec.ts` — **2 tests passed** (light, dark).
- `npx playwright test` — full Chromium suite passed (see commit evidence).
- `npm run check`, `npm test`, `npm run build` — passed.
- `bash scripts/check-docs.sh` — 9 documents, links and PCD fences valid.
- `go test ./...`, `go vet ./...`, `staticcheck ./...`, complexity gates — passed.
- `bash scripts/check-selfcontained.sh web/dist`, `git diff --check` — passed.

## Accessibility and visual review

- axe WCAG 2.1 A/AA reported no violations with the menu open in either theme; the menu
  entries expose the `menuitem` role and disabled state.
- Reviewed `test-results/screenshots/doc01-context-menu-{light,dark}.png`: the full label list
  is readable in both themes, `Paste` shows a clear disabled treatment, the menu does not clip
  or overflow the canvas, and no stacking entry appears.
