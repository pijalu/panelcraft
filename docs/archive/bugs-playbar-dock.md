<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: the editor play bar docks inside the window

Source: `bugs.md`, “The editor play bar docks below the viewport after a flow
preview”. Status: closed after failing browser assertions, the layout fix,
light and dark review and the suite runs listed below.

## Report and expected behavior

Playing a flow from the Flow Steps panel (▶ on `Default flow`, or ▶ on a step)
mounts the editor transport under the canvas. Its style makes it a flow child of
`.canvas-wrap` (“transport is docked, never covering objects”), but that wrapper
was a plain block already as tall as the viewport, so the bar landed below the
fold: in Chrome at 1440 × 900 the document grew to 944 px
(`document.documentElement.scrollHeight = 944`, `.playbar` computed
`position: static`, bottom 944) and a page scrollbar appeared. The transport
controls were only reachable by scrolling the page, and the bar stayed after
playback ended.

Expected: with the bar visible the canvas yields its height to it and nothing
extends past the viewport, in both themes and at narrow widths.

The UX lens is **Fitts's Law**: the transport is the primary control during
playback and must be on screen, not at the end of a scroll.

## Failing coverage first

`e2e/flow01-canvas-flows.spec.ts` (light and dark) asserts, right after the bar
appears, that the document does not scroll and the bar's bottom edge is inside
the window. Against the unchanged build:

```text
Error: expect(received).toEqual(expected)
- Expected - "scroll": 900, "barBottom": 888
+ Received - "scroll": 944, "barBottom": 944
```

## Change

- `.canvas-wrap` is a column flex container and the SVG lives in a new
  `.canvas-stage` sibling above the docked bar (`web/src/ui/App.tsx`,
  `web/src/ui/app.css`). The stage shrinks (`flex: 1; min-height: 0`) so the bar
  keeps its docked slot inside the window.
- The stage is also the positioning context for the canvas overlays. A first
  version only shrank the canvas and left the mini-map anchored to the wrapper,
  so the mini-map covered the bar's right-hand choices — the six-step playback
  scenario (`e2e/s3-flows.spec.ts`) caught it (“mini-map … intercepts pointer
  events” on `pb-choice-1`). With the stage as the context, the mini-map sits
  above the bar and both stay reachable.

## Validation

```text
npx playwright test e2e/flow01-canvas-flows.spec.ts e2e/s3-flows.spec.ts e2e/flow02-sparks.spec.ts e2e/p6-minimap.spec.ts e2e/p2-present.spec.ts e2e/presentation-dock-layout.spec.ts e2e/ux08-flow-presentation.spec.ts e2e/ux08-flow-authoring.spec.ts e2e/bug15-spark-beat-timeline.spec.ts e2e/bugs-spark-route.spec.ts
  25 passed
npx playwright test            (full suite, after the three review fixes)
  299 passed (1.8m)
```

Capture `flow01-playbar-docked-light` / `-dark` reviewed: transport bar inside
the window at the bottom of the canvas column, mini-map above it, page not
scrolled, Properties and Flow Steps panels unaffected.
