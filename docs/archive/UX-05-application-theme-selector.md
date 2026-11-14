<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-05 Add a persisted System/Light/Dark application selector

**Status:** implemented, validated and reviewed.

## Observed behavior

Application chrome followed only `prefers-color-scheme`. Users could not explicitly choose or persist
Light or Dark independently of the OS, and document/CLI rendering needed to remain independent of the
application preference.

## Expected behavior

- View offers System (default), Light and Dark. System follows live OS changes; explicit choices override
  the OS and survive reload in browser-local workspace settings without a wrong-theme first paint.
- All chrome, editor, dialogs, docked/floating panels, canvas defaults, mini-map and flow visuals use the
  resolved application palette with WCAG contrast and reduced-motion behavior preserved.
- PDL `theme` and CLI `--theme` remain independent. SVG and PNG output use the requested render theme.

## Executed plan

1. Added a validated, versioned application preference to workspace settings. IndexedDB is authoritative;
   a validated `localStorage` value is only a synchronous boot hint. Corrupt, blocked or unknown values
   safely fall back to System without adding storage-schema or network behavior.
2. Added pre-paint root `data-theme` and `data-theme-preference` attributes, live System OS tracking and
   an accessible Application theme selector in View. Explicit choices made during workspace restoration
   are retained rather than overwritten by initialization.
3. Moved dark tokens, banners, problem messages and CodeMirror colors to resolved root-attribute rules.
   Audited major surfaces and fixed active-search contrast and View-menu wrapping found during review.
4. Made CLI serialization temporarily apply the explicit render theme and restore the application root.
   The live and standalone SVGs both freeze the resolved CLI variables so the later Chrome PNG capture
   uses the same palette. Added a same-size resize guard after the full browser suite exposed redundant
   resize events collapsing a settled panel; real narrow-canvas recovery remains covered.
5. Added preference/hook/component/CLI regressions and a three-test browser journey covering persistence,
   OS changes, document independence, panels, mini-map, flows, dialogs, floating layout, ARIA and axe.

## Defects found during validation

- Initial focused tests reproduced the missing preference modules, selector and explicit CLI override.
  A jsdom-only run then exposed absent `matchMedia`; System now has a safe light fallback in that case.
- Axe found media-only banner/problem/token rules in explicit Dark and insufficient white-on-light-blue
  active-search contrast. All now follow the resolved root theme; active search uses dark foreground.
- Visual review found wrapped View labels; the popover is now 240 px wide. The full suite exposed a
  redundant same-size resize event resetting panel recovery, now guarded by a regression test.
- Real CLI smoke caught a defect not visible in serialized SVG: `--theme dark --out …png` was white
  because the application root was restored before Chrome captured the still-live SVG. A new regression
  failed on the missing live-SVG palette, then passed after freezing the explicit variables on that SVG.
  Re-running both real PNG commands produced distinct, correct light and dark images.

## Validation evidence

- Focused theme/selector/layout/CLI run — 5 files, 19 tests passed. The live-PNG regression was observed
  failing before its fix (`null` live SVG style) and passing afterward.
- `npx playwright test e2e/ux05-app-theme.spec.ts` — 3 tests passed; light/dark axe scans clean.
- Decoded ARIA attachments and screenshots in `test-results/screenshots/` were reviewed for major surfaces,
  View selection, floating Flow Steps, History, Snapshots, Clear data and Search in both themes. Labels
  no longer wrap in View, contrast and spacing are consistent, and every surface follows the explicit mode.
- Real CLI light/dark SVG smoke wrote `/tmp/ux05-{light,dark}.svg`; inspected root styles contain
  `--pc-canvas:#fafafa` and `--pc-canvas:#111316` respectively. Real PNG smoke wrote and visually reviewed
  `/tmp/ux05-{light,dark}.png` after the fix.
- `npm run check` — TypeScript and ESLint passed.
- `npm test` — 90 files, 940 tests passed; coverage thresholds passed.
- `npm run build` — production bundle passed; existing chunk-size warning remains.
- `npx playwright test` — 87 tests passed.
- `go vet ./...` and `staticcheck ./...` — passed with no diagnostics.
- Advisory `gocognit -over 15 .` and `gocyclo -over 12 .` retain only the pre-existing vendor, Go parser,
  converter and test findings reported by the earlier items; UX-05 changes no Go files. The scoped
  `gocyclo -over 15 cmd internal web` gate passed earlier in this item.
- `go test -count=1 -race -cover ./...` — all packages passed.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `bash scripts/check-docs.sh` and `git diff --check` — documentation and whitespace gates passed.
  Post-commit clean-worktree evidence is recorded by the final repository gate.
