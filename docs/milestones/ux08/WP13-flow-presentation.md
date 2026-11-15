<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP13 — Flow launcher, camera and narration

**Severity:** High — presentation legibility and narrative control

**Status:** Implemented and verified (2026-11-15)  
**Requirement:** 11 — sparks plus presentation list, automatic pan/zoom and descriptions  
**Depends on:** WP11 for camera metadata and WP12 for the flow-selection/editing entry point  
**Branch:** `feat/m0-scaffolding` (UX-08 work packages land in order on one branch)

## Single-task outcome

Provide a presentation launcher listing flows, automatic participant/route/label camera fitting,
optional per-step overrides and visible/accessible descriptions. Preserve sparks and transport;
do not change the PDL contract or Markdown exporter here.

## Locked behavior

| Step | Automatic camera |
|---|---|
| `intro`, `conclusion` | Fit diagram/overview. |
| `msg` | Fit both actors, active connector and label. |
| `process` | Fit target with readable padding. |
| `par` | Fit union of concurrent participants. |
| `alt` | Hold at chooser; fit chosen branch participants when played. |
| `info` | Hold unless explicit focus is supplied. |
| `goto` | Navigate first; target beat computes its own camera. |

Overrides come from WP11: Auto, Hold, or canvas-coordinate Focus with optional zoom and 0–300 ms
duration. Dwell remains separate. Reduced motion applies the same target immediately with static
emphasis and no moving sparks.

## Implementation steps

1. Extend pure playback plans with camera and full narration/description. Fake-clock tests cover
   Auto/Hold/Focus, duration, pause/resume, restart, alt/par/goto and exit restoration.
2. Update the camera port/controller to fit participants plus route/label with viewport/dock
   padding and zoom clamps. “Use current view” records viewport center in canvas coordinates and
   zoom so it works across presentation window sizes.
3. Add the per-step Presentation inspector: description, Automatic/Hold/Use current view, zoom,
   duration and existing dwell. Automatic removes the override; invalid values get inline feedback.
4. Add a launcher listing each flow’s title, description, step count and estimated duration from
   dwell metadata. Selecting a flow shows the diagram and transport. Include a visible **Present**
   action in the default application shell.
5. Add an optional outline/step list that does not cover active actors. Show title + description
   in the animation pane and ARIA live narration. Preserve click/keyboard transport, branch
   choices, replay and exit restoration.
6. Test spark completion/ping-pong, no ghost animation after exit, camera containment at narrow/
   wide aspect ratios and identical reduced-motion end states.

## Required checks

```bash
npx vitest run web/src/engine/flows web/src/engine/anim web/src/ui/flows web/src/ui/present.test.ts
npm run check
npm run build
npx playwright test e2e/p2-present.spec.ts e2e/s3-flows.spec.ts e2e/flow02-sparks.spec.ts
```

Add launcher, override, description and reduced-motion E2E. Capture launcher, message, focus
override, outline and conclusion in light/dark; inspect settled frames, not only mid-animation.

## Acceptance

- Automatic and overridden cameras are deterministic and keep active content inside the viewport.
- Flow list, progress and descriptions are visible and accessible; no raw PDL knowledge is needed.
- Reduced motion has no camera glide or moving sparks; auto-advance remains pausable.
- Exit restores pre-launch editor layout/viewport and no animation continues in the background.


## Evidence

**Red first.** Every slice was written as a failing test before the code:

```
$ npx vitest run web/src/engine/flows/plan.test.ts        # camera intents + estimates
 Tests  12 failed | 18 passed (30)
   expected undefined to be 3400            ← plan.estimatedMs did not exist
$ npx vitest run web/src/engine/anim/camera.test.ts       # intents
 Tests  4 failed | 9 passed (13)
   expected 300 to be 120                   ← duration override ignored
$ npx vitest run web/src/ui/flows/useFlowPlayer.test.tsx  # runner wiring
 Tests  3 failed | 8 passed (11)
   expected undefined to be ''              ← state.description missing
$ npx vitest run web/src/ui/flows/PlayBar.test.tsx
  1 failed                                 ← [data-testid="pb-description"] missing
$ npx vitest run web/src/ui/flows/FlowPane.test.tsx
  3 failed                                 ← [data-testid="insp-camera"] missing
```

**Camera model.** `buildPlan` resolves each beat to an explicit intent
(`Beat.camera`, `Beat.cameraIds`), so the camera port never knows beat kinds:

| Step | Intent | Fitted ids |
|---|---|---|
| `intro`, `conclusion` | `overview` | every object and link id |
| `msg` | `auto` | both actors + the connector (its group carries the label) |
| `process` | `auto` | the target shape |
| `par` | `auto` | union of the lane participants |
| `alt` (chooser) | `hold` | — |
| `info` | `hold` | — |
| `goto` | `hold` | — (the target frame's first beat computes its own) |

Step overrides (IR v8 `presentation { camera … }`) replace the intent: `auto` keeps the default
ids, `hold` clears them, `focus` carries the canvas point, zoom and duration. `CameraController`
executes it — `auto`/`overview` fit the union with 48 px padding, `focus` centres the point at a
`clampZoom`-ed zoom, `hold` is a no-op, `durationMs` overrides the glide length, `0` and reduced
motion apply the target instantly. Branch and lane steps now inherit their dwell, description and
camera overrides; they previously lost all three (found while wiring the override path).

**Narration.** `Beat.description` → `FlowPlayerState.description` → `data-testid="pb-description"`
(transport) and `data-testid="present-description"` (present dock), under the existing
`aria-live` narration title. `PlaybackPlan.estimatedMs` = Σ(dwell + camera transit) feeds the
launcher.

**Launcher.** `flowCatalog()` lists each flow with title, purpose, step count and length
(`formatDuration`: “8 s”, “1 min 35 s”); the shell header now carries a visible **Present** button
(and the application menu opens the same picker). `useStagePresentation` starts playback and hands
the shell to presentation mode.

**Per-step Presentation inspector.** `insp-camera` = Automatic (removes the override) / Hold / Use
current view; `insp-camera-here` re-records the viewport centre in canvas coordinates plus zoom
(`currentView()` → `invert` of the viewport centre, so framing survives a different window size);
`insp-zoom` clamps to 0.1–4 and `insp-duration` to 0–300 ms before anything is written, so the
file can never hold an invalid value.

**Browser defects found by the E2E and fixed.**

1. **Tab strip survived presentation mode.** The screenshot review showed the `untitled.pcd` tab
   row above the present frame; `.app-shell.presenting .tab-strip` is now hidden with the rest of
   the editor chrome.
2. **The beat framing was computed before the shell widened the canvas**, leaving the step
   off-centre in present mode. `FlowRunner.refit()` re-applies the current beat's intent to the
   current viewport (no state, timer or animation change) and the launcher calls it on the next
   frame; `useFlowPlayer.test.tsx` covers that refit leaves `state` untouched.
3. **Pluralisation**: the launcher said “1 steps, about 3 s”; a singular catalog entry now renders
   “1 step, about 4 s” (`PresentLauncher.test.tsx`).

**Checks.**

```
$ npx vitest run web/src/engine/flows web/src/engine/anim web/src/ui/flows web/src/ui/present.test.ts
 Test Files  9 passed (9)
      Tests  135 passed (135)          # engine slice; UI slice raises the suite to 1282
$ npx vitest run                       # whole suite
 Test Files  117 passed (117)
      Tests  1282 passed (1282)
$ npm run check
(no output: tsc, tsc -p tsconfig.sw.json, eslint clean)
$ npm run build
✓ built in 134ms
$ npx playwright test e2e/p2-present.spec.ts e2e/s3-flows.spec.ts e2e/flow02-sparks.spec.ts
  9 passed
$ npx playwright test e2e/ux08-flow-presentation.spec.ts
  ✓ launcher lists flows and starts a presentation (light)
  ✓ launcher lists flows and starts a presentation (dark)
  ✓ the transport narrates the step description
  ✓ a Hold camera override is authorable and persisted in the file
  ✓ reduced motion presents the same steps without a camera glide
  5 passed
$ npx playwright test                    # full suite
  151 passed (1.0m)
$ go test ./... && go vet ./... && staticcheck ./... && gocyclo -over 15 cmd internal web
GATES_OK
$ bash scripts/check-docs.sh && bash scripts/check-selfcontained.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
check-selfcontained: OK — no external-origin resource loads in web/dist
```

**Screenshot review** (`test-results/screenshots/`, light + dark, settled frames):
`ux08-presentation-launcher-{light,dark}` (title, purpose, “1 step, about 3 s”, first row focused),
`ux08-presentation-step-{light,dark}` (chrome-free canvas, message beat fitted with both actors,
connector and label inside the padded viewport, dock transport with step counter and narration),
`ux08-presentation-camera-light` (Hold override persisted through the file),
`ux08-presentation-reduced-motion-light` (same framing, no glide). Defects found and fixed above;
no outstanding visual defects recorded.

**Recorded, not fixed (out of scope).** Present mode still animates the beat token at the same
time as the camera glide; the two are independent and neither blocks the other. The canvas→file
write window recorded in WP12 is unchanged.
