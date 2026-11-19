# CI/CD browser-suite determinism repair

## Observed failure

GitHub Actions run
[43828484739](https://github.com/pijalu/panelcraft/actions/runs/43828484739)
failed on commit `1268a2b` in the required `pipeline / e2e smoke` step: seven
browser tests failed while 148 passed. All earlier build, lint, unit-test,
performance, documentation, and asset-origin steps passed; repository hygiene
was skipped because the browser step failed.

The downloaded traces and error contexts separated the failures into three
setup defects:

1. All five flow-presentation tests timed out clicking
   `g.pc-link path.pc-route`. The failing render commit deliberately made the
   visible route pointer-transparent so geometric, object-first canvas
   hit-testing owns selection. Playwright therefore correctly reported that the
   SVG canvas intercepted pointer events. The test was asking Playwright to
   click an element that cannot receive a pointer event; this was not a product
   hit-testing failure. The current flow setup uses the automatically derived
   initial message and no longer performs that invalid direct-route click.
2. The dark flow-authoring trace activated **New flow** only 47 ms after the
   code view first contained the new connection. The final snapshot had lost
   both the connection and the new flow: the independent flow write raced the
   canvas-to-file persistence window. The existing test already documented this
   write-write hazard but did not wait for a clean, quiescent file before adding
   the flow.
3. The grid trace replaced the editor using two separate actions: select all,
   then insert text. Its final document contained the new six-line fixture plus
   the old `pcd 1.0` line, producing `E100 duplicate magic line`. A re-render
   between the shortcut and insertion could clear the selection.

## Fix plan and regression approach

- Keep the existing browser scenarios and assertions unchanged; they are the
  regression coverage for these failures. Do not add retries, increase test
  timeouts, force clicks through pointer-transparent routes, or relax parsing.
- Use the current connection-derived flow setup, which avoids the invalid route
  click and preserves the presentation assertions.
- Before creating a flow, wait for the code sync state to be clean and for the
  existing single-writer settling window to elapse.
- Replace the grid fixture with one atomic `fill()` operation on the
  contenteditable editor.
- Reproduce on the exact failing revision, apply the test repairs there, and
  rerun the original three-spec command. Then run the same coverage repeatedly
  on the current branch, followed by the complete browser and quality gates.

## Reproduction and verification evidence

- Exact failing revision `1268a2b`, before repairs:
  `npx playwright test e2e/ux08-flow-authoring.spec.ts e2e/ux08-flow-presentation.spec.ts e2e/ux08-grid.spec.ts --workers=2`
  reproduced all five presentation timeouts; result **5 failed, 5 passed**.
- Same failing revision and command with the current flow setup plus the two
  determinism repairs: **10 passed**. The intermediate diagnostic run also
  confirmed that forcing the route click moved execution beyond the timeout;
  it was not used as the final repair because it could create a duplicate
  message step.
- Current branch, same three specs with two repetitions and two workers:
  **20 passed** before the final two synchronization edits and **20 passed**
  after them.
- `npm run e2e`: **160 passed**, including the complete offline,
  accessibility, screenshot, and no-external-network scenarios.
- `npm run check`: TypeScript and ESLint passed.
- `npm test`: **117 files, 1,321 tests passed** with coverage thresholds green.
- `npm run build`: production bundle built successfully.
- `go test -count=1 -race -cover ./...`: all packages passed under the race
  detector.
- `go vet ./...` and `staticcheck ./...`: passed.
- `gocognit -over 15 .` and `gocyclo -over 12 .` were run separately as
  requested. They reported only pre-existing warnings in untouched Go code and
  vendored `node_modules/flatted` Go sources; this change contains no Go code.
  The repository CI gate scopes cyclomatic complexity to `cmd internal web`.

No production behavior, test timeout, retry policy, or assertion was weakened.
Only browser-test synchronization and fixture replacement changed; existing
failed scenarios provide the regression coverage.

## Follow-up: the same seed race in the canvas-flow seeder

The flow-editing scenario keeps its own `seedDoc` helper, which still clicked
and pressed select-all without requiring the editor to hold focus. In the CI run
of the merged bug round the dark variant reached a parse error instead of a
clean document — the select-all had gone to the page, the previous document
survived, and the scenario then asserted against a diagram it had not authored.
The helper now requires editor focus before the chord and checks the seeded
document round-trips, as the link-properties helper already does.

Verified: `npm run check` clean; `npx playwright test e2e/flow01-canvas-flows.spec.ts`
passed three consecutive runs (both themes); the CI run of the pull request and
the one on `main` are the remaining evidence.

## Follow-up: the whole suite, not one seeder at a time

The race reappeared a third time, in a scenario added by the same bug round
(`bugs-shared-field-layout`): the pull-request CI run of that work reached a
parse error during seeding, the exact shape recorded above. Fixing one helper per
occurrence was treating the symptom — 81 places in the browser suite press
select-all after clicking the code editor, and only a third of them required the
editor to hold focus first.

Every click-then-select-all pair now carries the focus requirement between the
two lines: 46 sites across 39 spec files. The requirement is written inline
rather than through a shared helper, because the seed text, the panel set and the
follow-up assertions differ per scenario, while the two-line primitive does not.
No assertion was relaxed, no timeout raised, no test retried or skipped.

Verified: `npm run check` clean; the full browser suite passed twice in a row
(254 tests). One earlier full run reported three timing failures in unrelated
scenarios (`flow-panel-focus`, `round3-browser-fixes`, `present-hash-anchor`)
that pass in isolation and did not reproduce; that is machine load under parallel
workers, not the seeding race, and it is recorded here rather than papered over.

## Follow-up: a wall-clock claim in a unit test

The same pull request then failed on the unit gate instead: the routing test
"bounds a many-bend plan deterministically" allowed 500 ms for a 32-waypoint plan
and the runner took 556 ms. The bound was a claim about the machine, not about
the planner, so it was replaced by the property the scenario actually protects —
the plan must not grow with the obstacles it could inspect — asserted as
`points.length <= waypoints.length + 8` (22 points for 32 waypoints today). A
generous 10 s ceiling remains only as a guard against pathological blow-up, which
is what a time bound can honestly say on shared hardware.

## Follow-up: the focus gate was not enough, so the primitive is now shared

The inline focus gate above fixed the specs it touched but not the class. It came
back three times: once on the main branch after the palette work merged
(`flow01-canvas-flows`), and twice more while validating this change. The last
occurrence finally produced the evidence needed to name the real cause.

### Observed

`e2e/bugs-palette-add.spec.ts` failed under parallel workers with the code view
in the error state. The stored failure screenshot showed the buffer as

```
pcd 1.0
title "palette"

layout saved
pcd 1.0          ← the seeded document's first line, appended
```

with `E100 duplicate magic line` in the problems panel. The original document was
still there and a fragment of the seed had been appended, so the select-all had
not taken and the insert had been partly applied. The same shape as the grid
trace in this document's first section — same failure, different spec.

### Cause

Not pinned. What the probes ruled out is more useful than what they suggested:

- **The CodeMirror view is not rebuilt on a file switch.** A marker property set on
  `.cm-content` survived a file creation that made a new document active, so the
  same DOM node took the incoming text. The earlier explanation ("the mount effect
  depends on `[machine]`, so a new machine identity rebuilds the view") does not
  apply: `useCodeSync` creates the machine with `useMemo(…, [])`, i.e. once per App
  lifetime, so its identity never changes after startup.
- **A machine write into a focused buffer does not break the editor.** Formatting via
  `Shift+Alt+F` in a focused editor kept focus, and the following select-all still
  selected the buffer (50 of 53 characters, the rest being the trailing line), after
  which typing replaced rather than appended.
- **Typing immediately after a file switch is clean** in 60 consecutive trials at six
  concurrent workers: the new document's text was already in the buffer by the time
  the click resolved, in every trial.

What remains is the window the code itself documents: `loaded` in
`web/src/ui/useCodeSync.ts` is sticky for the App lifetime, so on a *file switch* the
editor stays available while the new document's text is in flight. The comment that
introduced `loaded` says a keystroke in that window "would be overwritten by the
incoming file text" — that reasoning is applied at startup and not on a switch. A
machine write landing between the select-all and the insert collapses the selection,
and the insert then appends, which is exactly the buffer shape in the trace above.
That is consistent with the evidence but not proven by it; the corruption was only
seen under CI load and never reproduced locally.

### What changed

- `e2e/lib/seed.ts` now holds the one primitive. It requires the focus, waits for
the sync state, and then *proves the buffer holds the text it was given*. If the
buffer does not hold it, it types once more into the now-settled editor and
requires the second attempt to hold; if that fails it throws with both texts
(expected and found) rather than letting the scenario continue against a diagram
it never authored.
- The 79 hand-written `click → select all → type` blocks across 48 spec files
  now call it, so the panel set and the seed text stay per-scenario while the
  part that races does not. The earlier decision to keep the primitive inline
  ("the two-line primitive does not differ") is reversed: it was three lines, it
did differ, and it was being patched one flake at a time.
- `e2e-hosted/lib/hosted.ts` delegates to the same functions, so the local and
  hosted suites cannot drift apart on the seeding rule. `documentText` and
  `normalise` now have one definition instead of three.

Nothing was weakened: every seeded document is now verified where most
scenarios previously only waited for a sync state. Two deliberate seeds say so
explicitly — the Mermaid paste converts on insertion (`{ sync: 'any', verify:
false }`), and the invalid-document scenarios wait for the error state instead of
clean.

### Two further defects found by making seeds deterministic

- `e2e/bug09-transport.spec.ts` asserted that a paused beat's animation clock
did not advance by more than 5 ms, which is below one frame at 60 Hz (16.7 ms).
A pause lands on a frame boundary, so the assertion failed with `16.7` under
contention while the beat was correctly frozen — the bound could not distinguish
"paused" from "advanced one frame". It now allows one frame and states why; a
beat that kept travelling moves far more than that in the 250 ms window. Before
the change: 4 of 5 runs failed under two concurrent repeats. After: 8 of 8 passed
under four-way contention.
- `e2e/s2-code.spec.ts` clicked the diverged dialog's Apply button and then
asserted it was disabled. Apply is disabled from the moment the dialog opens
when the buffer does not parse, so the click only worked because the parse had
not landed yet — the test was asserting a race, not the rule ("an unparseable
buffer cannot be applied"). It now asserts the refusal directly.

### Evidence

- `npm run check` clean (tsc, service-worker tsc, eslint).
- Full browser suite: 254 passed, twice in a row.
- `bugs-palette-add.spec.ts` at 20 repeats × 6 workers: 60 of 60 passed. Before
  the primitive, the same command failed at repeat 12 with the buffer above.
- `bug09-transport.spec.ts:347` at 8 repeats × 4 workers: 8 of 8 passed.

### Residual risk, recorded not fixed

The re-type inside the primitive repairs the *harness*; the app behaviour is
unchanged. If a document arrives (a file switch, or storage resolving) while a person
is typing in the code view, that input can be lost the same way. Three probes narrowed
the mechanism without pinning it (see "Cause"): the view survives the switch, a write
to a focused buffer keeps focus and keymap, and typing after a landed switch was clean
in 60 trials. What is left is the documented-but-unenforced window — `loaded` is sticky
for the App lifetime, so the editor accepts keystrokes while a newly active document's
text is still in flight, the exact case its own comment says must not be offered for
typing. Reaching it needs the code panel open across a switch, which is what tests do
and people mostly do not, so it is recorded rather than changed here. The proposed fix
is written up in
[proposal-code-view-load-window.md](proposal-code-view-load-window.md).
