<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queue bug: topological flow editing

Source: `bugs.md`, queued item 2.

## Reproduction and existing behavior

The Flow Steps editor already supports sibling drag/drop, keyboard reordering,
flow purposes, and per-step descriptions. `addFlow` nevertheless creates an
empty flow, so ordering starts from manual message creation rather than the
connections already in the diagram. Removing a message hides it from that flow,
but there is no hidden-connection inventory or direct restore action.

## Implementation plan

1. Add a stable topological link ordering: entity ranks use creation order for
   ties and cyclic leftovers; links use source rank then link creation index.
2. Materialize those links as message steps when creating a flow. Assign missing
   link IDs deterministically so parallel connections remain distinguishable.
3. Derive hidden connections from links not referenced by any message in the
   selected flow. Hide removes only the message; Show appends a reference to the
   original link. Keep manual order authoritative after creation.
4. Expose Hide and Show controls while retaining existing annotations, details,
   drag/drop, and keyboard ordering.
5. Run focused and full checks, update the browser flow-authoring scenarios,
   capture light/dark screenshots, review them, and record evidence here.

No IR or file-format change is needed: the existing message list is the flow's
ordering, annotation, and visibility projection of `Doc.links`.

## Test evidence

### Red

`npx vitest run web/src/ui/flows/flowDoc.test.ts web/src/ui/flows/FlowPane.test.tsx --coverage.enabled=false`
failed six tests before implementation: the ordering helpers did not exist,
new flows stayed empty, and the Hide/Show test IDs were absent. A fixture-only
failure was corrected and the focused model suite rerun; four tests still
failed for the intended missing behavior.

### Green

- Focused model/panel run: **60/60 passed**.
- `npm run check`: TypeScript and ESLint passed.
- `npm test`: **1,313/1,313 passed**, coverage thresholds passed.
- Flow-related Playwright specs: **20/20 passed**, including real pointer
  drag/drop, keyboard-accessible controls, accessibility scans, and light/dark
  authoring. The browser run confirmed that Hide leaves one canvas connector
  and Show restores its message card.
- `npm run build`: passed.
- `bash scripts/check-docs.sh`: passed.
- `bash scripts/check-jargon.sh 1268a2b78c0eb692a0770ba0cc6793f3cf2f6cf1`:
  passed.
- `go vet ./...`: passed.
- `staticcheck ./...`: passed.
- `go test -count=1 -race -cover ./...`: passed.

`gocognit -over 15 .` and `gocyclo -over 12 .` report only the previously
recorded warnings in untouched Go parser/printer/CLI tests and
`node_modules/flatted`. No Go file changed in this fix.

During browser verification, two older scenarios assumed a newly created flow
was empty. They were adapted to the intentional new contract: one hides the
automatic cards before testing explicit Add message, and the presentation
fixture uses the automatic single message. Consecutive Hide edits also need
the suite's existing parse/apply settlement helper, matching every other
whole-document edit in those scenarios. All assertions of canvas-assisted
targeting, ordering, playback, and export remain in place.

## Screenshot review

Reviewed `ux08-flow-authoring-hidden-{light,dark}.png` and
`ux08-flow-authoring-simple-{light,dark}.png` under `test-results/screenshots/`.
The hidden inventory is readable and aligned, Show stays visible at the default
panel width, controls retain their hit areas, and the canvas connector remains
visible in both themes. No clipping, contrast, spacing, or empty-state defect
was found.

## Scope and residual risk

No parser, printer, corpus fixture, storage format, dependency, or runtime
network behavior changed. Cyclic graphs cannot have a strict topological
ordering; their remaining entities deliberately retain creation order before
links are sorted. Manual order is never recomputed after flow creation.
