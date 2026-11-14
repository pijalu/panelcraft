# FLOW-01: canvas-assisted flow editing

**Completed:** 2026-11-14

**Scope:** flows stay inside the `.pcd` document and are edited through an on-demand Flow
Steps panel that the canvas can drive, with no separate flow store and no invented links.

## Implemented behaviour

- Flow Steps is a normal dockable panel: it docks left/right/bottom, collapses to a rail,
  floats, closes and reopens, and it is absent from a fresh layout (there is no permanent
  Flows tab; Files is its own panel).
- Steps render as **cards**: a kind stripe/label, the label-or-target title, and an
  actor/link summary line (`shop → erp`, `2 branches`, `3 lanes`, `→ other.pcd#refund`).
  The selected card carries `aria-current` and an accent border.
- **Canvas-assisted targeting** (new `FlowCanvasContext` port):
  - message steps: **From selection**, **To selection**, **Use connector** (fills from/to
    from the selected link, never writing a pair that has no link);
  - process steps: **Target selection**;
  - adding a message step seeds it from the selected connector or the first existing link.
    When the document has no link at all the panel refuses and states
    "Add a link on the canvas first" instead of writing an invalid step.
- Selecting a card highlights its participants on the canvas by fading everything else
  (objects and connectors), and block steps clear the highlight. The port is
  `onHighlight(ids | null)`, implemented with the existing render fade layer.
- Everything else is preserved: all eight step types, nested `alt`/`par`, add/remove/
  duplicate/delay, drag and ↑/↓ reorder, play-from-step, flow selection/creation, playback,
  sequence export, dirty chip, code round-trip and validation.

## Accessibility fix found by the new spec

axe reported `select-name` for the step-kind select, and the ↑/↓/✕ buttons only had glyph
text. The inspector now exposes `aria-label` for the select and for all three buttons
(`Step type`, `Move step up`, `Move step down`, `Remove step`).

## Executed plan and debugging record

1. **Port + cards:** added `FlowCanvasContext`, `onHighlight`, `participantsOf`, card
   summaries and the targeting buttons; wired `App` (selection + selected link → context,
   fade layer → highlight). The new `flowsSlot` helper kept `AppBody` under the 120-line
   gate.
2. **No invented links:** `addKindStep` now seeds `msg` from `canvas.link ?? doc.links[0]`
   and refuses when there is none, with the hint `<p data-testid="flow-needs-link">`.
3. **RED (unit):** the first run failed because the test harness mounted `FlowPane` without
   the new `canvas` prop (targeting buttons stayed disabled) and because an empty
   participant list called `onHighlight([])` instead of clearing. Fixed the harness and made
   the empty case pass `null`.
4. **Test isolation:** the no-link case initially mounted a second `FlowPane` inside the same
   test, so `getByTestId('step-add-kind')` matched twice; it became its own test.
5. **RED (E2E):** four iterations, all test-side or real fixes — the code panel had to be
   collapsed before canvas clicks (and `.cm-content` assertions moved to card assertions);
   the alt inspector only exists after selecting the new card; the play transport test ids
   are `playbar`/`pb-progress`/`pb-exit`; and reopening the panel after a reload had to go
   through the shared `openWorkspacePanels` helper to stay idempotent.
6. **Visual review fixes:** the card's first button was clipped because sibling step buttons
   inherited the legacy `.flow-step button { width: 100% }` rule — scoped to
   `.flow-step > .flow-step-btn`/`-delay` so controls sit on one line; an unlabelled message
   no longer repeats `shop → erp` as both title and summary.

## Focused and common validation

- `npx vitest run web/src/ui/flows/FlowPane.test.tsx` — **20 tests passed**.
- `npx playwright test e2e/flow01-canvas-flows.spec.ts` — **2 tests passed** (light, dark).
- `npm test`, `npm run check`, `npm run build`, `npx playwright test` — passed (full suites).
- `go test ./...`, `go vet ./...`, `staticcheck ./...`, complexity gates — passed.
- `bash scripts/check-docs.sh`, `check-selfcontained.sh web/dist`, `git diff --check` — passed.

## Accessibility and visual review

- axe WCAG 2.1 A/AA is clean in both themes with cards, inspector and the floating panel
  open; the failing `select-name` finding is fixed rather than muted.
- Reviewed `test-results/screenshots/flow01-{panel-opened,card-highlight,nested,floating,
  after-reload}-{light,dark}` (10 captures).
- Both themes: cards keep a readable kind stripe, the summary line stays legible at panel
  width, the accent border plus `aria-current` marks selection, the canvas fade is visible
  without hiding the highlighted participants, and the floating panel keeps the same layout.
- The faded sets are asserted: object `user` and link `L1` for a `shop → erp` card, none for
  a block card.

## Deliberate limitations

- Canvas targeting uses the current selection, so picking a lone object requires selecting it
  first (keyboard `Tab` + `Enter` works). Drag-to-target was not added.
- Highlight uses the existing fade layer, which transitions opacity; the computed value right
  after a click is still mid-transition by design.
