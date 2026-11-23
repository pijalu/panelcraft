<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed item: Default playback and connector creation order

## Report and exact-path reproduction

The supplied capture showed a drawn Person 1 → Component 1 connector labelled `test`, but
Default presentation reported `0 / 0` and had no connector spark. The requested contract is
that the existing virtual Default immediately follows the drawing, inherits narration and is
not persisted merely by playing it.

The browser regression now performs that exact path: blank diagram → person → component →
connect → label `test` → immediately present Default. On the current playback integration,
before the ordering change, this path already produced `1 / 1`, narration `test` and one spark;
it did not reproduce the supplied capture's `0 / 0`. The result is recorded rather than
replaced with an assumed stale-source cause.

The test's `default-playback-source-and-plan` attachment separates the two source boundaries:

```json
{
  "codeSourceAtLaunch": "pcd 1.0\n\n",
  "derivedStepsFromCode": [],
  "planFromCode": [],
  "counter": "1 / 1",
  "narration": "test",
  "sparks": 1
}
```

Code's canvas-to-editor render is debounced, so its visible buffer was still header-only at
that instant. The launcher and runner read the synchronously updated workspace text instead,
and therefore had the current connector. No second Default derivation or playback resolver
was added. The browser attachment retains this distinction as a freshness guard.

## Failing regression and fix

Fresh-workspace resolution, connector-label inheritance, process-description inheritance and
non-persistence passed in the new unit integration case before the production change. Strict
creation order did not:

- `npx vitest run web/src/ui/flows/derivedFlow.test.ts --reporter=verbose` — **1 failed, 9
  passed**. With `b → c` created first, two parallel `a → b` connectors next and `c → a`
  closing the cycle, derivation returned references `['#1', '#2', undefined, undefined]`
  instead of `[undefined, '#1', '#2', undefined]`. The topological resort moved the two later
  connectors ahead of the first.

`diagramSteps` now iterates `doc.links` directly. The old entity-ranking/topological-sort helper
had no other production caller and was removed. Message steps remain reference-only, anonymous
parallel links retain their virtual `#<index>` identities, and unrepresented objects still
become process steps. Default and a New flow snapshot therefore use strict creation order;
already authored custom flows are neither reordered nor rewritten by later drawing edits.
There is no grammar, IR, corpus, storage or Go behavior change.

## Executed plan

1. Reproduced the exact draw-connect-label path and recorded code/derived-plan/runner state.
2. Added workspace freshness and inheritance guards plus a RED strict-order case combining a
   topology conflict, parallel connectors and a cycle.
3. Kept the existing virtual Default resolution and changed only the shared step derivation to
   strict creation order; playing still writes no Default flow.
4. Added real Chromium playback checks for truthful counters, inherited narration, visible
   spark opacity and transform movement, custom-flow independence, and reduced-motion end state.
5. Updated the flow-order contract and reviewed light/dark playback filmstrips.
6. Ran focused flow/spark/presentation checks, then the full web and separate Go quality gates.

## Validation evidence

- Focused flow unit/integration suites — **6 files, 169 tests passed**.
- Exact draw/connect/label plus motion/reduced-motion/custom-flow browser scenarios — **2
  passed**.
- `npx playwright test e2e/bug10-default-flow.spec.ts
  e2e/bugs-new-diagram-flow.spec.ts e2e/flow02-sparks.spec.ts
  e2e/bug15-spark-beat-timeline.spec.ts e2e/bugs-spark-route.spec.ts
  e2e/bug09-transport.spec.ts e2e/p2-present.spec.ts --reporter=line` — **31 passed**.
- `npm run check` — TypeScript, service-worker TypeScript and ESLint exited 0.
- `npm test -- --reporter=dot` — **167 files, 1,838 tests passed** with coverage thresholds
  enforced; aggregate coverage was 87.21% statements, 79.09% branches, 84.57% functions and
  90.00% lines.
- `npx playwright test --reporter=line` — full Chromium suite, **287 passed**.
- `npm run build` — production bundle exited 0. Vite retained the existing warning about chunks
  larger than 500 kB; no dependency or bundle feature was added.
- `go vet ./...`, `staticcheck ./...` and `gocyclo -over 15 cmd internal web` — exited 0 with no
  findings.
- `go test -race -cover ./...` — all packages passed. Statement coverage was 70.4% for the CLI,
  84.0% for IR, 76.2% for PDL, 84.7% for the server and 81.8% for storage.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `bash scripts/check-docs.sh` — nine documents checked, links resolved and PCD blocks parsed.
- `bash scripts/check-jargon.sh HEAD` and `git diff --check` — no opaque identifier-only additions
  or whitespace errors.

## Screenshot review

Reviewed these actual captures under `test-results/screenshots/` against the PanelCraft style
guide and the Flow UX lens:

- `bugs-default-playback-spark-early-dark.png`;
- `bugs-default-playback-spark-moving-dark.png`;
- `bugs-default-playback-spark-moving-light.png`;
- `bugs-default-playback-reduced-light.png`;
- `bugs-default-playback-reduced-dark.png`.

The motion frames show `1 / 1`, narration `test` and a spark whose own SVG transform changes,
not merely a camera refit. Both reduced-motion themes show the settled endpoint token with the
same counter and narration, no travelling spark or trail, and no token animation. Transport
controls, progress and narration remain visible; spacing, contrast and theme parity showed no
change-related visual defect. Captures are gitignored run artifacts, not new golden images.

## Residual risk

The historical capture's original `0 / 0` cause was not established on this revision. The exact
current path is covered and passes; the demonstrated production defect fixed here is the
creation-order resort. Existing custom-flow behavior and reduced-motion playback remain covered
by the focused and full suites.
