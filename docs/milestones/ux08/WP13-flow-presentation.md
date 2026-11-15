<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP13 — Flow launcher, camera and narration

**Severity:** High — presentation legibility and narrative control

**Status:** Proposed  
**Requirement:** 11 — sparks plus presentation list, automatic pan/zoom and descriptions  
**Depends on:** WP11 for camera metadata and WP12 for the flow-selection/editing entry point  
**Branch:** `feat/ux08-flow-presentation`

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

Pending. Record fake-clock plans, real-browser containment/reduced-motion checks and screenshots.
