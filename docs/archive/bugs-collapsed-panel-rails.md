# Collapsed panels — one tab column per dock

**Status:** fixed and verified.

## Observed behavior

Each collapsed workspace panel renders an independent 36 px `.panel-rail`.
Because each dock is a horizontal flex container, collapsing Files and Flow Steps
(or Code and Properties) produces multiple rail columns instead of one compact
column of panel tabs.

## Expected behavior

Each dock has at most one collapsed-panel column. Every collapsed panel keeps a
labelled, keyboard-focusable expand control inside that column. Expanding one
panel leaves the other collapsed tabs available. The Code tab keeps its sync
status chip, and existing collapse focus restoration continues to work.

## Fix plan

1. Group all non-floating collapsed panels in each dock inside one shared rail
   container while preserving their configured order.
2. Keep open and floating panel rendering unchanged.
3. Make each tab's label part of its expand button so the whole tab is a pointer
   target, not only the chevron.
4. Add dock-aware borders and vertical separators without introducing animation
   or additional scrolling.

## Test approach

- Component regression: the default shell has one left rail group containing
  Files and Flow Steps and one right rail group containing Code and Properties.
- Existing component coverage: rail expansion, keyboard shortcuts, focus return,
  code sync chip, and layout persistence.
- New Playwright coverage: one 36 px group per dock, both labelled tabs visible,
  expanding one tab leaves the other available; capture light and dark images.
- Screenshot review against the style guide: alignment, readable vertical labels,
  visible focus, adequate hit areas, narrow viewport behavior, and both themes.

## Validation steps

Run the targeted component and Playwright specs, the complete TypeScript/static
checks, the full unit suite, and the repository's separately invoked Go quality
commands. Build the web bundle before Playwright so the preview server exercises
the current code.

## Verification evidence

- RED: `npx vitest run web/src/ui/App.test.tsx` failed the new regression because
  `collapsed-rail-left` did not exist; the failure dump showed independent
  Files and Flow Steps `.panel-rail` elements.
- GREEN: the same command passed 21/21 tests after the fix.
- `npm run check` passed TypeScript and ESLint, including the shell function
  length/complexity limits.
- `npm run build` completed successfully before browser testing.
- `npx playwright test e2e/ux08-panels.spec.ts e2e/p1-shell.spec.ts
  e2e/ux02-workspace.spec.ts` passed 16/16 tests. The two new light/dark rail
  scenarios also passed when rerun alone after moving their captures before the
  expansion step.
- `npm test` passed 1309/1309 tests with the configured coverage thresholds.
- `go vet ./...`, `staticcheck ./...`, and `go test -count=1 -race -cover ./...`
  passed. No Go source changed.
- `gocognit -over 15 .` and `gocyclo -over 12 .` reported only pre-existing
  warnings in untouched Go parser/printer/CLI tests plus Go files vendored under
  `node_modules/flatted`; these are unrelated to this TypeScript/CSS-only fix.

## Screenshot review

Reviewed `test-results/screenshots/collapsed-panel-tabs-light.png` and
`collapsed-panel-tabs-dark.png` after the final browser run. Both themes show one
36 px left activity column containing the Files and Flow Steps tabs, one right
column containing Code and Properties, intact labels and separators, and the Code
sync chip. No clipped labels, duplicate columns, unexpected scrolling, or theme
contrast defects were observed. The controls introduce no animation, so reduced
motion behavior is unchanged.
