<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP14 — Human and agent flow documentation

**Severity:** Medium — maintainable human/agent documentation

**Status:** Proposed  
**Requirement:** 10 — document flows for humans and agents  
**Depends on:** WP11 for descriptions/camera and WP12 for the selected-flow UI  
**Branch:** `feat/ux08-flow-documentation`

## Single-task outcome

Export deterministic Markdown for one or all flows and document the canonical agent-readable PDL
workflow. Do not alter playback, sequence conversion semantics or workspace persistence.

## Contract

- PDL is the normative agent interface; shared IR/JSON fixtures are the TS⇄Go contract.
- Markdown is generated from parsed IR, never transient flattened playback beats.
- Include flow title/description, ordered and nested steps, human object names plus stable IDs,
  link label/direction, per-step description, dwell and camera behavior.
- Keep `.seq.mmd` export. Explicitly declare description/camera fields that Mermaid cannot
  represent; never imply lossless Mermaid conversion.

## Implementation steps

1. Add golden Markdown fixtures covering all eight step types, nested alt/par, goto, unicode,
   empty descriptions, automatic/hold/focus camera and dwell.
2. Implement a small deterministic pure formatter with stable headings/numbering and escaped
   Markdown text. Include unresolved reference text rather than silently dropping a step.
3. Add **Export documentation (.md)** for the selected flow and an all-flows action. Use safe
   filenames, existing download adapters and browser-local generation only.
4. Empty/no-file/parse-error states explain why export is unavailable. Export does not mutate
   source, selection, playback or dirty state.
5. Update `docs/USER-GUIDE.md` with the visual authoring path and an agent section linking the
   normative grammar and a valid PDL example. Update `docs/MERMAID-MATRIX.md` for declared drops.

## Required checks

```bash
npx vitest run web/src/ui/flows web/src/engine/format
npm run check
npm run build
npx playwright test e2e/flow01-canvas-flows.spec.ts e2e/p6-sequence-export.spec.ts
bash scripts/check-docs.sh
```

Add selected/all download E2E while offline and compare actual content to goldens. Any new PCD
example must pass the documentation parser gate and shared TS⇄Go validation.

## Acceptance

- Golden Markdown covers every step type and all WP11 metadata with deterministic output.
- Selected/all downloads work offline without changing the source document.
- Human guide and agent-oriented PDL documentation match the shipped UI and grammar.
- Mermaid sequence behavior is unchanged and all feature drops are explicit.

## Evidence

Pending. Record golden tests, downloaded-content comparisons, docs checks and screenshot review.
