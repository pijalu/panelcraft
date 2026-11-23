<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: presentation dock reserves its measured height

Source: `bugs.md`, “Presentation dock can leave content partially hidden”.
Status: closed after browser geometry regressions, light/dark filmstrip review and
the full unit/browser/Go validation listed below.

## Report and expected behavior

The original capture showed content partially hidden at the bottom of the
presentation surface, but did not identify whether it was drawing content or
narration chrome. Severity was medium: transport controls remained available,
but the hidden content could not be read reliably.

The expected contract is that the drawing, transport dock and narration occupy
distinct visible regions. Active-step objects and connector labels must remain
inside the usable drawing surface; narration, choices, progress and controls must
remain inside the dock and viewport. This must survive wrapped text, a narrow
viewport, safe-area padding and initial, playing, paused and settled states.

The UX lenses are **Flow** — playback feedback must remain visible without making
the presenter recover hidden context — and **Law of Common Region** — the drawing,
step explanation and dock must read as separate, intact regions rather than
overlapping fragments.

## Reproduction and measurements before the fix

At 360 × 740 in the dark theme, with the long narration used by the new browser
regression, the obscured drawing element was
`.pc-obj[data-id="component1"]`:

- Component vertical bounds: **595–670 px**.
- Dock top: **585 px**; dock height: **155 px**.
- Canvas and advance-surface bottom: **644 px**.
- The fixed 96 px reservation therefore left a **59 px overlap** between the
  canvas/advance surface and the real dock.

`presentation-dock-before-narrow-dark.png` preserves the visual reproduction.
The new `e2e/presentation-dock-layout.spec.ts` was then run against the unpatched
revision: all five tests failed for the intended geometry mismatches. The wrapped
narration case differed by 59 px, the description/progress filmstrip states by
107 px, the wrapped-choice case by 121 px, and even the short dock by 7 px.

The cause was two independent heights: `.app-shell.presenting .app-body` and
`.present-advance` reserved 96 px, while the fixed dock grew with its controls,
dots, choices, narration and safe-area padding. Camera refits reacted to entry,
window resize and optional asides, but not directly to dock-height changes.

## Implemented fix

### One measured reservation

`web/src/ui/PresentDock.tsx` now owns a dock ref and measures its rendered border
box in a layout effect. It publishes the result as
`--present-dock-height` on the root element. Both the canvas bottom padding and
the advance-surface bottom inset consume that same custom property in
`web/src/ui/app.css`.

A `ResizeObserver` watches the dock with `{ box: 'border-box' }`. Each changed
measurement schedules the latest player `refit` on the next animation frame, after
the new reservation has affected layout. A window-resize fallback covers browsers
without `ResizeObserver`; cleanup disconnects the observer, cancels the frame and
removes the root property.

Border-box observation matters: an initial content-box version did not react when
only safe-area padding changed. In that failing probe the dock grew **89 → 121 px**,
but the root reservation stayed at 89 px and the canvas bottom stayed at 811 px
while the dock top moved to 779 px. With border-box observation, the passing probe
put the canvas, advance surface and dock boundary at **779 px**, and the camera
changed from `translate(332.5 318) scale(1.25)` to
`translate(332.5 302) scale(1.25)`.

### One transport surface, no horizontal spill

The first wrapped-choice capture was 388 px wide at a 360 px viewport. The hidden
editor play bar was still contributing overflow: its client width was 342 px,
scroll width 379 px, and a choice reached x = 387.84375. Presentation now hides
that duplicate editor play bar; the presentation dock remains the sole transport.
The recaptured document width is **360 px**.

### Rapid history navigation found during validation

The browser suite also exposed a separate rapid Back/Forward race. A trace showed
Forward reaching `#present=checkout`, then the app replacing it with an empty hash
about 4 ms later. A deferred status effect from the previous exit could run after
Forward had adopted the flow. Making that status commit synchronous preserved the
hash, and revealed the second half: the deferred presentation cleanup could still
hide the newly reopened shell.

`usePresentAnchor` now commits player status with its render, and
`usePresentation` clears its shell flag with the status render. The existing
Back/Forward browser regression exercises the real history sequence. The formerly
failing focused set passed three consecutive repetitions (90 tests) after both
changes. No URL policy or flow timing was relaxed.

The replay browser assertion was also corrected to poll the spark token's own
computed transform. Its old fixed delay could mistake a concurrent camera glide
for spark travel before the source-pulse phase had finished; product animation
behavior is unchanged.

## Passing geometry after the fix

For the same 360 × 740 wrapped-narration scenario:

| Region | Measured result |
| --- | --- |
| Canvas bottom / advance bottom / dock top | **585 / 585 / 585 px** |
| Dock | **155 px** high, ending at the 740 px viewport bottom |
| Active component | y = **467.14–537 px**, fully above the dock |
| Active person | y = **48–131.83 px** |
| Connector label | y = **289.01–309.96 px** |
| Narration | x = **16–344 px**, y = **648–708 px**, inside the dock |
| Document width | **360 px**, no horizontal overflow |

The browser assertions allow at most 1 px rounding at the shared boundary and
check every requested active element, transport control, progress dot and choice
against its owning region. They also check the wrapped description stays above
its narrow canvas reservation, 64 dots occupy multiple rows, and a choice label
actually wraps.

## Browser and vision review

Reviewed the actual regenerated files under `test-results/screenshots/` against
`docs/STYLE-GUIDE.md` and the Flow/Common Region lenses:

- `presentation-dock-filmstrip-light.png` and
  `presentation-dock-filmstrip-dark.png`: labeled initial, paused, settled and
  playing composites, assembled from the corresponding test captures. Both themes
  retain readable contrast, aligned 32 px controls, separate step-explanation,
  canvas and dock regions, all 64 progress dots, complete narration and visible
  active objects. Settled and resumed-playing end states were reviewed explicitly.
- `presentation-dock-active-drawing-narrow-dark.png`: component, person and
  connector label are all visible above the dock. The optional Introduction
  popover initially obscured this diagnostic capture; the test now dismisses that
  intentional, separate layer so the capture isolates dock occlusion. The
  description filmstrips continue to exercise prose and active content together.
- `presentation-dock-wrapped-choices-narrow-dark.png`: both wrapped choices,
  narration, controls and the active component fit at 360 px with no horizontal
  spill.
- `presentation-dock-safe-area-zero-light.png` and
  `presentation-dock-safe-area-grown-light.png`: the safe-area increase reserves
  32 additional pixels and leaves the active component visible.

The tests use reduced motion for deterministic captures. No curated golden was
updated; these are gitignored run artifacts.

## Verification

Commands were run separately; final successful results:

```text
npm run check
  TypeScript (app and service worker) and ESLint passed.

npm test
  Test Files  168 passed (168)
       Tests  1839 passed (1839)
  Coverage: 87.22% statements, 79.1% branches, 84.59% functions, 90.02% lines;
  configured core-package thresholds passed.

npm run build
  Production bundle built successfully from the changed sources.

npx playwright test e2e/presentation-dock-layout.spec.ts
  5 passed.

npx playwright test e2e/presentation-dock-layout.spec.ts \
  e2e/bug09-transport.spec.ts e2e/present-hash-anchor.spec.ts \
  e2e/p2-present.spec.ts e2e/ux08-flow-presentation.spec.ts \
  e2e/bugs-step-explanation.spec.ts e2e/bugs-framing-explanation.spec.ts \
  --repeat-each=3
  90 passed.

npm run e2e
  292 passed.

go vet ./...
  Passed (no diagnostics).

staticcheck ./...
  Passed (no diagnostics).

gocyclo -over 15 cmd internal web
  Passed (no functions over the CI limit).

go test -count=1 -race -cover ./...
  All packages passed under the race detector.
```

No format, IR, corpus, dependency or Go source changed. Hosted deployment checks
were not applicable to this non-release change.

## Residual risk

The fallback for a browser without `ResizeObserver` handles viewport resizes but
cannot observe content-only dock growth; supported browsers with the standard
observer use the complete border-box path tested above. This does not affect the
Chromium regression or current browser targets.
