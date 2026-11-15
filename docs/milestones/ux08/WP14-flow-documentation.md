<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP14 — Human and agent flow documentation

**Severity:** Medium — maintainable human/agent documentation

**Status:** Implemented and verified (2026-11-15)  
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

**Red first.**

```
$ npx vitest run web/src/engine/format/flowMarkdown.test.ts
Error: Cannot find module './flowMarkdown' imported from
  /Users/muaddib/dev/panelcraft/web/src/engine/format/flowMarkdown.test.ts
 Test Files  1 failed (1)   Tests  no tests
```

The formatter test, both golden fixtures and the export actions were written against the golden
text before `flowMarkdown.ts` existed.

**Format** (pure, deterministic, parsed IR only):

```markdown
# Café walkthrough ⚡

_How an order reaches the shop_

1. **Intro** — Welcome
   (dwell 800 ms)
2. **Message** — Ada `a` → Wéb · Shop `b`: order
   _the order leaves the shopper_
   (camera hold)
3. **Process** — API "core" `c`: settles
   (camera focus (420, 180) zoom 1.5)
5. **Alternative** "express?"
   - **Branch "yes"**
     1. **Message** — Ada `a` → API "core" `c`: rush
8. **Go to** — other.pcd#refund (returns here)
   (camera auto; transition 120 ms)
```

`flowMarkdown(doc, flow)` = `# title`, italic purpose, `1.`-numbered top-level steps; alt branches
and par lanes nest one level deeper with their own numbering. Every step keeps the readable name
**and** the stable id, the link label and direction (`, flipped` for `flip`), the per-step
description, the dwell and the camera behaviour (automatic/hold/focus with zoom and transition),
and the `goto` target. A reference the diagram does not define renders as
`ghost `ghost` (not in this diagram)` — a step is never dropped. Prose and labels are escaped
(`\*`, `\_`, `\[`, `` \` ``, `\<`, `\>`, `\|`, `\~`, `\\`) so a title or note cannot restructure
the document. `flowsMarkdown(doc)` is `# Flows` plus one `## title` section per flow.
`markdownFileName(flow, activePath)` slugs the title (`Café walkthrough ⚡` → `cafe-walkthrough`,
NFKD + diacritic strip) onto the file stem, so downloads stay browser-safe with no path
separators.

**Golden fixtures.** `testdata/markdown/all-steps.pcd` covers all eight step kinds, nested
alt/par, `goto "other.pcd#refund" return here`, unicode (`Café walkthrough ⚡`, `Wéb · Shop`),
quoted names (`API "core"`) and every presentation field: `delay 800`, `camera hold`,
`camera focus (420, 180) zoom 1.5`, `camera auto` + `duration 120`. `all-steps.md` (selected
flow) and `all-flows.md` (both flows) are compared byte for byte; `EXPORT_FIXTURE=1` regenerates
them through the formatter and produced an identical file, so they are generated, not hand-typed
evidence. The unresolved-reference, empty-flow and escaping cases are inline-PDL unit tests
(the fixture itself stays Go-valid: `panelcraft validate testdata/markdown` → 0 errors).

**UI.** `.md` beside *Steps* exports the selected flow, **All flows (.md)** beside *New flow*
exports every flow. Both go through the existing `downloadText` adapter (`text/markdown`), build
the text from the parsed document in memory and are offline; neither touches the text, the
selection, playback or the dirty flag. `flow-export-doc` is only rendered when a flow is selected
and `flow-export-docs` only when flows exist, so the empty and no-file states explain themselves
(the existing `flow-empty` / `flow-error` panes). Prose and ids never leak into the UI copy —
every string is in `strings.ts`.

**Docs gates.** `scripts/check-docs.sh` now validates ```pcd fences in `docs/USER-GUIDE.md` as
well as the spec; `docsExamples.test.ts` parses the same fences with the TypeScript engine and
parses every `testdata/markdown/*.pcd`, so the shipped example is checked by both parsers.
`docs/MERMAID-MATRIX.md` gained a *Flow documentation export* section that pairs every declared
sequence drop with what the Markdown outline keeps instead (`MARKDOWN_COVERAGE`, regenerated via
`MERMAID_MATRIX=1`, never hand-edited).

**Browser defects found by the screenshot review and fixed.**

1. **The `.md` button was clipped.** In a narrow Flow Steps panel the sticky head row
   (`Steps` + `Present` + `.seq.mmd` + the new `.md`) overflowed and the last button was cut off in
   both themes. The row now wraps and the three actions travel as one right-aligned group; the E2E
   asserts `scrollWidth - clientWidth <= 0` and that the button's right edge stays inside the
   panel.
2. **The all-flows export read as a third flow row.** It shared the full width and styling of the
   list rows, so the panel looked like it had three flows. It now sits beside *New flow* in a
   two-button action row.

**Checks.**

```
$ npx vitest run web/src/ui/flows web/src/engine/format
 Test Files  26 passed (26)
      Tests  309 passed (309)          # includes flowMarkdown (11) + docsExamples (3)
$ npx vitest run                      # whole suite
 Test Files  119 passed (119)
      Tests  1300 passed (1300)
$ npm run check
(no output: tsc, tsc -p tsconfig.sw.json, eslint clean)
$ npm run build
✓ built in 116ms
$ npx playwright test e2e/ux08-flow-documentation.spec.ts
  ✓ the selected flow downloads as the golden Markdown      (byte-identical to all-steps.md)
  ✓ all flows download as the golden outline                (byte-identical to all-flows.md)
  ✓ exporting leaves the document untouched
  ✓ export actions are visible in both themes               (no head-row overflow)
  4 passed
$ npx playwright test e2e/flow01-canvas-flows.spec.ts e2e/p6-sequence-export.spec.ts
  6 passed                          # sequence export unchanged
$ npx playwright test                    # full suite
  155 passed (1.1m)
$ go test ./... && go vet ./... && staticcheck ./... && gocyclo -over 15 cmd internal web
GATES_OK
$ go run ./cmd/panelcraft validate testdata/markdown
1 files checked, 0 errors, 1 warnings (P202: flow "Refunds" has no visual steps)
$ bash scripts/check-docs.sh && bash scripts/check-selfcontained.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
check-selfcontained: OK — no external-origin resource loads in web/dist
```

**Screenshot review** (`test-results/screenshots/ux08-documentation-actions-{light,dark}.png`):
flow list (`Café walkthrough…` active, `Refunds`), the two-button action row, the step head with
`Steps` + `Present` + `.seq.mmd` + `.md` fully visible, the purpose field, and the numbered step
cards with names instead of ids. Both defects above were found here, fixed, and re-shot; no
outstanding visual defects.

**Recorded, not fixed (out of scope).** The documentation export is one-way: there is no Markdown
import, and the outline is not a second source of truth — PDL stays normative. The canvas→file
write window recorded in WP12 is unchanged.
