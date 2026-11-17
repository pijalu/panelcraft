<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: presentation Play must replay the current beat

## Observed

The presentation dock's Play button called the runner's low-level `resume`.
That operation continued the frozen animation and rearmed the advance timer,
so a paused spark carried on from mid-flight instead of starting a new beat.
A step parked with the progress dots was worse: `resume` had no frozen motion
to continue, so Play could show "playing" while the old settled frame stayed on
screen. The play bar and the presentation keyboard toggle used the same call,
so all three transport surfaces shared the defect.

## Expected

Pause freezes the current beat. Play replays that same beat from time zero with
one full dwell, without re-entering navigation or leaving old animations
registered. Restart, step changes and exit keep their existing meanings, and
reduced motion shows the settled frame immediately.

## Plan

1. Add controller regressions for pause→replay and for replay from a parked
   step. Assert a fresh beat animation, the unchanged beat index and exactly
   one newly armed timer with the beat's full duration.
2. Add a browser assertion on the real Web Animations API: the old spark is
   detached, the new one is `running` from `currentTime` 0, it visibly moves,
   and the step does not advance early.
3. Give the runner an explicit `replay` operation and use it on all three Play
   surfaces. Keep the low-level `resume` for transport continuation; a shared
   runner operation prevents the surfaces from drifting apart. Reuse the
   existing beat/scheduling path with navigation disabled.
4. Give the animator ownership of the animation handles it creates. Cancel only
   those handles before a new beat, so camera glides using the same player port
   survive and detached spark animations are unregistered.
5. Cover Restart, step change (including a goto beat), exit, file change and
   reduced motion. Run focused tests, presentation e2e, light/dark captures,
   TypeScript/ESLint and the full unit suite.

## Regression evidence — failed before the fix (RED)

- Focused unit run on the unmodified implementation:
  `npx vitest run web/src/ui/flows/useFlowPlayer.test.tsx web/src/engine/anim/engine.test.ts web/src/ui/PresentDock.test.tsx --reporter=verbose`
  → **10 failed, 29 passed**. The failures were the ones the plan predicted:
  - `TypeError: h.result.current.replay is not a function` — no explicit runner
    operation existed (six controller cases).
  - `AssertionError: expected "vi.fn()" to be called once, but got 0 times` —
    dock, play bar and keyboard toggle still called resume (three cases).
  - `AssertionError: expected 0 to be greater than 0` — the animator had no
    owned handles to cancel on replay, and a global cancellation was the only
    cleanup path.
- Focused browser run against a fresh build of unmodified sources:
  `npx playwright test e2e/bug09-transport.spec.ts -g "pausing freezes" --workers=1`
  → **1 failed** at the new detachment check:
  `Expected: false, Received: true` for the old token's `isConnected` after
  pressing Play. The old spark was still the same DOM element, i.e. Play had
  resumed rather than replayed.

The browser test also exposed a pre-existing sampling race: the dock's
`data-status` became `paused` synchronously while the animation committed
`playState: paused` on the next frame. The test now waits for the animation's
own state before sampling `currentTime`; it still checks that the time stays
frozen over 250 ms.

## Minimal fix

- `web/src/ui/flows/flowController.ts`: added `replay()`. It cancels the old
  timer, publishes `playing` and calls the existing beat runner with navigation
  disabled, so a goto is never re-entered and a chooser stays parked. It is a
  no-op after exit and restarts the last flow after a natural end.
- `web/src/ui/flows/useFlowPlayer.ts`, `PresentDock.tsx`, `PlayBar.tsx` and
  `usePresentKeys.ts`: all Play surfaces now call `replay`; Pause still calls
  `pause`. The play bar's label for a paused step says "replay", not "resume".
- `web/src/engine/anim/engine.ts`: the animator records the handles it creates
  for a beat and cancels exactly those before playing the next beat and on
  stop. It no longer calls the player-wide cancellation, which would also have
  cancelled unrelated camera work.

No parser, format, style token or storage code changed.

## Verification evidence — passed after the fix (GREEN)

- Focused unit run:
  `npx vitest run web/src/ui/flows/useFlowPlayer.test.tsx web/src/engine/anim/engine.test.ts web/src/ui/PresentDock.test.tsx web/src/ui/flows/PlayBar.test.tsx`
  → **4 files, 47 tests passed**. Coverage includes pause→replay (one fresh
  beat animation, one full-duration timer), parked-step replay, Restart,
  step change, goto without re-navigation, exit, a natural end, file change,
  reduced motion, and ownership of beat animations versus camera work.
- Focused browser run after `npm run build`:
  `npx playwright test e2e/bug09-transport.spec.ts -g "pausing freezes" --workers=1`
  → **1 passed**, with the measured transition:
  `REPLAY_WAAPI {"frozen":366.65399999011686,"replayed":{"currentTime":0,"state":"running"}}`.
  Repeating that command three times gave `currentTime: 0` and `state: "running"`
  each time. The old token is disconnected, the new spark's bounding box moves
  more than 2 px, and the step counter stays on the current beat.
- Full browser suite: `npm run e2e -- --workers=2` → **199 passed**.
- `npm run check` → exit 0 (TypeScript, service-worker TypeScript and ESLint).
- `npm test` → **133 files, 1505 tests passed**, coverage thresholds green.

### Screenshots and vision review

Captures written by the passing e2e run:

- `test-results/screenshots/item9-token-arrived-light.png`
- `test-results/screenshots/item9-token-arrived-dark.png`
- `test-results/screenshots/item9-neon-token-dark.png`
- `test-results/screenshots/p2-present-light.png`
- `test-results/screenshots/p2-present-dark.png`
- `test-results/screenshots/item9-transport-paused.png`

Reviewed against the `docs/STYLE-GUIDE.md` screenshot checklist with the Laws
of UX skill:

- The Play/Pause glyph, progress dot and step counter agree with the transport
  state; feedback is immediate and truthful (Doherty Threshold, Mental Model).
- The arrived frame shows one token at the endpoint in both themes, with no
  ghost spark or leftover trail; the mid-flight capture keeps a clear silhouette
  with restrained glow (Law of Prägnanz).
- Dock alignment, spacing, badge placement and contrast match in the light and
  dark presentation captures. No external asset is visible.
- Focus rings are not visible in static captures; keyboard reachability and
  activation are covered by the green transport e2e. Reduced-motion behaviour
  is asserted by the green presentation spec: a static token and no rings.
- One pre-existing observation, not a defect from this change: the two
  "token arrived" captures were taken at different points in the camera glide,
  so the framing differs even though the token and dock match.

Outcome: **pass**, no new defects filed.

Residual risk: the browser assertion uses the first animation reported for the
token element; the production player animates exactly one transform per spark,
and the e2e reproductions all reported `currentTime: 0` on that animation.
