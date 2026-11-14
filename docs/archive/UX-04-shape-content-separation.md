<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-04 Prevent element text from mixing with glyphs and icons

**Status:** implemented, validated and reviewed.

## Observed behavior

Person labels overlapped the shoulder glyph. Other built-in glyphs and optional icons used the same
label midpoint or unreserved top-right space, so wrapped and resized labels could collide with visual
adornments. Auto-fit and explicit resize did not share all of the renderer's content-space assumptions.

## Expected behavior

- Names, wrapped labels, built-in glyphs, optional icons and imported badges have distinct, predictable
  regions for every applicable element kind.
- Person, datastore, queue, note, group, rectangular objects and imported ghosts remain legible at
  minimum, default and custom sizes, including selected and resized states.
- Icons stay visible without unreadable label clipping. Auto-fit, live edits, pointer resize and reload
  use consistent geometry. The PDL grammar and IR remain unchanged.

## Executed plan

1. Added shared per-kind content reservations and label geometry. Person labels sit below the standard
   glyph, compact short persons use separate horizontal regions, datastore content stays between its
   ellipses, and queue/note/group/rectangular content reserves the appropriate space.
2. Made custom icons scalable for constrained datastore and note regions and reserved room for imported
   badges. Auto-fit consumes the same renderer reservations; explicit narrow labels may use unlimited
   wrapped lines while auto-fit retains its established two-line limit.
3. Recomputed explicit-size wrapping on reload, property changes and pointer resize. Live icon changes
   render and fit immediately through the existing object/style model.
4. Added geometry and component regressions plus a three-test browser journey covering every palette
   kind, light/dark themes, selection, icons, narrow/tall and wide/short resizing, minimum/custom sizes,
   imported badges, reload, ARIA structure and axe WCAG 2.1 AA.
5. Rebuilt `web/dist`, ran the focused and common gates, inspected actual SVG geometry and reviewed the
   screenshot filmstrip before archiving the item for its separate commit.

## Defects found during validation

- Initial geometry tests reproduced person/queue overlap and missing icon auto-fit width. Browser bounds
  initially omitted SVG transforms; assertions now use transformed screen-space rectangles.
- Narrow/tall review exposed two-line text overflow and an overly small compact-person glyph. Explicit
  sizes now wrap without the auto-fit line cap and compact persons use horizontal content regions.
- Pairwise review found datastore and note icons touching their built-in ellipses/fold even after labels
  passed. Added kind-specific scaled icon regions and direct icon-versus-glyph intersection checks.
- Axe found keyboard-inaccessible scroll regions in CodeMirror and Dependencies and insufficient contrast
  on highlighted code tokens. Made the regions focusable and reduced the line-highlight tint; no rules
  were disabled.
- A long unbreakable-word fixture and an off-canvas click were corrected to test the intended geometry
  rather than weaken the behavior under test.

## Validation evidence

- Focused render/measure/controller tests — 70 tests passed after the final changes.
- `npx playwright test e2e/ux04-shape-content.spec.ts` — 3 tests passed; axe scans clean.
- `test-results/screenshots/` — reviewed `ux04-all-kinds-{light,dark}.png`,
  `ux04-selected-person-dark.png`, `ux04-selected-icon-light.png`, `ux04-narrow-tall-light.png`,
  `ux04-wide-short-dark.png`, and `ux04-minimum-imported-{light,dark}.png`. Labels remain contained;
  glyphs, icons, selection and imported badges are legible and separated in both themes.
- `npm run check` — TypeScript and ESLint passed.
- `npm test` — 88 files, 931 tests passed; coverage thresholds passed.
- `npm run build` — production bundle passed; existing chunk-size warning remains.
- `npx playwright test` — 84 tests passed.
- `go vet ./...` and `staticcheck ./...` — passed with no diagnostics.
- `gocyclo -over 15 cmd internal web` — passed (`OK`). Advisory broader complexity scans retain the
  pre-existing parser/converter/test findings recorded during UX-03; UX-04 changes no Go files.
- `go test -count=1 -race -cover ./...` — all packages passed.
- `bash scripts/check-docs.sh` — documentation links and PCD blocks valid.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `git diff --check` — passed. Post-commit clean-worktree result is recorded separately by the final gate.
