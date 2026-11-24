# New-file starters use drawn Default steps

## Observed

Blank, C4 and Mermaid starters exposed the virtual **Default flow**, but the Flow
starter also authored **Checkout**. Flow Steps initially selected Checkout. Its
`POST /checkout` and `201 Created` messages existed only inside that flow block, not
as top-level connectors, so the canvas had no links and Default derived object process
steps instead of the template's request/response. The C4 card also said “one link”
although its drawing and Default contained two connectors.

## Required starter contract

| Starter | Initial flows | Default steps | Drawn connectors |
| --- | --- | --- | --- |
| Blank | Default only | none | 0 |
| C4 context | Default only | `buys`, `charges` | 2 |
| Flow | Default only | `POST /checkout`, `201 Created` | 2 |
| Mermaid | Default only | `Service A → Service B` | 1 |

Default remains virtual. Opening or presenting a starter must not persist a flow block.
Custom flows remain supported outside the gallery starters.

## Fix

The Flow template now declares its request and response as top-level connectors and no
longer authors a separate Checkout flow. Existing Default derivation therefore produces
the same two messages shown on the canvas and in Code. The C4 hint now says “two links”.
No grammar, IR, persistence or general flow-derivation change was needed.

The existing template presentation regression now launches Default for the Flow
starter; its object-name, playback, editing-chrome and theme assertions are unchanged.
The user guide and both changelogs describe the starter behavior.

## Regression evidence

Before the production fix:

- `npx vitest run web/src/ui/uxLaws.test.tsx --reporter=verbose` — **2 failed, 11
  passed**. Flow exposed `['Default flow', 'Checkout']` instead of only Default; the C4
  card did not contain “two links”.
- `npx playwright test e2e/bugs-new-diagram-flow.spec.ts --grep 'new flow file opens Default' --reporter=line`
  — **1 failed**: the Flow starter's flow list contained 2 rows instead of 1. The
  failure capture showed Checkout selected and no drawn connectors. An earlier harness
  setup error (waiting for Code's sync indicator with Code closed) was corrected before
  recording this product-level failure.

After the fix:

- Focused unit test — **13 passed**.
- `npx playwright test e2e/bugs-new-diagram-flow.spec.ts --reporter=line` — **8 passed**,
  covering every starter's sole Default selection, step titles/order, connector count
  and presentation-launcher count.
- The first full Chromium run — **283 passed, 1 failed**: the pre-existing Flow
  presentation test still waited for the removed Checkout launcher. After updating that
  caller to Default, its focused test passed and the full run passed **284/284**.

## Full validation

- `npm run check` — TypeScript and ESLint passed.
- `npm run build` — static bundle built successfully.
- `npx vitest run --reporter=dot` — **168 files, 1,839 tests passed**.
- `npm test -- --reporter=dot` — coverage run passed: **166 files, 1,831 tests**;
  configured core coverage thresholds passed.
- `npx playwright test --reporter=line` — **284 passed**.
- `go vet ./...` — passed.
- `staticcheck ./...` — passed.
- `gocyclo -over 15 cmd internal web` — no findings.
- `go test -count=1 -race -cover ./...` — all packages passed.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `bash scripts/check-docs.sh` — 9 documents checked; links and PCD blocks passed.
- `bash scripts/check-jargon.sh HEAD` — no opaque identifier-only references added.

## Screenshot review

Reviewed the Laws of UX mental-model lens and the PanelCraft style guide against:

- `test-results/screenshots/bugs-new-diagram-flow-template-light.png`
- `test-results/screenshots/bugs-new-diagram-flow-template-dark.png`

Both themes show Web app and API with labeled request/response connectors, Default
selected with `POST /checkout` followed by `201 Created`, and Code containing only the
object declarations and those connectors. Canvas, Code and Flow Steps agree without
requiring the user to infer a hidden authored flow. Labels, selection, spacing and theme
contrast remain consistent. **No change-related visual defects found.** Captures are
gitignored run artifacts, not curated golden images.

## Residual risk

Low and limited to gallery starter text and its browser expectations. Existing documents
with authored Checkout flows are unchanged; their custom-flow behavior remains covered
by the full unit and Chromium suites.
