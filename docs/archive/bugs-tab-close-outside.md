<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: a tab's close cross could sit outside the tab outline

## Observed

Reported with a screenshot of the tab strip: the open tab drew its name inside a
bordered, rounded tab shape, while the close cross was painted just outside that
shape, floating on the strip background.

## Cause

The chrome (border, radius, background) belonged to the **name button**, and the
close button was its sibling:

```
.tab                      (layout box, no chrome)
├── .tab-name   ← border 1px, radius, background
└── .tab-close  ← margin-left: -2px, no chrome
```

A 2 px negative margin made the cross overlap the name's border by two pixels;
anything wider than that — a longer name, a wider glyph, a different font
metric — was painted outside the tab's outline. The screenshot shows a short
name ("test") already outside, so the overlap never actually covered the cross.

## Fix

`web/src/ui/app.css`: the chrome moves to the tab itself, so the outline wraps
the name *and* its close button by construction:

- `.tab` gains the padding, the transparent 1 px border, the radius and the
  background; `.tab.tab-active` adds the accent border and the active surface.
- `.tab > .tab-name` loses its own border, radius and background, keeps the
  140 px ellipsis limit and gains `min-width: 0` so a long name truncates inside
  the chrome instead of pushing the cross out.
- `.tab > .tab-close` loses the negative margin and centres itself.

No DOM change, no new state, no behaviour change: the same buttons with the same
test ids, labels and handlers.

## Regression evidence — failed before the fix (RED)

The browser test measures real boxes: for every tab it finds the element that
actually paints a right border (what the user reads as "the tab") and requires
the close button's box to be inside it.

```
npx playwright test e2e/bugs-tab-close-inside.spec.ts --workers=1
  3 failed
  ●untitled.pcd cross right edge inside the tab outline
  ●short.pcd cross right edge inside the tab outline (light and dark)
  ●narrow.pcd cross right edge inside the tab outline
```

## Verification evidence — passed after the fix (GREEN)

```
npx playwright test e2e/bugs-tab-close-inside.spec.ts --workers=1   → 3 passed
npx vitest run web/src/ui                                        → 603 passed
```

Scenario coverage: a short name, a deliberately long name, and a 420 px viewport,
in light and dark. The computed styles confirm the visual contract survives the
move — the active tab keeps its accent border (`rgb(51 58 69)` in the dark theme)
and its raised surface against the strip, and inactive tabs stay chrome-free.

## Screenshot review

`test-results/screenshots/tab-close-inside-{light,dark}.png` and a zoomed strip
capture during review: the cross now sits inside the tab's rounded outline for
both the short and the long name, the dirty dot still precedes the name, and the
light/dark pair differs only by tokens. The active tab stays distinguishable
(the raised surface plus the 1 px accent border is unchanged from before, only
wider by the cross it now contains).

## Residual risk

Tabs are one pixel taller (23 px content box) because the chrome's padding now
wraps the cross; the strip's `min-height` absorbs it and no layout depends on the
old height. The negative-margin trick is gone, so a future change that adds
something after the close button would grow the tab instead of overlapping it.
