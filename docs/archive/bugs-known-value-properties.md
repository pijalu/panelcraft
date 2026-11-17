# Closed item: known-value inputs and property hierarchy

**Bug entry removed:** “Known-value inputs and property hierarchy” in `bugs.md`.

## What was wrong

The icon field was two editors for one value: a free-text handle plus a separate
picker button. Other known-value fields invited transcription too — flow `goto`
file/flow and `process` target ids were plain text inputs — while names and other
genuinely open text should stay free text. Object sections were ordered
Identity → Metadata → Style → Decomposition → Advanced, and Icon lived in Style
even though it writes the object's identity-level `icon` field.

## Decisions

- One control per closed value. `IconField` is now a single combobox trigger
  (one accessible name, one value) that opens the searchable listbox. The old
  handle input and second picker button are gone. The listbox keeps built-ins,
  project icons, search, Manage project icons and no icon; an unknown stored
  handle stays visible as a disabled choice with a `(unknown)` label, so opening
  a legacy file never silently erases it.
- Keyboard: ArrowDown/ArrowUp move focus between enabled options, Escape closes
  and returns focus to the trigger, outside pointer dismisses, and the popover
  flips above the trigger when there is not enough room below. Escape is scoped
  to the popover so it does not also reach the canvas's own Escape gesture.
- One writer. `writeObjectIcon(obj, icon)` is the single icon-write command: it
  writes the object's `icon` and clears a stale `style { icon … }` override in
  the same patch. Moving the control into Identity neither duplicated nor lost
  that behaviour.
- Section order is Identity (Name, Kind, Icon), Style, Metadata, Decomposition,
  Advanced. Section ids and persisted expansion preferences are unchanged.
- Only actual closed domains become pickers: `goto` file and flow (flow options
  depend on the chosen file) and `process` target (objects in the diagram) are
  native selects. A current value outside the domain stays selected as a
  disabled option with a `role="status"` diagnostic. Message endpoints are
  read-only `<output>` values set by the existing canvas selection controls —
  they did not gain another editor. Names, descriptions, technology, tags and
  custom properties remain free text.
- No new dependency, no network call, no format change.

## Red evidence before the fix

Commands run in `web/` against the unchanged implementation:

- `npx vitest run src/ui/iconCommands.test.ts` — failed with
  `Failed to resolve import "./iconCommands"`. The shared command did not exist.
- `npx vitest run src/ui/IconPicker.test.tsx` — **7 failed, 11 passed**. The old
  control exposed a free-text `input` and a second button; there was no combobox
  role, no Escape focus-return, no keyboard option focus and no unresolved choice.
- `npx vitest run src/ui/PropertiesPanel.test.tsx` — **2 failed, 10 passed**.
  The DOM-order assertion received
  `['identity', 'metadata', 'style', 'hierarchy', 'advanced']`, and the icon
  control was inside `section-style` rather than `section-identity`.
- `npx vitest run src/ui/flows/FlowPane.test.tsx` — **6 failed, 41 passed**.
  `insp-goto-file`, `insp-goto-flow` and `insp-target` were text inputs with no
  dependent options or diagnostics; the message endpoints were editable inputs.

## Green evidence after the fix

- `npm run check` — exit 0 (`tsc --noEmit`, service-worker `tsc`, `eslint .`).
- `npm test` — **143 files, 1566 tests passed**; coverage thresholds green.
- `npm run build` — production bundle built from the changed source.
- `npm run e2e` — **214 passed** (210 existing plus 4 new
  `e2e/known-value-properties.spec.ts` scenarios), including axe scans and the
  no-network proof. One full run hit a pre-existing timing flake in
  `e2e/present-hash-anchor.spec.ts` (hash not published within 5 s); it passed in
  isolation and the following full run was green. No change made for it.
- `go build ./... && go test ./... && go vet ./... && staticcheck ./... &&
  gocyclo -over 15 cmd internal web` — `GO_GATES_OK`.
- `bash scripts/check-docs.sh` — `check-docs: OK — 9 docs, all links resolve,
  .pcd blocks valid`.

## Screenshot evidence and vision review

Captured by `e2e/known-value-properties.spec.ts` into `test-results/screenshots/`:

- `known-value-sections-light.png`, `known-value-sections-dark.png`
- `known-value-icon-listbox-light.png`, `known-value-icon-listbox-dark.png`
- `known-value-process-target-light.png`, `known-value-goto-target-light.png`
- `known-value-sections-narrow.png`

Reviewed against the `docs/STYLE-GUIDE.md` screenshot checklist: section order and
alignment, token-only light/dark differences, readable muted text, visible focus,
empty states and the narrow drawer all matched. One defect was found and fixed:
the combobox trigger initially rendered at the 28 px width of the old picker
button because `.icon-picker-trigger` won the cascade over `.icon-field-trigger`,
clipping the value label. The selector is now
`.icon-picker-trigger.icon-field-trigger` and the re-captured screenshots show
the full-width trigger with a visible value. Goto captures show the unresolved
`other.pcd (unresolved)` option and its diagnostic.
