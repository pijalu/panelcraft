<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: long file names hiding the file actions

Source: `bugs.md`, queued item 8. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §4.

## Observed behaviour

In the Files panel a long `.pcd` name pushed the row's duplicate / rename /
delete buttons out of the panel. The name itself did not wrap: it was a
single-line flex item with `overflow: hidden; text-overflow: ellipsis`.

## Reproduction

`e2e/bug08-long-filenames.spec.ts` opens a 760×720 window, creates
`nested/deeper/extremely-long-unbroken-filename-that-would-overflow-any-panel.pcd`
and measures the row. Before the fix the spec failed on two counts:

```
Error: expect(received).toBeGreaterThan(expected)
Expected: > 1
Received:   1                    # the name never wrapped; it was clipped
Error: expect(locator).toBeVisible() failed
Locator: getByTestId('tree-context-menu')
Error: element(s) not found      # there was no row menu at all
```

The cause was measurable rather than a guess: `.tree-name` had
`flex: 1; min-width: 0`, but its parent `.tree-label` had **no CSS rule at all**.
An unstyled flex item keeps `min-width: auto`, so the label refused to shrink
below the name's content width and pushed `.tree-actions` past the panel edge —
the ellipsis never had a narrower box to work with.

## Contract

1. **Only the name shrinks.** `.tree-label` becomes a shrinkable flex item
   (`display: flex; flex: 1 1 auto; min-width: 0`), the action area never shrinks
   (`flex: none`), and nothing in the tree overflows horizontally.
2. **The wrap is bounded.** The name wraps, but at most two lines, then an
   ellipsis; the row keeps a predictable height. Unbounded wrapping was tried
   first and rejected in the vision review: at a narrow panel width the name
   became a column of two-letter fragments and one row grew to a dozen lines,
   which is a different defect. The full name stays discoverable through the
   button's tooltip and the tab strip.
3. **The same actions exist a second way.** The row context menu offers open,
   duplicate, rename and delete — the row's inline actions, not a new command
   set — for touch users and for rows squeezed too far to aim at an icon.
4. **One menu implementation.** The row menu is the shared surface from item 7
   (`ContextMenu` → `FloatingMenu`); only the surface id, accessible name and
   test ids are parameterised, so placement, internal scrolling, arrow/Home/End
   navigation, Escape/Tab dismissal and focus-visible styling cannot drift apart
   from the canvas and application menus.
5. **The menu acts on its own row, and focus comes back.** Actions run against
   the row the menu was opened from (duplicating a nested file stays in its
   folder), delete keeps the existing two-step inline confirmation, and closing
   the menu — or cancelling a rename it started — returns focus to that row
   instead of the document body.
6. **Keyboard and pointer are equal.** Right-click and the platform context-menu
   chord (`Shift+F10`, the dedicated context-menu key) both open the row menu;
   only the primary button starts a drag, so a right-click is never a pan/drag.

## Implementation

| File | Change |
|---|---|
| `web/src/ui/fileRowMenu.tsx` | new: `useRowMenu` — entry set per row kind, placement request, focus return |
| `web/src/ui/FileTree.tsx` | row menu wiring (`onContextMenu` + key chord), `useRowDrag` hook, `RenameInput` (focus via layout effect), name clamped in a `<span class="tree-text">` with a `title`, focus restored when a rename ends |
| `web/src/ui/ContextMenu.tsx` | `id` / `label` / `testId` / `itemTestIdPrefix` props so one surface serves the canvas and the tree |
| `web/src/ui/app.css` | `.tree-label` shrinks, `.tree-text` clamps to two lines, `.tree-actions` never shrinks |
| `web/src/ui/strings.ts` | "Open", "File actions" |

## Verification

```
$ npm run check
> tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .
(no errors)

$ npm test
 Test Files  119 passed (119)
      Tests  1354 passed (1354)

$ npx vitest run web/src/ui/fileRowMenu.test.tsx
 Test Files  1 passed (1)
      Tests  5 passed (5)

$ npm run build && npx playwright test e2e/bug08-long-filenames.spec.ts
  4 passed (1.6s)

$ npx playwright test
  178 passed (1.2m)

$ bash scripts/check-docs.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid

$ bash scripts/check-jargon.sh HEAD
OK — no opaque identifier-only references added since HEAD
```

The browser spec asserts real geometry: the name is more than one line and at
most three, the full name is present in the tooltip, both action rectangles stay
inside the row and inside the tree, and `scrollWidth - clientWidth ≤ 1` for the
tree. It also drives the menu by pointer and by `Shift+F10`, checks the entry
set, that choosing Rename opens the inline input and closes the menu, that
cancelling leaves focus inside the same row, that duplicate lands next to its own
folder instead of the workspace root, and that a wrapped row still opens on
Enter with its full accessible name. Accessibility scans (axe, WCAG 2.1 AA) run
on the narrow row and on the open row menu.

Vision review (`item8-long-name-narrow.png`, `item8-long-name-narrow-dark.png`,
`item8-row-context-menu.png`) found one defect and changed the fix: wrapping
without a clamp turned a narrow panel into a column of letters — hence the
two-line clamp with a tooltip. Light and dark both read correctly, the action
icons are inside the row, and the clamped row keeps the list rhythm.

## Residual risks

- The clamps hide part of a very long name behind an ellipsis and a tooltip. On a
  touch device there is no hover tooltip, so the tab strip and the row menu's
  actions are the remaining path to the full name; a narrower panel shows less of
  it. The alternative (unbounded wrapping) was measurably worse.
- A folder row's menu has no duplicate entry because duplicating a folder is not
  an operation the workspace manager offers; the inline actions match.
- Focus moves back to the row when the menu closes, including after *Open*: the
  editor does not claim focus on open, so the row is where the user was.
