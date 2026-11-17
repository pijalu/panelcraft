<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: update banner hit-test review

Source: `bugs.md`, "Update banner click blockage is not reproduced".
Plan: steps 1–5 of that section and item 6 of
`docs/BUGS-RESOLUTION-PLAN-ROUND-2.md`. Scenarios:
`e2e/update-banner-hit-test.spec.ts`.

## Report and finding

The report described a stuck "Update available" banner whose Restart and Later
controls could not be clicked. The existing service-worker spec showed those
controls working in the ordinary editor shell, so the item was recorded as
unreproduced until the exact shell state was known.

A concrete blocked state exists. If the banner is already on screen when a flow
is presented, the banner stays in the chrome-free presentation shell. The
transparent full-canvas advance button (`data-testid="present-advance"`,
`position: fixed`, `z-index: 20`) sits above the static `.banners` row, so a real
pointer press at either button centre advances the presentation instead of
activating Restart or Later. No console error, disabled control or
`pointer-events` value is involved. This is not a synthetic
`pointer-events: none` case: the worker is genuinely waiting and the buttons are
genuinely the elements under the pointer until presentation begins.

The product contract says presentation hides editor chrome and never interrupts
a flow for an update. The minimal fix therefore hides the banner row in the
presentation shell, matching the already-hidden header, palette, panels and view
bar. The offer is not dropped: leaving presentation restores the same waiting
worker and both controls are clickable again.

## Hit-test capture

The new spec rewrites the served worker script to stage a real `installed`
waiting worker, then records for both button centres: shell/presentation flags,
worker controller/active/waiting state, console errors, bounding boxes,
computed `pointer-events`, the full `elementsFromPoint` stack and every
ancestor's position, `z-index` and stacking-context reasons. Machine-readable
output is written to the gitignored `test-results/update-banner-hit-test.json`.

Summary of the final run (`pageScaleFactor` is the Chromium browser zoom; the
`.banners` row is the hidden ancestor in presentation):

| State | Presenting | Banner rendered | Restart centre | `elementFromPoint` | Later top | Pointer events | Console errors |
|---|---|---|---|---|---|---|---|
| baseline light | false | yes | 1342,69 | `update-restart` | `update-later` | auto/auto | 0 |
| baseline dark | false | yes | 1342,69 | `update-restart` | `update-later` | auto/auto | 0 |
| unapplied confirmation | false | yes | 1342,69 | `update-restart` | `update-later` | auto/auto | 0 |
| narrow 375×667 | false | yes | 277,76 | `update-restart` | `update-later` | auto/auto | 0 |
| zoom 200% | false | yes | 1342,69 | `update-restart` | `update-later` | auto/auto | 0 |
| application menu | false | yes | 1342,69 | `update-restart` | `update-later` | auto/auto | 0 |
| clear-data modal | false | yes | 1342,69 | `clear-dialog` | `clear-dialog` | auto/auto | 0 |
| presentation launcher | false | yes | 1342,69 | `present-launcher-backdrop` | `present-launcher-backdrop` | auto/auto | 0 |
| presentation | true | no (`div.banners: none/visible`) | 0,0 (no box) | `present-advance` | `present-advance` | auto/auto | 0 |
| presentation paused | true | no (`div.banners: none/visible`) | 0,0 (no box) | `present-advance` | `present-advance` | auto/auto | 0 |
| after reload | false | yes | 1342,69 | `update-restart` | `update-later` | auto/auto | 0 |

In every state the controller was `activated`, the active worker was
`activated`, the waiting worker was `installed`, the scope was
`http://localhost:4173/`, neither button was disabled, and no button ancestor
established a stacking context (`position: static`, `z-index: auto`). The modal
and launcher rows are intentionally covered by `aria-modal` surfaces; the
presentation row is intentionally absent. The two real gestures after reload
were Later by keyboard (`focus` + Enter, banner removed) and Restart by a real
mouse click at its measured centre (one navigation, worker activated).

## Regression evidence — failed before the fix (RED)

First capture, with the buttons still rendered in presentation:

```
$ npx playwright test e2e/update-banner-hit-test.spec.ts --workers=1
✘ presentation: Restart centre hit
  Expected: true   Received: false
✘ presentation: Later centre hit
  Expected: true   Received: false
✘ presentation-paused: Restart centre hit / Later centre hit
  Expected: true   Received: false
1 failed
```

The captured boxes in that run were
`{"x":1312.89,"y":4,"width":58.08,"height":32}` for Restart and
`{"x":1378.97,"y":4,"width":45.03,"height":32}` for Later; both centres returned
`button#present-advance.present-advance` from `document.elementFromPoint`, with
the banner still `display: flex`, `visibility: visible` and `pointer-events:
auto` on each button. The hit stack was
`present-advance > update-restart > banner-update > banners > app-shell`.

The assertion was then aligned with the stated presentation contract — a queued
offer must not be visible — which also fails on the unfixed bundle:

```
$ npx playwright test e2e/update-banner-hit-test.spec.ts --workers=1
Error: presentation: update banner hidden
Received: {"display":"flex","text":"Update available. Restart to load ...","visibility":"visible"}
Error: presentation-paused: update banner hidden
1 failed
```

This was not a weaker test: the first run proved the buttons were unclickable,
and the second proves the visible-but-blocked surface should not exist at all.

## Minimal implementation

One CSS rule in `web/src/ui/app.css` adds `.banners` to the existing
`.app-shell.presenting … { display: none }` selector list. No lifecycle flag,
controller state, visibility boolean, DOM rewrite, `z-index` lift or dependency
changed. The unused `playbackEnded` callback and the separate controller/UI
visibility fields listed in the report remain review risks, but no captured
state attributes the defect to them, so they were left alone rather than
rewritten speculatively.

Two existing browser tests received deterministic waits only: wait for code
view content after a reload/file switch before reading it or injecting a hash,
and wait for the Forward hash before asserting the presentation it starts.
These remove timing-only flakes seen under parallel load; no production or
assertion semantics changed.

## Verification evidence — passed after the fix (GREEN)

- `npm run build` succeeded before every browser run; the CSS hash changed and
  the worker was restored after each staged-update run.
- `npx playwright test e2e/update-banner-hit-test.spec.ts --workers=1`
  → **1 passed**: eleven captured states, real pointer and keyboard activation.
- `npx playwright test e2e/ux08-pwa.spec.ts --workers=1` → **4 passed**:
  waiting, Restart, Later, queueing during playback and installability.
- `npm run check` → exit 0 (TypeScript, service worker and ESLint gates).
- `npm test` → **137 files, 1544 tests passed**, coverage gates green.
- `npm run test:perf` → **8 passed** (N1–N4 budgets).
- Full browser suite in two single-worker shards:
  `npm run e2e -- --workers=1 --shard=1/2` → **103 passed**;
  `npm run e2e -- --workers=1 --shard=2/2` → **103 passed** (206 total).
  Sharding avoids the reload/hash races in unrelated tests under two-worker
  load; the two timing fixes above were also verified in the two-worker runs.

### Screenshots and vision review

Captures in `test-results/screenshots/` (gitignored artifacts):

- `update-hit-baseline-light.png`, `update-hit-baseline-dark.png` — banner
  readable, Restart ranked as the filled primary action, both controls aligned
  on the trailing edge; theme parity holds.
- `update-hit-unapplied.png` — unapplied code changes the copy to an explicit
  discard warning; the stale-render notice appears above the canvas and both
  controls keep the same reachable boxes.
- `update-hit-narrow.png` — 375 px width wraps the copy to three lines without
  overlapping the two 32 px targets.
- `update-hit-zoom.png` — 200% browser zoom keeps the same hit stack.
- `update-hit-menu.png`, `update-hit-modal.png`, `update-hit-launcher.png` —
  modal overlays visibly dim the banner; their coverage is intentional.
- `update-hit-presentation.png`, `update-hit-presentation-paused.png` — clean
  chrome-free frames with no banner, ghost row or layout jump.
- `update-hit-reload.png` — banner restored with the waiting worker and both
  controls on top.

Reviewed against `docs/STYLE-GUIDE.md` with the Laws of UX skill (Fitts's Law
for 32 px targets, Selective Attention for the queued offer, Prägnanz for the
clean presentation frame): alignment, contrast, spacing, focus, theme parity
and settled animation states pass. Outcome: **pass**, no defects filed.

No speculative production fix was made for the unreproduced z-index theory; the
actual defect was a visible banner in a chrome-free presentation shell.
