<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: presentation step badge vertically miscentred

## Observed

The affected circle is the **SVG beat badge** (`.pc-badge-dot` plus its
`.pc-badge-num` label), not the dock's text counter (`.present-counter`).
`FlowAnimator.badge` placed the circle centre at `(x, y)` but the number's
`y` attribute at `y + 4`, while `.pc-badge-num` is also styled with
`dominant-baseline: central`. The existing unit test asserted only the label's
text value, so it could not catch a geometry error. The original bug report's
suggestion to inspect `.present-counter` would have measured the wrong element.

## Investigation before editing

- `git log -S "y + 4" -- web/src/engine/anim/engine.ts` and
  `git log -S "dominant-baseline: central" -- web/src/ui/app.css` both point to
  commit `512a548` (M5 flows & animation): the offset and the central baseline
  were introduced together. The `+ 4` is a leftover compensation from an
  alphabetic baseline — with `dominant-baseline: central` the text `y` attribute
  *is* the glyph box's vertical centre, so adding 4 pushes the number down by
  exactly four SVG units inside an 11-unit-radius dot.
- Horizontal centring was already correct (`text-anchor: middle`, matching `x`
  to `cx`); only the vertical axis was wrong. The dock's text counter was left
  untouched — it is a separate HTML element with its own layout.

## Plan

1. Add a failing SVG geometry assertion comparing the text centre with the
   circle centre for one-, two- and three-digit step numbers (1, 10, 100).
2. Add a Chromium `getBBox()` measurement in the presentation e2e, reading the
   real glyph box in SVG user units rather than trusting attributes alone.
3. Make the smallest change in the badge renderer only: put the number on the
   circle centre, keeping the existing font-size and baseline styling tokens.
4. Capture presentation screenshots in light and dark themes and review them
   against the style-guide checklist.
5. Run `npm run check` and `npm test`.

## Regression evidence — failed before the fix (RED)

- Focused unit test (new assertion) on the unmodified renderer:
  `npx vitest run web/src/engine/anim/engine.test.ts -t "centres the step number"` →
  `AssertionError: expected -10 to be -14`; the number was at y = −10 while the
  circle centre was at y = −14 (the +4 offset).
- Focused browser test, rebuilt from unmodified sources
  (`npx playwright test e2e/p2-present.spec.ts -g "F-16: presenting hides chrome" --workers=1`):
  `BADGE_GEOMETRY {"circleMidY":26,"textMidY":30,"circleMidX":216,"textMidX":216,"label":"3"}`
  → `Expected: < 1.5, Received: 4`. Horizontal centres matched; vertical centre
  was 4 units low, as predicted.

## Minimal fix

In `web/src/engine/anim/engine.ts`, the badge renderer now sets the number's
`y` to the circle centre `y` instead of `y + 4`. No CSS, type/spacing token,
dock counter, or unrelated code changed. The centre calculation stays in the
renderer.

## Verification evidence — passed after the fix (GREEN)

- `npx vitest run web/src/engine/anim/engine.test.ts` → **14 passed**; the new
  assertion covers 1, 10 and 100 and the existing label-value test is unchanged.
- Rebuilt (`npm run build`) and reran the focused browser test:
  `BADGE_GEOMETRY {"circleMidY":26,"textMidY":26,"circleMidX":216,"textMidX":216,"label":"3"}`
  → **1 passed**; measured vertical and horizontal centre offsets are now 0.
- `npm run check` → exit 0 (TypeScript and ESLint clean).
- `npm test` → **132 files, 1493 tests passed**, coverage thresholds green.

### Screenshots and vision review

Light/dark presentation captures written by the passing e2e run:

- `test-results/screenshots/p2-present-light.png`
- `test-results/screenshots/p2-present-dark.png`

Reviewed against the `docs/STYLE-GUIDE.md` screenshot checklist with the
Laws of UX skill (Law of Prägnanz — a clear, orderly glyph silhouette):

- Alignment: the "3" glyph is optically centred in the dot in both themes;
  magnified crops show equal top/bottom padding and no clipping.
- Contrast: light theme uses a white number on the blue accent dot; dark theme
  uses the dark background token on the lighter accent dot — both legible.
- Spacing, focus/selection, empty states and animation end states: unchanged by
  this fix; the settled presentation frame still matches the static capture.
- Theme parity: light and dark differ only in token colours; the badge dot and
  number are present in both.
- Self-containment: no external fonts, icons or CDN assets visible.

Outcome: **pass**, no defects filed.

No residual risk beyond the existing font-metric dependence: the browser
measurement uses a 1.5-unit tolerance because `getBBox()` reports tight glyph
ink boxes, which vary slightly with the installed font; the measured offset at
the pinned test font is 0.
