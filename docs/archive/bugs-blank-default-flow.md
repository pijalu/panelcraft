<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed item: Default flow on blank diagrams

## Observed behavior and reproduction

A blank diagram is a valid header-only document, but the presentation launcher showed
“No flows in this file yet. Add one in Flow Steps.” The existing virtual Default flow
was deliberately restricted to documents with at least one derived step. Populated
blank-diagram journeys already worked: before editing, the existing four Chromium
scenarios in `e2e/bugs-new-diagram-flow.spec.ts` all passed.

The new regressions isolated the remaining gap. Before the fix:

- `npx vitest run web/src/ui/flows/derivedFlow.test.ts
  web/src/ui/flows/flowCatalog.test.ts web/src/ui/flows/FlowPane.test.tsx
  --reporter=verbose` — **3 failed, 83 passed**. The blank catalog was `[]`, blank
  derivation returned `null`, and Flow Steps rendered its old no-flow empty state.
- `npx playwright test e2e/bugs-new-diagram-flow.spec.ts --grep 'blank and populated'
  --reporter=line` — **1 failed**: `launcher-title-default` did not exist on the blank
  diagram.

## Implemented contract

- Every parsed document now has a virtual **Default flow**, including a header-only blank
  document. Blank Default has zero steps; adding the first element immediately gives it a
  process step, and later elements and connectors continue to update it.
- The only production behavior change is in `derivedFlow`: a missing document still returns
  no flow, but an empty parsed document no longer does. The existing display, launcher and
  playback resolution paths therefore share the same guarantee.
- Default remains derived and is never written merely by opening or presenting it. The
  browser regression compares the blank source before and after launcher use and checks
  that it contains no flow block. No grammar, IR, corpus, storage or network behavior changed.
- The Flow Steps and presentation launcher regressions cover both the blank and populated
  states. The previous blank-state authoring expectation was updated to the new contract,
  not removed.

## Green evidence

- Focused flow tests — **3 files, 86 tests passed**.
- `npm run check` — TypeScript, service-worker TypeScript and ESLint exited 0.
- `npm run build` — production bundle exited 0. Vite retained the existing warning about
  chunks larger than 500 kB; no dependency or bundle feature was added.
- `npx vitest run --reporter=dot` — **168 files, 1,837 tests passed**.
- `npm test -- --reporter=dot` — coverage run exited 0: **166 files, 1,829 tests passed**;
  enforced core-package coverage thresholds passed. Perf files remained excluded from this
  instrumented run as configured.
- `npx playwright test --reporter=line` — **280 Chromium tests passed**, including the new
  blank/one-element journey, the existing blank person/container/link journey, both fresh-user
  flow-authoring themes, offline operation and accessibility scenarios.
- `go vet ./...` — exited 0 with no findings.
- `staticcheck ./...` — exited 0 with no findings.
- `gocyclo -over 15 cmd internal web` — exited 0 with no functions above the CI limit.
- `go test -count=1 -race -cover ./...` — all packages passed with the race detector; reported
  coverage included `internal/ir` 84.0%, `internal/pdl` 76.2%, `internal/server` 84.7%, and
  `internal/storage` 81.8%. No Go production code changed.
- `bash scripts/check-docs.sh` — nine required docs, all links resolve, all PDL fences parse.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `bash scripts/check-jargon.sh HEAD` — no opaque identifier-only references added.
- `git diff --check` — no whitespace errors.

## Screenshot review

Reviewed actual captures under `test-results/screenshots/` against the style-guide checklist
and the Mental Model and Cognitive Load lenses:

- `bugs-new-diagram-blank-launcher-light.png` and `-dark.png`;
- `ux08-flow-authoring-empty-light.png` and `-dark.png`.

The launcher offers Default with an honest “0 steps” count instead of the former no-flow
message. Flow Steps shows the same selected Default and its live-derivation hint. Dialog
alignment, 4 px spacing, text hierarchy, visible keyboard focus, readable light/dark contrast
and theme parity are consistent with the existing components. Only owned inline assets appear;
no layout, motion or responsive CSS changed. Keyboard launcher dismissal and populated-flow
playback passed in Chromium. No remaining visual defect was found.

A blank Default intentionally has no narration until the diagram has content; its first added
element supplies the first step without any extra flow-authoring action.
