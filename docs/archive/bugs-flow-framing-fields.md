# Framing prose reaches its field, and presents as rendered Markdown

Closed. Introduction and conclusion had no editor action of their own, and during
a presentation their prose was plain narration with no rendered explanation.

## Observed

- The introduction and conclusion rows in Flow Steps had play and duplicate
  actions only. Reaching their prose meant guessing that the flow itself — not
  the row — had to be selected in Properties.
- The prose could not hold a line break at all: a PDL quoted string escapes only
  `\` and `"`, so Markdown could not be authored.
- Presenting a flow showed the framing text as plain narration in the transport
  dock. There was no rendered explanation and no way to read it as one.

## Expected

- Each framing row has a dedicated action that opens the flow and focuses the
  matching field, with the intro/outro text distinct from flow notes and from the
  ordinary step description.
- Presenting shows that text in a non-modal popover rendered by the existing safe
  Markdown renderer, which does not cover the intro or outro component and is
  dismissible by keyboard and pointer.

## Cause

Three separate gaps: the step rows only offered play/duplicate, the step-prose
grammar had no multiline form, and the player carried no framing fact of its own —
the presentation layer could only narrate the beat title as text.

## What changed

- **Format (both language sides).** Step prose gained the block form the flow
  notes already use: `intro { text "…" … }`, the same for `info`, `conclusion`, a
  `process` note, and `presentation { description { … } }`. The IR keeps the
  joined string in the field that already owned the prose, so no field was added
  and old documents round-trip byte for byte; printing takes the block form only
  when the text holds a newline. An empty block is the new syntax error `E120`.
  Landed together: `web/src/engine/format/{parser,printer,diagnostics}.ts`,
  `internal/pdl/{parser,printer,diagnostics}.go`, format documentation, the
  `flow-step-text` corpus case, and the TS⇄Go parity fixture.
- **Row action.** `web/src/ui/flows/FlowPane.tsx` renders a per-row button for
  framing steps; `useFlowEditing.ts` owns the request (flow selection plus a
  counter so a repeated click refocuses), and `FlowProperties.tsx` moves focus and
  puts the caret at the end of the matching field.
- **Presentation.** `flowController.ts` publishes the current beat's framing prose
  as its own fact; `PresentDock.tsx` renders it in the `FramingPopover`: no
  backdrop, no focus trap, no dialog role, placed above the transport dock and
  clamped to the viewport, dismissed by Escape, the close button or a pointer
  press elsewhere, reopened from the dock, and shown once per framing beat. The
  popover claims Escape only while it is open, so the presentation's documented
  exit shortcut is unchanged.

## Evidence

- Format: `web/src/engine/format/stepText.test.ts` (parse, canonical print, blank
  lines, escaped quotes, delay after the block, `E120`, unknown line), corpus
  regeneration, and `go test ./...` replaying the same fixtures.
- Component: `FlowPane.test.tsx` (a button on both framing rows, focus hand-off
  for each kind, refocus on a repeated request, plain selection still opens the
  step inspector, no button without a handler) and `FramingPopover.test.tsx`
  (Markdown rendering, all three dismissal paths, Escape not reaching the exit
  shortcut, reopen, per-beat reset, separation from flow notes).
- Browser: `e2e/bugs-framing-row-editor.spec.ts` clicks both rows, types into the
  focused field, and checks plain row selection; `e2e/bugs-framing-explanation.spec.ts`
  checks rendered Markdown, placement against the narration card, both framing
  beats, both themes and a narrow viewport.
- `npm run check`, `npm test` (1721 passed), `go test ./...` and the Chromium
  specs pass.

## Notes

- The transport dock still narrates the framing beat as plain text for the
  live region. The rendered explanation is the popover; the dock line is the
  screen-reader status and deliberately not a second rendering.
