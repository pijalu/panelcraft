<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: make the editor grid visibly available

Source: `bugs.md`, queued item 12. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §8.

## Observed behaviour

A fresh editor canvas showed no grid at all. The renderer existed, the
**Grid: off / dots / lines** menu items existed, and the `G` shortcut existed,
but the shipped default was `off`, so nothing was drawn until the user asked for
it. The report also asked whether the menu commands and the shortcut were
broken; both worked, so the defect was the default plus the migration story that
made changing the default risky.

## Reproduction

Before the change, `e2e/ux08-grid.spec.ts` asserted the old contract directly:
"Nothing is drawn before the user asks for a grid" —
`gridFill(page)` returned `null` on a fresh profile. `web/src/engine/render/grid.ts`
returned `{ version: 1, type: 'off', snap: true, last: 'dots' }` from
`defaultGrid()`, and a stored record that was missing or corrupt fell back to the
same hidden default.

The reason the hidden default could not simply be flipped is the migration
question: version-1 records only recorded the *result*, so "never chose" and
"chose Off" were indistinguishable. Flipping the default blindly would have
silently switched the grid on for users who had explicitly turned it off.

## Root cause

The preference record could not distinguish a missing preference from an
explicit `off`, so the safe fix was to keep the hidden default instead of
showing a grid. The record gives us that distinction for free, and the fix uses
it: `useCanvasGrid` persists a record **only when the user changes something**
(`commit()` is the single writer), so a stored, valid `type` field is by
construction a user choice, while a missing or corrupt field is a missing
preference.

## Implementation

- `web/src/engine/render/grid.ts`
  - `defaultGrid()` now returns `{ version: 2, type: 'dots', snap: true, last: 'dots' }`:
    a subtle visible grid with snapping on, for a profile that never chose.
  - `GRID_VERSION = 2` documents the record version; the migration decision
    itself is made **per field** in `normaliseGrid()`: a present, valid `type`
    (including `off`) is preserved verbatim, a missing or invalid field takes the
    current default. Snapping keeps its own independent rule.
  - The grid is editor chrome only; the default changes nothing about document
    geometry, so showing it cannot move a shape.
- `web/src/ui/useCanvasGrid.ts` initialises from the manager's stored record
  instead of the bare default, so an explicit `off` cannot flash the default grid
  on the first frame after a load.
- `web/src/engine/render/grid.test.ts` pins the new contract: visible default,
  "never chose" fallback, and preservation of every explicit version-1 choice.
- `e2e/ux08-grid.spec.ts` proves the fresh-profile default, the `G` toggle, menu
  radio state, and both-theme captures. An attempt to seed a version-1 record
  directly in IndexedDB and reload proved unreliable — the app's own autosave
  rewrote the record between the seed and the reload — so the migration path is
  asserted in the unit test where it is deterministic, and the browser test
  covers the user-visible behaviour through the real UI.
- Intentionally retained: snapping independence, the last-visible-type memory
  behind `G`, and the sub-50 % zoom suppression that stops the pattern turning
  into an even tint.

## Verification

Commands run, actual output:

```
$ npm run check
> tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .
(no errors)

$ npm test
 Test Files  117 passed (117)
      Tests  1322 passed (1322)
(coverage thresholds met for every core package)

$ npm run test:perf
 Test Files  2 passed (2)
      Tests  8 passed (8)

$ npm run build && npx playwright test e2e/ux08-grid.spec.ts
  4 passed (5.4s)

$ npx playwright test
  161 passed (1.1m)

$ bash scripts/check-docs.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
```

Vision review (`test-results/screenshots/ux08-grid-default-{light,dark}.png`):
dots are perceptible at 100 % without competing with shape labels, contrast is
adequate in both themes, and the minimap stays grid-free, which confirms the
grid remains editor-only chrome.

## Residual risks

- A version-1 profile that stored `off` after only changing **snapping** keeps
  the grid hidden. That is deliberate: the stored value is treated as a choice,
  and the user can switch the grid on from the View menu or with `G`.
- The visible default changes every profile that never chose a grid, which
  alters the first-frame appearance for those users; the snapshots above are the
  review record for that change.
