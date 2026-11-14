# CX-04: visual route, line and arrow selection

**Completed:** 2026-11-14

**Scope:** connector styling is chosen from previews instead of text-only dropdowns, without
changing what the format can store.

## Implemented behaviour

- New `ui/VisualPicker.tsx`: a decorative tile in front of a **real radio group**, so each
  option keeps a native radio (arrow-key navigation, `checked`, accessible name) while the
  visible tile shows an inline SVG preview plus a text label.
- Selected state is not colour-only: the tile gains a check badge, a doubled border ring and a
  semibold label, and the preview switches from muted to full foreground.
- `ui/connectorOptions.tsx` defines the previews (48×20, `currentColor`, `<title>`-labelled)
  for:
  - **Route**: orthogonal, straight, curved.
  - **Line**: solid, dashed, dotted.
  - **Weight**: thin 1, normal 1.5, bold 2, heavy 3; the numeric **Width** field stays for any
    other value.
  - **Head** and **Tail**, independently: arrow, open arrow, diamond, circle, square, none.
- Wiring keeps the existing update semantics: orthogonal route is still stored as "no `route`
  key", the other routes are written to the link style block, and every change is one
  undoable controller edit that reaches the file.
- No document/IR change: the visual layer exposes exactly the options the format already had.

## Executed plan and debugging record

1. **Component + wiring:** replaced the five link `<select>`s with `VisualPicker`s and moved
   them into `ConnectorStyleControls`. ESLint caught `LinkFields` at complexity 13, so the
   connector block was extracted instead of raising the limit.
2. **Existing tests updated to the real interaction:** `PropertiesPanel.test.tsx`,
   `e2e/p1-links.spec.ts`, `e2e/p6-routing.spec.ts` and `e2e/cx01-endpoints.spec.ts` now click
   the tiles/radios; assertions still verify the same canvas attributes (`marker-start`,
   `marker-end`, `stroke-width`, `pc-dashed`/`pc-dotted`, `d` geometry) and file text.
3. **Component RED:** the first `VisualPicker.test.tsx` run failed with `document is not
   defined` (missing `@vitest-environment jsdom`) and then with duplicate radios, because the
   preact testing-library cleanup is not automatic here; both were test-harness fixes.
4. **E2E RED:** `marker-end` for the "none" head is the literal `none`, not
   `url(#pc-marker-none)`; the assertion now matches the renderer.
5. **Visual review fix:** the last weight tile stretched across the full row because the tiles
   used `flex: 1 1 auto`; changed to `flex: 0 1 auto` so every tile is content-sized.

## Focused and common validation

- `npx vitest run web/src/ui/VisualPicker.test.tsx web/src/ui/PropertiesPanel.test.tsx` —
  **11 tests passed**.
- `npx playwright test e2e/cx04-connector-style.spec.ts` — **2 tests passed** (light, dark).
- `npm run check`, `npm test`, `npm run build`, `npx playwright test` — passed.
- `go test ./...`, `go vet ./...`, `staticcheck ./...`, complexity gates — passed.
- `bash scripts/check-docs.sh`, `check-selfcontained.sh web/dist`, `git diff --check` — passed.

## Accessibility and visual review

- axe WCAG 2.1 A/AA is clean with the tiles rendered in both themes, docked and floating.
- Reviewed `test-results/screenshots/cx04-{pickers-default,style-gallery}-{light,dark}` and
  `cx04-{floating,reduced-motion}-{light,dark}` (8 captures).
- Both themes: previews read against the panel surface, the check badge plus ring plus
  semibold label identify the selection without relying on hue, the six marker tiles fit three
  per row, and the reduced-motion capture keeps every control and preview (nothing is
  animation-gated).
- The floating properties panel keeps the same tiles and stays scrollable.

## Deliberate limitations

- A custom width (for example 2.5) selects no weight tile — the numeric field shows the real
  value, and the component test pins that no preset pretends to be active.
- Marker tiles are drawn as schematic glyphs, not the exact canvas marker assets; the canvas
  itself remains the source of truth for the rendered arrowhead.
