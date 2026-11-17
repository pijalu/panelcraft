# Flow steps list the flow; the Properties panel edits the step

Closed. This is the design correction to the flow-editing surface: the step list
had grown into an editor, and the Properties panel showed object/link fields next
to it, so a reader editing a walkthrough had two half-editors and no clear place
to look.

## What changed

**Flow Steps shows the flow.** One row per step: number, type, title, the
participants it moves between (`from → to`), a warning marker when the step does
not resolve, and the two actions that stay useful in a list — play from here and
duplicate. Adding a flow, adding a step (message, process, note, advanced:
alternative / parallel / goto) and the all-flows export stay in the column, and
hidden connections are still reachable there. Nothing else.

**Selecting a step hands it to the Properties panel**, grouped from what changes
most to what changes least:

| Group | Fields |
|---|---|
| Step | type, description, endpoint/kind fields |
| Camera | framing mode, zoom, duration, "use this view" |
| Playback | delay, advance behaviour |
| Connector animation | sparks, speed (shared by the resolved link) |
| Advanced | flip, connector reference, hide-connection |

**Selecting the flow itself shows the flow's properties** in the same panel:
title, purpose, Markdown notes, the presentation toggle and illustration choice,
and the exports. Introduction and Conclusion are always offered as steps and are
dropped again when left empty — writing them is what creates them.

**One selection, one subject.** Choosing a flow or a step clears the canvas
selection; pressing the diagram clears the flow selection. The canvas reports the
press itself (`CanvasController.onUserPointer`) instead of the shell listening on
the SVG, because the shell cannot tell a canvas press from a press on the shell
around it, and its listener went stale whenever the document was re-applied and
the SVG node was replaced.

Message endpoints are closed-domain selects over the document's own entities
(values are ids, labels are names). The old canvas "pick" buttons existed to let
the user point at an entity; with exclusive selection they would have closed the
step being edited, so they are gone.

## Why the old approach was wrong

The previous panel kept a per-step editor inline in the list and left
object/link properties in the Properties column. That produced three problems: the
list could not stay scannable once steps had ten controls each; the two panels
competed for the same screen space with different subjects; and a step edit that
rewrote the file could reload the canvas and re-select the step's connector, which
then swapped the panel *while the user was typing*.

## Validation

- `web/src/ui/flows/flowSession.ts` — one pending-buffer session shared by the
  list and the panel, so both surfaces write through the same path.
- `web/src/ui/flows/flowTargets.ts` + `flowTargets.test.ts` (8 tests) — the flow
  target wins while a flow selection exists, then the object, then the link.
- `web/src/ui/flows/FlowPane.test.tsx` — the list is a list again (149 flow tests
  pass): rows expose number/type/title/participants, play and duplicate; no inline
  step editor.
- `e2e/flow-panel-focus.spec.ts` (3 tests) — a step pick takes the panel, an
  empty-canvas press gives it back, and a press on a connector or an object shows
  that connector/object instead. Verified red by removing the canvas press signal
  (3 failed).
- `web/src/ui/CanvasController.test.ts` — `user press signal` (3 tests) reports a
  press on empty canvas, on an object, on a connector and with the secondary
  button, and stays optional. Verified red by removing the call (2 failed).
- `e2e/step-properties.spec.ts`, `e2e/p2-flowedit.spec.ts`,
  `e2e/ux08-flow-authoring.spec.ts`, `e2e/ux08-flow-documentation.spec.ts`,
  `e2e/p2-illustrations.spec.ts`, `e2e/flow01-canvas-flows.spec.ts`,
  `e2e/flow02-sparks.spec.ts` — moved controls, same guarantees; all pass.
- `npm run check` clean, `npx vitest run` 1662 passed, `npx playwright test`
  239 passed, curated captures re-shot with `UPDATE_GOLDENS=1` and reviewed in
  light and dark.
