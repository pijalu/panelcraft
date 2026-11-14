---
name: laws-of-ux
description: Apply Laws of UX to PanelCraft design, implementation, UI review, and screenshot review. Use for interaction design, accessibility, information hierarchy, workflow efficiency, and usability findings.
---

<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Laws of UX

Use the Laws of UX as review lenses, not absolute rules or substitutes for usability
research. Apply them to PanelCraft's canvas, code view, panels, dialogs, and flows.

## When to apply

Load this skill for UI design, implementation, design review, or screenshot review. Read
only the references relevant to the interaction under review; the inventory below links to
one concise reference per law.

## Workflow

1. Identify the user's goal, context, current interaction state, and evidence available.
2. Inspect the relevant law references and compare alternatives before prescribing a fix.
3. Check both expected and failure states: keyboard operation, focus, contrast, screen-reader
   naming, reduced motion, narrow viewports, empty/error states, and animation end states.
4. Review alignment, spacing, typography, and theme parity against
   [PanelCraft's style guide](../../../docs/STYLE-GUIDE.md).
5. Protect browser-local-only storage and privacy. Never propose remote persistence,
   analytics, CDN assets, or external runtime dependencies as a UX solution.
6. Validate the implemented change with real interaction tests and light/dark screenshots.

## Review checklist

- Is the primary action clear, reachable, and proportional to its frequency and risk?
- Are choices, grouping, labels, feedback, and defaults matched to user goals?
- Are recognition, existing knowledge, and visible progress preferred over recall?
- Are destructive or irreversible actions guarded without obstructing routine work?
- Are accessibility, responsiveness, reduced motion, and privacy preserved?
- Do screenshots and terminal/test results support each conclusion?

## Output expectations

Report concrete observations before interpretations. For each finding, include severity,
UI state and evidence, relevant law reference, a minimal recommendation, and validation
steps. Distinguish verified defects from hypotheses and note trade-offs or conflicting laws.

## References

- [Aesthetic-Usability Effect](references/aesthetic-usability-effect.md)
- [Choice Overload](references/choice-overload.md)
- [Chunking](references/chunking.md)
- [Cognitive Bias](references/cognitive-bias.md)
- [Cognitive Load](references/cognitive-load.md)
- [Doherty Threshold](references/doherty-threshold.md)
- [Fitts’s Law](references/fitts-law.md)
- [Flow](references/flow.md)
- [Goal-Gradient Effect](references/goal-gradient-effect.md)
- [Hick’s Law](references/hicks-law.md)
- [Jakob’s Law](references/jakobs-law.md)
- [Law of Common Region](references/law-of-common-region.md)
- [Law of Proximity](references/law-of-proximity.md)
- [Law of Prägnanz](references/law-of-pragnanz.md)
- [Law of Similarity](references/law-of-similarity.md)
- [Law of Uniform Connectedness](references/law-of-uniform-connectedness.md)
- [Mental Model](references/mental-model.md)
- [Miller’s Law](references/millers-law.md)
- [Occam’s Razor](references/occams-razor.md)
- [Paradox of the Active User](references/paradox-of-the-active-user.md)
- [Pareto Principle](references/pareto-principle.md)
- [Parkinson’s Law](references/parkinsons-law.md)
- [Peak-End Rule](references/peak-end-rule.md)
- [Postel’s Law](references/postels-law.md)
- [Selective Attention](references/selective-attention.md)
- [Serial Position Effect](references/serial-position-effect.md)
- [Tesler’s Law](references/teslers-law.md)
- [Von Restorff Effect](references/von-restorff-effect.md)
- [Working Memory](references/working-memory.md)
- [Zeigarnik Effect](references/zeigarnik-effect.md)
