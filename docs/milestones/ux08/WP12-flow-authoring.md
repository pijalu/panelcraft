<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP12 — Visible guided flow authoring

**Severity:** High — author workflow and guidance

**Status:** Implemented and verified (2026-11-15)  
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

**RED first.** The WP12 behaviours were written as tests before the pane was changed. With the
implementation stashed (only `web/src/ui/flows/FlowPane.test.tsx` in place), 15 of 32 tests failed:

```
$ git stash push -- web/src/ui/flows/FlowPane.tsx web/src/ui/flows/flowDoc.ts \
    web/src/ui/uiLayout.ts web/src/ui/strings.ts web/src/ui/app.css
$ npx vitest run web/src/ui/flows/FlowPane.test.tsx
× explains flows and offers New flow when the document has none
  TestingLibraryElementError: Unable to find an element by: [data-testid="flow-empty"]
× numbers the cards and names the shapes instead of their ids
  TestingLibraryElementError: Unable to find an element by: [data-testid="step-number-0"]
× seeds a new message step from the selected connector and never invents one
× refuses to add a message step when no connector is selected
× explains a step that points at a shape the diagram does not have
× presents the edited flow from the pane
× reorders with the keyboard (Alt+ArrowUp)
… 15 failed | 17 passed (32)
$ git stash pop
```

The fresh-user E2E (`e2e/ux08-flow-authoring.spec.ts`) was then run against the changed app and
drove four further fixes, each reproduced in the browser first:

1. **Flows was unreachable from the default shell.** `uiLayout.defaultLayout()` opened with
   `flows: 'closed'`, and a rail that does not exist cannot be found; the default is now
   `collapsed` and every rail (`PanelRail`) renders a visible, vertical label instead of a bare
   chevron, so *flow steps* is legible in the default layout.
2. **A brand-new file could not host a flow.** The bootstrap file is empty (no `pcd 1.0` header),
   so `parsePDL('')` returned no document and the pane said “Active file has parse errors”.
   `retext()` and the pane now treat a blank file as an empty document and seed the header on the
   first edit (`flowDoc.test.ts` / `FlowPane.test.tsx` “starts authoring from a blank file”).
3. **Enter did nothing on shell buttons once the canvas had a focus id.**
   `CanvasController.handleNavKeys` consumed `Enter` at the window level for the roving canvas
   focus regardless of where the key came from, so keyboard activation of every button silently
   failed after clicking the canvas (Space still worked). A focused control now owns
   Enter/Space (`ownsActivationKey`), with a regression test in `CanvasController.test.ts`.
4. **Typing in the pane dropped characters.** Field values were bound straight to the file text,
   which arrives asynchronously ~1 s after an edit, so each keystroke raced the previous apply
   (typing “Order placed” left `d`). `useDraft` keeps a local draft while a field is focused and
   lets the file win otherwise.

**Behaviour delivered.** Empty state with an explanation and **New flow**; `Flow name` +
`Flow purpose` (printed as the flow `description`); numbered cards with kind, readable title,
actor **names** (id → name map, never raw ids), step description and a per-card validation note
for shapes the diagram does not define; primary actions **Add message** (selected connector only),
**Add process** (exactly one selected shape), **Add note**, **Add introduction**, **Add
conclusion**, each disabling itself with a visible explanation and never inventing a link;
`alt`/`par`/`goto` behind **Advanced step**; drag reorder plus the inspector arrows and
`Alt+↑`/`Alt+↓` on a focused card; **Description** in the inspector for every step kind;
**Present** beside the edited flow. `patchFlow()` in `flowDoc.ts` owns flow-level edits, and every
change still goes through `retext()` → `onChangeText` → `machine.textChanged`, so the file remains
the single writer (undo/history and the code view stay in step).

**Checks.**

```
$ npx vitest run web/src/ui/flows/FlowPane.test.tsx web/src/ui/flows/flowDoc.test.ts \
    web/src/ui/App.test.tsx web/src/ui/workspaceLayout.test.ts
 Test Files  4 passed (4)
      Tests  78 passed (78)
$ npm run check
(no output: tsc, tsc -p tsconfig.sw.json, eslint clean)
$ npm run build
✓ built
$ npx playwright test e2e/ux08-flow-authoring.spec.ts
  ✓ UX08-WP12: fresh-user flow authoring (light)  (12.2s)
  ✓ UX08-WP12: fresh-user flow authoring (dark)  (12.2s)
  2 passed
$ npx playwright test e2e/flow01-canvas-flows.spec.ts e2e/flow02-sparks.spec.ts \
    e2e/p2-flowedit.spec.ts e2e/s3-flows.spec.ts
  9 passed
$ npx playwright test e2e/ux02-workspace.spec.ts e2e/p1-shell.spec.ts \
    e2e/ux08-panels.spec.ts e2e/ux08-shell.spec.ts e2e/ux03-files.spec.ts
  22 passed
```

**Fresh-user E2E coverage** (`e2e/ux08-flow-authoring.spec.ts`, both themes, no View menu and no
code pane on the authoring path): the labelled rail is present on first load; the panel opens by
keyboard; the empty state explains itself; **New flow** is activated with Enter; the flow is named
by keyboard; **Add message** is disabled until a connector is selected and then seeds both
endpoints; cards are numbered and show `Person 1 → System 2` rather than `o1 → o2`; a step
description typed into the inspector shows on the card; **Add process** comes from the selected
shape; **Advanced step** opens by keyboard and adds `alt` with a new branch; typing an unknown id
shows `The shape ghost is not in this diagram.` and repairing it through **To selection** clears
the warning; the inspector arrow reorders steps; **Present** starts and exits playback; axe
(`wcag2a`, `wcag2aa`, `wcag21aa`) reports no violations.

**Screenshot review** (`test-results/screenshots/`, light + dark):
`ux08-flow-authoring-shell-*` (rail visible with its *flows* label in the default shell),
`…-empty-*` (dashed empty state, explanation, single primary action),
`…-simple-*` (numbered cards, readable actor names, description line, disabled actions with
hints), `…-nested-*` (alt card with branch count, Advanced step open, inspector showing
Description/Label/Branch fields), `…-invalid-*` (warning beside the offending step). Alignment,
contrast, focus outlines and the disabled-action affordances matched the style guide; no new
defect was filed. Two observations recorded rather than changed: the per-card `delay` input is
always visible (a candidate for progressive disclosure) and the SHAPES host header wraps onto two
rows at its default width — both pre-date this WP and belong to the shell/panel chrome.

**Known window (pre-existing, not fixed here).** A flow edit issued while the canvas→file bridge
is still writing (≈1 s after a canvas gesture) is computed from the stale file and lost. The
specs sequence around it with an explicit settle; the honest fix belongs in the M4 single writer
(its emissions carry a document snapshot taken at load time) and is out of WP12's scope — recorded
here so WP13/WP15 can decide.

**Docs.** `docs/USER-GUIDE.md` §3 now documents the rail entry, the empty state, flow name/purpose,
the selection-driven actions, the numbered cards with names/descriptions/validation, the inspector,
`Alt+↑`/`Alt+↓` reorder, **Advanced step** and **Present**.
