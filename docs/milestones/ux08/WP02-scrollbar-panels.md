<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP02 — Scrollbar-safe responsive panels

**Severity:** High — property visibility and functional reachability

**Status:** Implemented and verified (2026-11-15)
**Requirement:** 7 — panels, including Properties, are partially blocked by scrollbars  
**Depends on:** nothing  
**Branch:** `feat/ux08-scrollbar-panels`

## Single-task outcome

Make docked, bottom and floating panels usable with classic and overlay scrollbars at every
supported panel width. Fix layout ownership only; WP03 owns the broader VS Code visual theme.

## Evidence and UX rationale

- `.properties` is fixed at `232px` and scrolls (`app.css:525-531`), while
  `.panel-host-content` also scrolls (`app.css:3060-3067`).
- Hosted CSS selects `.props-panel`, but `PropertiesPanel.tsx:193,393,471` renders `.properties`.
- `ShellSlots.tsx:82-110` nests Properties and Dependencies under the host.
- Flow and Fitts’s Law require reachable controls without lost context or obscured hit targets.

## Implementation steps

1. **RED:** add browser geometry coverage for Properties and Flow Steps at host widths
   200/232/280/420 px, with long content and classic scrollbars. Assert the final control’s
   rectangle is inside the visible content area and `scrollWidth <= clientWidth`.
2. Make one container own vertical scrolling per hosted panel. Preserve the CodeMirror scroller
   as the intentional exception; avoid nested independent Properties/Dependencies traps.
3. Apply `min-width: 0`, `min-height: 0`, fluid width and `scrollbar-gutter: stable` to the
   correct host/content elements. Align the `.props-panel`/`.properties` naming contract.
4. Remove duplicate inner panel titles where `PanelHost` already displays the same title. Keep
   section headings and accessible landmark names.
5. Make long IDs, values, inspector rows and flow actions wrap or shrink without covering the
   scrollbar. Do not use `overflow-x: hidden` to conceal unresolved sizing.
6. At narrow viewports, allow one panel to operate as a dismissible drawer rather than compressing
   the canvas below its minimum. Support backdrop/Escape dismissal and trigger-focus restoration;
   do not change docking persistence semantics beyond what is necessary.

## Required checks

```bash
npx vitest run web/src/ui/PropertiesPanel.test.tsx web/src/ui/uiLayout.test.ts web/src/ui/useUiLayout.test.tsx web/src/ui/flows/FlowPane.test.tsx
npm run check
npm run build
npx playwright test e2e/ux02-workspace.spec.ts e2e/flow01-canvas-flows.spec.ts e2e/p1-properties.spec.ts
```

Add a focused Playwright geometry spec using a classic-scrollbar browser setting where supported.
Capture Properties, Flow Steps, bottom, floating and narrow panels in light/dark.

## Acceptance

- No horizontal overflow or scrollbar-covered control in the width/theme matrix.
- First and last sections remain reachable after scrolling; only the intended container scrolls.
- Dock, float, resize, collapse, close/reopen and layout persistence regressions remain green.
- Screenshot review records no clipped fields, overlapping scrollbars or duplicate panel titles.

## Evidence

**RED (geometry, before the fix).** Reverting the WP02 layout rules (`app.css`) and the
`PropertiesPanel` head change, rebuilding and running `npx playwright test
e2e/ux08-panels.spec.ts` produced:

```
✘ UX-08 WP02: Properties stays readable at narrow dock widths (light)
    Error: horizontal overflow at 200px
    Expected: <= 199
    Received:    232
✘ UX-08 WP02: Properties stays readable at narrow dock widths (dark)   (same)
✘ UX-08 WP02: narrow viewport turns side panels into a dismissible drawer (timeout)
3 failed, 2 passed
```

Original failing values: host `clientWidth` 199 px vs `scrollWidth` 232 px at a 200 px
dock — the fixed-width `.properties` (232 px, `overflow-y: auto`) sat inside the also
scrolling `.panel-host-content`, so the panel overflowed horizontally *and* nested two
independent scrollers. No drawer existed at ≤719 px.

**RED (new assertions).** Removing only the `.panel-host-content > .properties` sizing
rule reproduces `Error: classic-scrollbar overflow at 184px` in both themes.

**GREEN (unit):** `npx vitest run` → **103 files / 1070 tests passed**. Added
`drawerPanel` coverage in `web/src/ui/uiLayout.test.ts` (first expanded side-docked panel;
collapsed/closed/bottom/floating ignored).

**GREEN (lint/type/build):** `npm run check` clean; `npm run build` → `✓ built`.

**GREEN (e2e):** `npm run build && npx playwright test` → **112 passed**, including the new
`e2e/ux08-panels.spec.ts` (7 tests) and the brief's regression set `ux02-workspace`,
`flow01-canvas-flows`, `p1-properties`.

Classic-scrollbar coverage: headless Chromium on this host always paints *overlay*
scrollbars (verified — `offsetWidth - clientWidth` is 0, and
`--disable-features=OverlayScrollbar`/`FluentScrollbar` cannot disable it), so the classic
case is covered by asserting the panel at `width - 16` for the 200/232/280/420 px matrix,
which is strictly narrower than any classic bar. Those cases additionally use a long
object name and assert no `input/textarea/button/select` crosses the host content box.

**Repo gates:** `go test ./...` ok; `bash scripts/check-docs.sh` → `OK — 9 docs, all links
resolve, .pcd blocks valid`; `bash scripts/check-selfcontained.sh` → `OK — no external-origin
resource loads in web/dist`.

**Vision review (screenshots in `test-results/screenshots/`):**
`ux08-panels-props-{200,232,280,420}-{light,dark}.png`, `ux08-panels-classic-*-{light,dark}.png`,
`ux08-panels-flows-{light,dark}.png`, `ux08-panels-float-{light,dark}.png`,
`ux08-panels-drawer-light.png`. Filed and fixed in this WP:

1. Duplicate panel titles — `FLOW STEPS`, `SHAPES` and `FILES` were rendered twice (host
   header + panel head). Inner headings removed from `Palette`, `FilesPane` and
   `FlowStepsPane`; the `aside` landmarks keep their `aria-label`, section headings
   (`CONTEXT`, `IDENTITY`, `Steps`) stay, and the collapse controls keep their test ids.
2. The surviving collapse control drifted to the leading edge of an otherwise empty head —
   pinned to the trailing edge for hosted panels.

No clipped field, overlapping scrollbar or hidden last section remains at any tested width
theme combination; the drawer keeps its actions inside the viewport and creates no page
scroll (asserted).

**Docking persistence unchanged:** no `UiLayout` semantics were added beyond the pure
`drawerPanel` selector; dock, float, resize, collapse, close/reopen and persistence suites
stay green (`ux02-workspace`, `ux03-files`, `p1-shell`).
