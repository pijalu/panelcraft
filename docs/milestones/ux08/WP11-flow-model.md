<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP11 — Flow descriptions and camera contract (IR v8)

**Severity:** Medium — format and persistence foundation

**Status:** Implemented and verified (2026-11-15)  
**Requirements:** 10 and 11 model foundation  
**Depends on:** nothing  
**Branch:** `feat/ux08-flow-model`

## Single-task outcome

Define and implement the shared TS⇄Go PDL/IR contract for flow/step descriptions and optional
per-step camera behavior. Do not build the Flow pane or presentation UI in this WP.

## Evidence and UX rationale

`model/types.ts:127-157` supports per-step dwell only; Flow has no description and Step has no
camera/description. `anim/camera.ts:43-79` always auto-fits with fixed timing. Working Memory
requires visible documentation; canonical PDL must serve agents without a shadow UI-only model.

## Locked model

- Add `Flow.description?: string`.
- Split a flow-step-specific base from the current shared `StepBase`; do not leak camera or flow
  descriptions into `ViewLine`.
- Add step `description?: string` and optional `CameraSpec`:
  - `auto`, optional duration; also the default when camera is absent;
  - `hold`, retaining the previous camera;
  - `focus { x, y, zoom? }` in canvas coordinates, optional duration.
- Zoom uses the existing 0.1–4 limits. Camera duration is 0–300 ms. Existing `delay <ms>` dwell
  stays separate and does not include transition time.
- All eight existing step types remain. Branch choice remains playback-only.

Proposed surface syntax (a `text` fence intentionally: this is not valid PDL until this WP lands):

```text
flow "Checkout" as checkout {
  description "A customer submits an order and receives a receipt."

  intro "Order journey" presentation {
    description "Start with the whole checkout landscape."
    camera auto
    duration 300
  }

  customer -> storefront : "Submit order" delay 2500 presentation {
    description "The browser sends the cart to the storefront."
    camera focus (420, 180) zoom 1.25
    duration 300
  }

  process storefront "Validate cart" presentation {
    description "The storefront checks prices and inventory."
    camera hold
  }

  conclusion "Receipt delivered"
}
```

A `presentation` suffix is valid after every step kind, including `alt`/`par` after their closing
brace. It prints only for non-default metadata. Absence preserves current behavior except for the
explicitly reviewed automatic intro/conclusion overview implemented in WP13.

## Implementation steps

1. Review this grammar against the lexer/parser and record the final decision below before code.
   If syntax changes, update this brief, SPEC and format examples atomically; do not implement a
   different silent contract.
2. Add parser/printer/validation fixtures for every step kind, optional fields, finite focus,
   zoom/duration bounds, duplicates and malformed blocks. Preserve comments and source positions.
3. Bump IR to v8. Update TS types/parser/printer/semantic validation and Go `internal/ir` +
   `internal/pdl` in the same change. Print only non-default metadata and prove idempotence.
4. Update `docs/SPEC.md`, `docs/FILE-FORMAT.md`, `docs/MERMAID-MATRIX.md` and suitable corpus/
   architecture examples. Declare description/camera Mermaid mappings or drops explicitly.
5. Regenerate shared fixtures only with the acceptance command; diff-review all changes and never
   hand-edit `.ir.json`. Old files must parse without requiring presentation metadata.

## Required checks

```bash
node scripts/corpus-accept.mjs
npm run corpus:check
npm run check
npx vitest run web/src/engine/model web/src/engine/format
go test ./...
bash scripts/check-docs.sh
```

Build/run the Go CLI through the repository’s verified path and validate `docs/architecture`;
record the exact command used.

## Acceptance

- TS and Go produce byte-equivalent shared IR for old and new corpus files.
- Canonical PDL round-trips descriptions/camera for every step kind with no unrelated diff.
- Invalid ranges/references have positioned diagnostics; no UI-only camera/description state.
- Format/spec/matrix/corpus changes are atomic and all listed checks pass.

## Format decision

**Approved as proposed, with three clarifications recorded during parser review:**

1. `presentation { … }` is a *suffix on any step*, including `alt`/`par` after their closing
   brace (`} presentation {`). It is unambiguous because `presentation` is not a step keyword and
   an ident step needs an arrow.
2. The three block lines are order-free and each allowed at most once (`description`, `camera`,
   `duration`); the canonical printer always emits them in that order, so source order never
   survives into the file.
3. `duration` **requires** a `camera` line in the same block. It is camera *travel* time (0–300 ms)
   and is deliberately separate from the step's `delay <ms>` (reading dwell); a duration on its own
   would silently invent a camera, so it is a positioned syntax error (E100).

Bounds: `zoom` 0.1–4 (the canvas limits) and `duration` 0–300 ms, both enforced with positioned
diagnostics in TS and Go. `camera focus` takes document coordinates; `auto`/`hold` take none.
`zoom` is only accepted on the `focus` line. An empty `presentation { }` block parses to no
metadata and prints nothing (only non-default metadata is printed).

## Evidence

**RED first.** `web/src/engine/format/presentation.test.ts` was written before the grammar and
failed against the pre-v8 engine:

```
$ npx vitest run web/src/engine/format/presentation.test.ts
  Tests  9 failed | 4 passed (13)
  AssertionError: expected 7 to be 8
  AssertionError: expected [ { code: 'E100', …(4) } ] to deeply equal []
  AssertionError: expected 'expected arrow, got '{'' to contain 'zoom'
  AssertionError: expected { code: 'E100', …(4) } to match object { code: 'E110' }
```

**Grammar landed in both engines atomically.** TS: `model/types.ts` (`IR_VERSION = 8`,
`CameraSpec`, `FlowStepBase` split out of the shared `StmtBase` so a view line can never grow a
camera, `Flow.description`), `model/serialize.ts` (fixed key order `description`/`camera`),
`format/parser.ts` (+`flowDescription`, `presentation`, `presentationBody`,
`presentationKey`, `parseCamera`, `cameraZoom`, `cameraDuration`), `format/printer.ts`
(`presentationLines`, block hangs off the step's last line). Go: `internal/ir` (`IRVersion = 8`,
`Camera`, `Step.Description/Camera`, `Flow.Description`), `internal/pdl/parser.go` and
`printer.go` mirroring each function one-for-one.

**Parity.** The shared fixture gained 12 cases (all step kinds, every camera mode, order
independence, empty block, and six error cases):

```
$ CORPUS_FIXTURE=1 npx vitest run web/src/engine/format/parity.test.ts
  Tests  1 passed (1)                     # rewrites testdata/pdl-cases.json from TS
$ go test ./internal/pdl/ -run TestParityFixture
ok  github.com/pijalu/panelcraft/internal/pdl  0.276s
$ go test ./internal/corpus/
ok  github.com/pijalu/panelcraft/internal/corpus  0.307s
```

The Go replay compares IR JSON, canonical PDL *and* parse/validation diagnostics byte for byte,
so the new syntax round-trips identically on both sides.

**Corpus.** New case `testdata/corpus/flow-presentation/` exercises a flow description, all eight
step kinds, all three camera modes, zoom/duration bounds edges (`0.1`, `0`, `300`) and flat
re-wrapping. Regenerated only through the acceptance command:

```
$ node scripts/corpus-accept.mjs
  Test Files  3 passed (3)
      Tests  83 passed (83)
$ git status --porcelain testdata | wc -l      # 22 existing canonicals + the new case
```

The only diff in the 22 pre-existing canonicals is `"irVersion": 7` → `8`, i.e. old files still
parse and print with no unrelated diff.

**Checks.**

```
$ npm run check
(no output)
$ npx vitest run
 Test Files  115 passed (115)
      Tests  1234 passed (1234)
$ npm run corpus:check
      Tests  25 passed (25)
$ go test ./...
ok  cmd/panelcraft · internal/corpus · internal/ir · internal/pdl · internal/server
$ go vet ./... && staticcheck ./... && gocyclo -over 15 cmd internal web && echo GATES_OK
GATES_OK
$ bash scripts/check-docs.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
```

**CLI, through the repository's verified path** (`go build -o /tmp/panelcraft ./cmd/panelcraft`):

```
$ /tmp/panelcraft validate docs/architecture
2 files checked, 0 errors, 4 warnings, 0 infos      # pre-existing P201 orphan notes only
$ /tmp/panelcraft convert testdata/corpus/flow-presentation/canonical.pcd -o /tmp/rt.pcd
wrote /tmp/rt.pcd                                    # diff -u → identical
$ /tmp/panelcraft validate testdata/corpus/flow-presentation/canonical.pcd
1 files checked, 0 errors, 0 warnings, 0 infos
```

(`panelcraft validate testdata/corpus` exits 2 — that tree is per-case
`<case>/input.pcd`, and the CLI takes files or flat directories; the corpus is covered by the
parity replay above instead.)

**Docs.** `docs/FILE-FORMAT.md` §6 gained the `presentation` grammar and rules, the IR-v8 note and
bounds; `docs/SPEC.md` FR-F1/FR-F4 state the description and camera contract and §7 lists the v8
`Step`/`Flow` shape; `docs/MERMAID-MATRIX.md` (generated) now declares `flow descriptions`,
`step descriptions` and `camera overrides` as sequence/flow export drops.

**Not in this WP.** No Flow pane or presentation UI (WP12/WP13 consume the model); the player still
ignores `camera` so playback is unchanged until WP13 wires it.
