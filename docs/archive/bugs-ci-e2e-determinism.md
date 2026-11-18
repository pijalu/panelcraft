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
