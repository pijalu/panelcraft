<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP11 — Flow descriptions and camera contract (IR v8)

**Severity:** Medium — format and persistence foundation

**Status:** Proposed  
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

Pending final parser review; proposed contract above is the starting decision, not implemented.

## Evidence

Pending. Record grammar decision, corpus/parity output and validation commands here.
