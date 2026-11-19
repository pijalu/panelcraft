<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed item: Default flow integrity and non-destructive flow editing

The bug entry in `bugs.md` asked for every diagram to have a current Default flow,
for New flow never to erase the drawing, and for steps to reference elements with
optional per-flow customisation rather than duplicate element content.

## Reproduction and corrected diagnosis

The reported path is: blank diagram → add a person and container → connect them →
Present → New flow. A valid-PDL browser probe showed that the simple linked case did
not fail universally on the starting revision, so the report was not treated as proof
of one single cause. An early malformed probe omitted the colon before the connector
label; its parse failure was discarded as evidence.

The broader requirements and write-path defect did reproduce. Before implementation,
this command produced **12 failures and 64 passes**:

```
npx vitest run web/src/ui/flows/flowSession.test.ts web/src/ui/flows/flowDoc.test.ts \
  web/src/ui/flows/derivedFlow.test.ts web/src/ui/flows/flowCatalog.test.ts \
  web/src/engine/flows/plan.test.ts --reporter=verbose
```

The failures localised five gaps:

- the flow session ignored newer same-version canvas text, so its next whole-document
  print could omit newly drawn elements;
- element-only diagrams had no Default flow, and New flow could have zero steps;
- an authored flow suppressed Default, and editing Default left only a stale snapshot;
- derived steps copied connector labels, while process narration did not inherit object
  descriptions;
- the flow mutation boundary did not reject object or connection membership changes.

Browser testing then found additional defects that were included in the plan instead of
being waived: Default-to-Custom typing lost focus after the first character; canvas
presses could redirect assisted step creation to the wrong flow; anonymous parallel
connectors resolved to the same element; flow-focused Ctrl+Z was consumed by an empty
canvas undo stack; a fast undo could leave the flow session displaying the value that
the code buffer had already reverted; and collapsing Code removed the history commands.
Preserving the editor across panel reparenting also exposed a Mermaid-paste callback
tied to the discarded view; it now dispatches through the active `ViewUpdate.view`.

## Implemented contract

- Every non-empty parsed diagram has a virtual **Default flow**, including a diagram
  without connections and one with authored flows. Connections become message steps in
  stable topological order, with creation order as the cycle fallback. Every otherwise
  unrepresented object becomes a process step.
- Default is recomputed from current elements and is never persisted merely by opening,
  presenting, saving or reloading. Editing it creates and selects one ordinary
  **Custom flow**; Default remains beside it and live. New flow snapshots the current
  elements without replacing them.
- Message and process steps contain references, not copied element content. Connector
  labels and object descriptions are inherited in the inspector, playback and Markdown.
  Mermaid inherits connector labels and line styles; step descriptions remain declared
  Mermaid drops. Explicit step values are per-flow overrides; clearing them restores
  inheritance. Camera, ordering, grouping, dwell and advance remain flow-specific.
- Anonymous parallel links use virtual `#<index>` references only inside Default. A
  custom copy receives real connector ids. Playback, Markdown and Mermaid all resolve
  the same references, preserving distinct labels and line styles.
- One flow session is shared by Flow Steps and Properties. It retains rapid pending
  writes, rebases them on newer canvas content, and uses the code buffer while an edit
  or undo is in flight. Once sync is clean, the workspace file is authoritative so an
  older empty projection cannot erase it. `retext` rejects object/connection membership
  changes.
- Both flow surfaces render the pending parsed document, so selecting a new custom id
  cannot unmount its editor before the asynchronous write lands. Existing custom flows
  remain the initial editing target when present, and canvas-assisted actions retain the
  flow being built even though canvas selection clears the Properties selection.
- Undo/redo from Flow Steps or flow Properties routes to the existing document history
  before the canvas window handler. The collapsed Code panel keeps its editor mounted but
  hidden, and reparenting preserves its EditorState, so both commands work with Code collapsed
  and survive collapse/expand. Canvas and CodeMirror shortcut behavior is otherwise unchanged.
- PDL grammar, the IR version, corpus fixtures, storage location and network behavior
  did not change. No runtime service, remote asset or dependency was added.

## Updated fix plan and validation

1. Preserve the RED unit cases for derivation, reference inheritance, rebasing and the
   document-integrity guard. **Done.**
2. Derive Default and New flow from the same element walkthrough; materialise an
   independent custom copy only on an explicit edit. **Done.**
3. Reconcile pending flow writes with current source and reject membership loss. **Done.**
4. Resolve inherited values in editing, playback and exports; keep virtual parallel-link
   references consistent across all three. **Done.**
5. Exercise the exact blank-diagram scenario, element-only Default, Default/Custom
   coexistence, continuous typing, inheritance, undo and canvas-assisted editing in
   Chromium. Capture and review both themes. **Done.**
6. Run every quality gate separately and archive only with actual green output. **Done.**

## Green evidence

- `npm run check` — TypeScript, service-worker TypeScript and ESLint exited 0.
- `npx vitest run --reporter=dot` — **158 files, 1,739 tests passed**.
- `npm test` — coverage run exited 0: **156 files, 1,731 tests passed**; enforced core
  coverage thresholds passed. This run excludes the deliberately uninstrumented perf files.
- `npm run build` — production bundle exited 0. Vite retained its existing warning about
  chunks larger than 500 kB; no new dependency or bundle feature was introduced.
- Focused flow/session/format tests — **61 passed**. The new Mermaid parallel-link test
  first failed with two blank labels and solid arrows, then passed through the shared
  connector resolver.
- The affected nine Playwright specs — **27 passed**, covering the earlier spark,
  flow-authoring, properties, step-id and undo failures.
- `npx playwright test e2e/bugs-new-diagram-flow.spec.ts e2e/round3-browser-fixes.spec.ts
  --grep 'blank person|settled delay' --repeat-each=5` — **10 passed**, checking the two
  timing-sensitive document-preservation/undo scenarios five times each.
- `npx playwright test e2e/bugs-new-diagram-flow.spec.ts` after adding inheritance and
  custom-copy captures — **4 passed**.
- `npx playwright test --reporter=line` — **259 passed** in 1.6 minutes, including offline,
  accessibility, history, Mermaid paste and presentation scenarios. This final run covers
  the added collapsed-Code undo/redo regression and all screenshot assertions.
- The collapsed-Code regression initially failed with `delay 1500` still present after
  Ctrl+Z. After the history fix it passed, including redo after collapse/expand. A focused
  shell/docking/properties run passed **15 tests**, and the Mermaid/history focused rerun
  passed **3 tests**.
- `go vet ./...` — exited 0 with no findings.
- `staticcheck ./...` — exited 0 with no findings.
- `gocyclo -over 15 cmd internal web` — exited 0 with no functions above the CI limit.
- `go test -count=1 -race -cover ./...` — all packages passed with the race detector;
  reported coverage included `internal/ir` 84.0%, `internal/pdl` 76.2%, and
  `internal/server` 91.8%. No Go production code changed.
- `bash scripts/check-docs.sh` — OK: nine required docs, all links resolve, all PDL
  fences parse.
- `bash scripts/check-selfcontained.sh web/dist` — OK: no external-origin resource loads.
- `bash scripts/check-jargon.sh c31be75` — OK: no opaque identifier-only references added.
- `bash scripts/check-repo-clean.sh` — OK: no generated artifacts are tracked. The
  worktree-only form is reserved for after the requested commit.

## Screenshot evidence and vision review

Reviewed actual captures under `test-results/screenshots/` against the style-guide
checklist and the Mental Model and Cognitive Load lenses:

- `bugs-new-diagram-default-launcher-light.png` and `-dark.png`;
- `bugs-new-diagram-default-inherited-light.png`;
- `bugs-new-diagram-custom-copy-light.png` and `-dark.png`;
- `step-properties-light.png`, `step-properties-dark.png`, and
  `step-properties-derived.png`;
- `round3-inspector-light.png` and `round3-inspector-dark.png`.

The launcher identifies Default and its element origin. The editing hint says that an
edit creates a custom copy while Default stays current. The custom-copy captures show
both rows, the selected custom row, the inherited `buys` label, and the focused override
field. Alignment, 4 px spacing, readable contrast, selection/focus treatment and theme
parity are consistent; only owned inline assets appear. Narrow-layout, keyboard,
reduced-motion, accessibility and animation end states are covered by the green browser
scenarios. No remaining visual defect was found in the final captures.
