<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-01 Create the Laws of UX skill

**Status:** closed after implementation and validation.

## Observed behavior

- No repository `.agents/skills` directory existed.
- The contributor handbook was the existing lowercase `agents.md`.
- A Laws of UX audit existed in prior UI work, but there was no reusable agent skill.
- The Laws of UX website listed 30 laws at intake.

## Expected behavior

Add `.agents/skills/laws-of-ux/SKILL.md` and reference it from `agents.md` so the skill is
discoverable for UI design, implementation, review, and screenshot review. Keep the entry
point concise and provide one original PanelCraft-specific reference for each of the 30 laws:
Aesthetic-Usability Effect, Choice Overload, Chunking, Cognitive Bias, Cognitive Load,
Doherty Threshold, Fitts’s Law, Flow, Goal-Gradient Effect, Hick’s Law, Jakob’s Law, Law of
Common Region, Law of Proximity, Law of Prägnanz, Law of Similarity, Law of Uniform
Connectedness, Mental Model, Miller’s Law, Occam’s Razor, Paradox of the Active User, Pareto
Principle, Parkinson’s Law, Peak-End Rule, Postel’s Law, Selective Attention, Serial Position
Effect, Tesler’s Law, Von Restorff Effect, Working Memory, and Zeigarnik Effect.

Each reference needed a concise explanation, application guidance, common failure modes,
review questions, and a source link. The workflow also needed accessibility, reduced-motion,
keyboard, responsive, privacy, and style-guide review. External links remain documentation
only and never runtime resource loads.

## Executed plan

1. Created the skill entry point and `references` directory, with GPL SPDX notices.
2. Added the workflow, checklist, output contract, and exactly 30 individually linked law
   references. The entry point links to the relevant detailed references rather than copying
   the source website.
3. Added a prominent `agents.md` pointer explaining when to load individual references.
4. Added the UX-01 changelog entry and checked the complete inventory and local links.

## Test approach and results

- Inventory check (Node): **30 linked / 30 files**, no duplicates, missing files, unlinked
  files, broken local links, or references missing a required section.
- `bash scripts/check-docs.sh`: **OK — 9 docs, all links resolve, .pcd blocks valid**.
- `npm run build` followed by `bash scripts/check-selfcontained.sh`: **OK — no
  external-origin resource loads in web/dist**. Documentation source links did not enter
  runtime assets.

### Sample checklist reviews

Reviewed actual browser captures in light and dark themes, with the C4 template on canvas and
Quick search open:

- `test-results/screenshots/ux01-canvas-light.png`
- `test-results/screenshots/ux01-canvas-dark.png`
- `test-results/screenshots/ux01-dialog-light.png`
- `test-results/screenshots/ux01-dialog-dark.png`

**Canvas:** common-region and proximity grouping make the palette, code, and properties areas
clear; the selected file tab and connector relationships are legible in both themes. Two
already-tracked defects remain visible: the diagnostic `0` (UX-07) and person label/glyph
overlap (UX-04). No new UX-01 action is needed for those independently planned fixes.

**Dialog:** Quick search provides a single clear input, grouped type/name/path result text,
and an unmistakable selected result using more than a subtle color shift. Light/dark spacing,
alignment, and theme parity are consistent. `npx playwright test` also passed the Search and
Snapshot dialog axe WCAG 2.1 AA checks. No new dialog defect was found in this sample.

## Validation evidence

All commands were run separately and their actual output inspected:

- `npm run check`: passed TypeScript and ESLint.
- `npm test`: **84 files / 909 tests passed**; coverage thresholds passed.
- `npm run build`: passed; existing bundle-size warning only.
- `npx playwright test`: **71 passed**, including offline/no-network and accessibility tests.
- `go vet ./...`: passed.
- `staticcheck ./...`: passed.
- `go test -count=1 -race -cover ./...`: passed.
- `gocognit -over 15 .`: unchanged pre-existing findings in vendored flatted, existing Go
  tests, corpus parity, and Mermaid conversion; no changed Go code.
- `gocyclo -over 12 .`: unchanged pre-existing findings in vendored flatted, existing Go
  parser/printer/lexer and tests; no changed Go code.
