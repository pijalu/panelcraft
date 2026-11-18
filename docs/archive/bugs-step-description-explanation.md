# A step description edits and presents as Markdown beside the drawing

Closed. The step description was a single-line field, and presentation showed it
as plain text in the transport dock.

## Observed

- Step properties used a single-line input for Description, so a Markdown
  explanation could not be entered or edited comfortably — and, before the step
  prose block landed, could not hold a newline at all.
- In presentation mode the description appeared as plain text in the bottom dock,
  unrendered, far from the step it explains. Anything drawn over the diagram would
  also have covered that step.

## Expected

- The editor accepts and preserves multiple lines of Markdown source.
- Presentation renders that Markdown with the existing safe Markdown renderer in a
  dedicated region beside the drawing, which does not cover the step component and
  stays readable in both themes and at narrow widths.

## Cause

Two independent gaps: the field was a single-line `Field`, and the presentation
layer reused the transport dock as the only place to print step prose.

## What changed

- `StepProperties.tsx` edits the description with the shared multiline field,
  which writes through the step-prose block form from the framing fix, so one
  field owns the text and the IR keeps a single string.
- `PresentDock.tsx` renders the current step's description in `StepExplanationAside`:
  a region that reserves canvas width instead of overlaying it. It coordinates
  with the flow-notes aside (both can be visible, in separate columns), the runner
  refits the beat when either appears or disappears, and leaving presentation
  clears the region. The description is no longer printed in the dock.
- `flowController.ts` exposes one predicate (`stepExplanationVisible`) that both
  the shell class and the layer read, so space reservation and rendering cannot
  disagree.

## Evidence

- `web/src/ui/FlowNotesPanel.test.tsx` and `FramingPopover.test.tsx` assert the
  explanation is its own region, separate from flow notes and from the dock.
- `e2e/bugs-step-explanation.spec.ts` types an extra line into the description,
  checks the field grows, presents, asserts the rendered Markdown (paragraph plus
  list items, not the raw source), that the step component's screen box never
  intersects the region, that the dock no longer carries the description, the
  narrow viewport, both themes, and that exiting presentation clears it.
- `npm run check` and `npm test` (1721 passed) plus the Chromium spec pass;
  screenshots reviewed in both themes and at 720px.

## Notes

- Presenting draws the explanation beside the drawing, so the canvas keeps its
  space: the beat's framing is recomputed when the column appears, which is what
  keeps the step component fully visible instead of partly covered.
