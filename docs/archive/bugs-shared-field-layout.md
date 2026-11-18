# The flow prose fields share one layout and grow with their text

Closed. Flow name, purpose, notes, introduction and conclusion each had their own
measure and a fixed height.

## Observed

- Purpose, notes, introduction and conclusion were multiline fields with fixed
  heights, and they did not line up: the name was a compact row with the label
  beside a short input, while the text areas were full width.
- Short prose and long Markdown occupied the same two lines, so a short purpose
  looked oversized and a long notes block was cramped behind a scrollbar.

## Expected

- Flow name, purpose, notes, introduction and conclusion share one full-width
  layout: title above the input, hints in the same place, consistent widths,
  label spacing and vertical rhythm.
- Multiline fields start at a height suited to their content and grow as text is
  entered or restored from the file.

## Cause

The shared `Field`/`TextArea` widgets had a single inline layout (label beside
the control) and a fixed `rows={2}` with no measurement, and each surface styled
its own controls. Prose fields therefore inherited the compact inspector row.

## What changed

- `web/src/ui/flows/fields.tsx` gained a `stacked` variant (label, one hint line,
  full-width control beside the shared `inline` row) and one sizing rule for
  every multiline field: `autoGrowSize` clamps the measured content between
  `TEXTAREA_MIN_PX` and `TEXTAREA_MAX_PX`, and `applyAutoGrow` resets, measures
  and sets the height. The measurement re-runs on value change and on width
  change (ResizeObserver), never writes a document edit, and keeps the local
  draft as the source while typing.
- `web/src/ui/app.css` gives the stacked variant one width, label spacing, input
  padding, minimum height and focus ring for input, select and textarea, so no
  control in the panel keeps a different alignment. The illustration chooser lost
  its private 120px cap.
- `FlowProperties.tsx` opts name, purpose, notes and both framing fields in;
  `StepProperties.tsx` opts the step's text and description in.

## Evidence

- `web/src/ui/flows/fields.test.tsx` covers the sizing rule (minimum, growth,
  cap, NaN), growth while typing and shrinking after clearing, values restored
  from the document, the local draft, and that resizing calls no write.
- `FlowPane.test.tsx` asserts every prose field in the flow panel and the step
  description render in the stacked layout, and that notes grow when typed.
- `e2e/bugs-shared-field-layout.spec.ts` compares rendered control widths, left
  edges, hint positions and heights for empty, short, long and narrow states in
  both themes, and captures them for review.
- `npm run check`, `npm test`, and the Chromium spec pass.

## Notes

- At a 720px viewport the canvas minimap overlaps the Shapes panel. That is
  independent of this change (no shell or canvas width changed here) and is
  untouched; it is recorded so it is not mistaken for a regression.
