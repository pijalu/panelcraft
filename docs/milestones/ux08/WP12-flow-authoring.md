<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP12 — Visible guided flow authoring

**Severity:** High — author workflow and guidance

**Status:** Proposed  
**Requirement:** 10 — simple flow definition, presentation and documentation workflow  
**Depends on:** WP01 for menu/entry behavior and WP11 for the parsed description model  
**Branch:** `feat/ux08-flow-authoring`

## Single-task outcome

A fresh user can find **Flows**, create and describe a flow, select a connector/object, add a
message/process, describe/reorder steps and play it without typing raw IDs. Advanced step types
remain available. WP13 owns camera/presentation controls; WP14 owns Markdown generation.

## Evidence and UX rationale

Flows are closed by default (`uiLayout.ts:78-89`) and the guide requires View → Flow Steps.
`FlowPane.tsx:117-175` exposes raw from/to fields. Existing code is reusable, not UX acceptance.
Hick’s Law requires progressive disclosure; Working Memory requires readable participants instead
of memorized IDs.

## Implementation steps

1. **E2E first:** visible Flows entry → New flow → name/purpose → select link → Add message →
   description → Play. Add a second process step from object selection. No View-menu knowledge or
   ID typing is allowed in the common-path test.
2. Add a persistent, labelled Flows activity/rail entry and application-menu actions. Provide an
   empty state with **New flow** and a short explanation; preserve selection across panel remounts.
3. Support flow title/description editing and numbered step cards with readable titles, actor
   summaries, descriptions and validation. Keep PDL/code sync as the single writer.
4. Primary actions: **Add message** from the selected existing connector, **Add process** from the
   selected object, **Add note**, introduction and conclusion. Disable impossible actions with a
   visible explanation; never invent links.
5. Put `alt`, `par` and `goto` under **Advanced step** with the existing nested editing behavior.
   Keep drag reorder plus keyboard up/down, duplicate/delete and undo/history integration.
6. Add **Present** beside the edited flow using current playback until WP13 lands. Add the WP14
   documentation action only when that dependency is available; do not stub a dead button.
7. Update the user guide’s common path. Preserve all eight types, sequence export and existing
   advanced fixtures.

## Required checks

```bash
npx vitest run web/src/ui/flows/FlowPane.test.tsx web/src/ui/flows/flowDoc.test.ts web/src/ui/App.test.tsx
npm run check
npm run build
npx playwright test e2e/flow01-canvas-flows.spec.ts e2e/flow02-sparks.spec.ts e2e/p2-flowedit.spec.ts e2e/s3-flows.spec.ts
```

Add the fresh-user E2E in both themes with keyboard-only and invalid-reference paths. Capture the
empty state, simple authoring and advanced nested step states.

## Acceptance

- Flow creation and simple message/process authoring work entirely through visible selection-based
  actions; no raw-ID memorization.
- Flow/step descriptions persist through WP11 PDL and reload with no shadow state.
- Invalid references are explained beside the step; advanced flows still play and round-trip.
- Flows is discoverable from the default shell, and screenshot review shows clear primary actions.

## Evidence

Pending. Record the fresh-user RED path, green commands and screenshot/accessibility review here.
