# Bug and feature tracking

## Guideline
1. Create a detailed fix plan for each bug - the plan must contain test approach and validation steps - execute the plan and validate the fix when all elements are in place.
2. Any issues found must be fixed and the fix plan must be updated accordingly.
3. Issues found during testing must be fixed and the fix plan must be updated accordingly.
4. Each bug should be moved to docs/archive when tested and closed as the associated plan.
5. Use interactive shell/filmstrip to validate the output of the tool - you must verify the actual terminal output.
6. Check code quality with each tool run separately (do not chain them with `;` or `&&`):
- `go vet ./...`
- `staticcheck ./...`
- `gocyclo -over 15 cmd internal web` (CI fails >15; target is ≤10. Scoped paths
  are required: `node_modules` ships Go code that would fail a bare `.` scan)
- `go test -count=1 -race -cover ./...`
- Fix any issues.
 ! For cognitive and cyclomatic complexity, Pre-existing warnings are acceptable only if they are unrelated to the change and explicitly noted !

 At the end of the session - the bug list should be empty, change committed and this file should only contain the guidelines for bug reporting.
 If new items are added, restart the process.

 Use goals to execute the fix plan - focus on micro tasks goals with new contextto lower context usage - use todos for micro tasks that should share context

 Commit at the end of each fix with a clear and descriptive commit message

## Report format
Describe the bug or feature request under `# To fix` below. Keep one section
per item with a short title, the observed behavior, and the expected behavior.

# To fix

## Review items

### Creating a blank diagram must be possible

Observed:

- A new file opens on the template gallery, and every offered card inserts a populated diagram.
- There is no direct way to create a valid empty diagram and start placing shapes or writing code from nothing.

Expected:

- New file creation offers a blank option beside the templates.
- Choosing blank creates a valid empty document with no shapes, connectors, or flows, opens it as the active tab, and leaves the canvas ready for keyboard placement or code editing.
- The blank choice is keyboard accessible and does not leave the template gallery covering the empty canvas.

Fix plan and test approach:

1. Reproduce in the browser: create a new file and confirm the template gallery has no blank choice.
2. Add a failing component test for the blank choice and a browser regression that creates a blank file, keeps it active, and leaves the canvas empty.
3. Add the blank action using the same file-creation path as the templates. Seed only the file header needed for a valid document and do not insert sample shapes or flows.
4. Cover the empty-state transition so the gallery closes and keyboard placement still works on the blank canvas.

Validation:

- Run the affected unit tests and the browser regression.
- Verify the created file parses, prints as a valid empty document, and contains no template content in the code view.
- Review light and dark screenshots of the gallery with the blank choice and of the opened blank canvas.

### Step description needs a multiline editor and a non-overlapping presentation explanation

Observed:

- Step properties uses a single-line input for Description, so a Markdown explanation cannot be entered or edited comfortably.
- In presentation mode the step description is shown as plain text in the bottom dock. It is not rendered as Markdown and is not placed beside the drawing as the explanation for the current step.
- Showing explanation text over the drawing can cover the step component being explained.

Expected:

- Description in Step properties is a textarea that accepts and preserves multiple lines of Markdown source.
- Presentation mode renders that Markdown, using the existing safe Markdown renderer, in a dedicated region beside the drawing.
- The explanation region sits outside the diagram content and does not cover the current step component. It stays readable in light and dark themes and at narrow viewport widths.

Fix plan and test approach:

1. Reproduce in the browser: enter a multiline Markdown description on a message step, start the presentation, and capture the current layout in light and dark themes.
2. Add a failing component test for the textarea and a failing presentation-layer test that renders Markdown from the current step description without using the flow-notes field.
3. Add a browser regression that checks the explanation is visible, rendered, and does not intersect the current step's rendered bounds.
4. The step description literal cannot carry newlines: PDL quoted strings escape only `\` and `"` (FILE-FORMAT §1), so step text gains the same block form the flow notes block already uses. Land the parser, printer, intermediate representation, format documentation, corpus regeneration, and both language implementations together.

Validation:

- Run the affected unit tests and the browser regression.
- Review fresh screenshots against the style checklist, including a narrow viewport, keyboard use, reduced motion, and both themes.
- Confirm the present-mode capture still shows the interface that ships, re-shooting curated captures if the shell moves.

### Flow properties text fields need one editor layout, intro/outro presentation, and direct row access

Observed:

- Flow properties already has multiline fields for purpose, notes, introduction, and conclusion, but the fields use fixed heights and an uneven layout. Flow name is a single-line input, yet its width and spacing do not line up with the text areas below it.
- The tall fields do not grow with the amount of expected or entered text, so short prose and long Markdown occupy the same height.
- Introduction and conclusion prose is shown only as plain narration during presentation. There is no safe-Markdown popover for either framing step.
- The introduction and conclusion rows in the flow-step list have no dedicated action that selects the framing step and opens its field in Properties.

Expected:

- Flow name, purpose, notes, introduction, and conclusion share one full-width layout: a clear title above the input, hints in the same place, consistent widths, label spacing, and vertical rhythm.
- Multiline fields start at a height suited to their expected content and grow as text is entered or restored from the file. Short purpose text, long notes, and intro or conclusion prose all stay readable without one field looking oversized or cramped.
- An introduction or conclusion can hold multiline Markdown from one owned field. Presenting the flow shows that text in a non-modal popover rendered by the existing safe Markdown renderer. The popover does not cover the intro or outro component and is dismissible by keyboard and pointer.
- Each intro or outro flow-step row has a dedicated button that opens or focuses its field in Properties. The intro/outro text stays distinct from flow-level notes and from the ordinary step description; one field owns the text that is edited and shown.

Fix plan and test approach:

1. Reproduce in the browser with empty, short, and long values in purpose, notes, introduction, and conclusion. Capture the panel in light and dark themes, present the flow, and confirm the flow-step rows have no editor action.
2. The framing step's quoted text is the single source for its Markdown, but it cannot hold newlines: PDL quoted strings escape only `\` and `"` (FILE-FORMAT §1). Add a block form for step text modelled on the flow notes block, not a second parallel field, and land the format change atomically on both language sides.
3. Define one sizing rule for the shared field components, with a stable minimum height and growth for long values. Add a failing component test for full-width layout and growth that also covers local drafts and undo.
4. Add failing component tests for the new flow-step row button and the presentation Markdown popover, including keyboard dismissal and separation from flow notes.
5. Add a browser regression that opens the editor from both framing rows, presents the flow, and verifies the popover content and that it does not intersect the intro or outro component. Review every Flow properties control together so no control keeps a different width or label alignment.

Validation:

- Run the affected unit tests, component tests, and browser regression.
- Review fresh screenshots with empty, short, and long values in both themes and at a narrow viewport; check focus order, keyboard dismissal, reduced motion, and that no network request is added.
- Re-shoot curated present-mode captures if the popover, flow-step row, or Flow properties chrome changes.

### Spark must follow the connection route

Observed:

- Spark motion is built from keyframes placed only at the two connector endpoints. On a bent or curved connection, the spark interpolates straight between those points instead of travelling along the drawn connector, so it leaves the connection.

Expected:

- Every spark stays on the rendered connector path for the whole travel leg, including curved and reversed routes.
- Spark timing, direction, repeated passes, and arrival state remain unchanged apart from following the route geometry.

Fix plan and test approach:

1. Reproduce in the browser with a curved connector and a step that uses it; capture the spark at mid-travel.
2. Add a failing animator test with a fake path geometry whose midpoint is off the straight line between the endpoints. Assert that generated spark keyframes include points sampled along the path.
3. Change spark keyframe generation to sample the connector at intermediate distances while keeping the existing shared timing timeline and endpoint selection.
4. Cover forward and reversed travel so the sampled points are emitted in the correct order.

Validation:

- Run the animator unit tests, the connection-animation browser tests, and the flow presentation tests.
- Inspect a filmstrip or capture at several points in the travel and confirm each spark sits on the drawn connector.
- Check reduced motion still settles the token at the route endpoint with no animated movement.

## Detailed fix plan

Work in this order. The shared editor layout comes before the two description requests because both need the same field behaviour. The presentation explanation component comes before the step and intro/outro presentation surfaces because both need the same safe Markdown and non-overlap rules. The spark fix is independent and can be done in parallel.

Shared rules for every phase:

- Reproduce the current behaviour in the browser first and keep a capture with the failing case.
- Each item appears twice: once under `# To fix` as a summary, once as a phase here. When a fix refines or corrects one half, update both halves in the same change so they cannot drift; the phase text is authoritative for execution order.
- Write the failing unit or component test before changing implementation code.
- One field owns each piece of prose. Do not add a second description field beside an existing field unless the format check proves the old field cannot hold the required text.
- If a file-format change is needed, land the TypeScript parser and printer, Go parser and printer, intermediate representation, validation, format documentation, corpus regeneration, and parity fixtures in the same change.
- UI work needs keyboard, reduced-motion, narrow-viewport, light/dark, focus, and no-network verification. Any new source file starts with the GPL-3.0 SPDX header.

### Phase 1 — Blank diagram creation

Current code anchors: `web/src/ui/EmptyState.tsx`, `web/src/ui/App.tsx`, `web/src/ui/uxLaws.test.tsx`.

1. Reproduce: create a new file and confirm the overlay offers only C4 context, Flow, and From mermaid.
2. Add failing tests:
   - `uxLaws.test.tsx` checks a blank choice in the gallery and that it does not insert template content.
   - An application test checks that choosing blank keeps the new file active, leaves no objects or flows, and closes the gallery.
   - A browser test covers creating a blank file and then placing a shape with the keyboard.
3. In `EmptyState.tsx`, add a blank action as the first gallery card. Give it its own callback instead of treating it as a template, because blank means "insert nothing" rather than "insert sample text".
4. In `App.tsx`, wire the callback to the existing new-file buffer. Do not create a second untitled file. Mark the empty document as authored so the overlay gate does not immediately reopen.
5. Change the overlay condition from "no objects in the snapshot" alone to "no authored content in this new file". A parsed file with only `pcd 1.0` is blank but authored; a fresh file with no text is not.
6. Acceptance: the blank choice is first in the keyboard order, the code view shows a valid empty document, the canvas has no objects, and keyboard placement still works.

Validation:

- Run the new unit and application tests, then a browser test for the blank path.
- Confirm the file parses and prints as a valid empty document with no sample shapes, connectors, or flows.
- Capture light and dark gallery screenshots and the opened blank canvas.

### Phase 2 — Shared editor layout and auto-growing height

Current code anchors: `web/src/ui/flows/fields.tsx`, `web/src/ui/app.css`, `web/src/ui/flows/FlowProperties.tsx`, `web/src/ui/flows/StepProperties.tsx`.

1. Reproduce: open Flow properties with empty, short, and long prose in purpose, notes, introduction, and conclusion. Capture the uneven panel in both themes.
2. Add a stacked variant to the shared `Field` and `TextArea` components: label on its own line, hint below the label or input in one consistent place, and a full-width input beneath the label. Keep the existing inline variant for compact inspector rows.
3. Implement auto-growth in `TextArea`:
   - Keep the local draft as the source while typing.
   - On draft change, reset height, measure `scrollHeight`, and set height between a minimum for the field's purpose and a safe maximum with scrolling.
   - Preserve focus and caret position; do not write an extra document edit from the resize.
   - Recalculate when the field becomes visible and when the panel width changes.
4. In `app.css`, give the stacked variant one width, label spacing, input padding, minimum height, and vertical rhythm. Cover checkbox, select, single-line input, and textarea states so no control keeps a different alignment.
5. Opt Flow properties and the step Description field into the stacked variant. Do not change unrelated compact selectors or object properties in this phase.
6. Add component tests for empty, short, and long values, full-width layout, growth after typing, restoration from the document, undo, and local drafts.
7. Acceptance: purpose, notes, introduction, conclusion, Flow name, and step Description all line up; long text grows the field instead of inserting a scroll bar at two lines.

Validation:

- Run the field component tests and Flow properties tests.
- Review screenshots with empty, short, and long values in both themes and at a narrow viewport.
- Check focus rings, keyboard typing, draft behaviour, reduced motion, and that resize does not create an undo step.

### Phase 3 — Flow properties: intro/outro presentation and direct row access

Current code anchors: `web/src/ui/flows/FlowProperties.tsx`, `web/src/ui/flows/flowDoc.ts`, `web/src/ui/flows/FlowPane.tsx`, `web/src/ui/flows/flowTypes.ts`, `web/src/ui/flows/flowEdit.ts`, `web/src/engine/flows/plan.ts`, `web/src/ui/flows/flowController.ts`, `web/src/ui/PresentDock.tsx`, `web/src/ui/app.css`. The step-text block form also touches `web/src/engine/format/parser.ts`, `web/src/engine/format/printer.ts`, `web/src/engine/model/types.ts`, `internal/pdl`, `internal/ir`, and `docs/FILE-FORMAT.md`.

1. Reproduce: add multiline Markdown to introduction and conclusion, present the flow, and confirm the dock shows plain narration with no popover. Confirm the framing rows have no editor action.
2. The source of truth is settled: the framing step's quoted text owns the Markdown prose, and PDL quoted strings escape only `\` and `"` (FILE-FORMAT §1), so they cannot hold newlines. Add a block form for step text modelled on the flow notes block, not a second parallel field. Land the format change atomically on both language sides.
3. Add a dedicated button to intro and conclusion flow-step rows. It must open the Flow properties panel and move focus to the matching Introduction or Conclusion field. Plain row selection must keep switching to Step properties unchanged.
4. Extend the beat and player state with the framing explanation needed for presentation. Keep it separate from flow notes and from the ordinary step description so each surface has one owner.
5. Add one presentation explanation component using `parseSafeMarkdown` and `SafeMarkdown`. Render intro/outro prose in a non-modal popover:
   - No backdrop and no focus trap.
   - Close button, Escape key, and pointer-outside dismissal.
   - Position from the framing component's rendered rect, clamped to the viewport, so the popover does not cover that component.
   - Reopen action on the presentation UI after dismissal.
   - Reduced motion disables transitions.
6. Add failing component tests for the row button, focus target, Markdown rendering, dismissal, and separation from flow notes. Add a browser regression that opens both framing editors from their rows, presents the flow, and checks popover placement against the intro and outro component bounds.
7. Acceptance: the row button reaches the right field, the saved Markdown renders in the popover, the popover never covers the framing component, and flow notes remain a separate presentation surface.

Validation:

- Run the new component tests and the flow presentation browser tests.
- Review light and dark screenshots, narrow viewport, keyboard-only open and dismiss, reduced motion, and no-network run.
- Re-shoot curated present-mode captures if the popover or flow-step row chrome changes.

### Phase 4 — Step description explanation beside the drawing

Current code anchors: `web/src/ui/flows/StepProperties.tsx`, `web/src/engine/flows/plan.ts`, `web/src/ui/flows/flowController.ts`, `web/src/ui/PresentDock.tsx`, `web/src/ui/app.css`.

1. Reproduce: enter a multiline Markdown description on a message step, present the flow, and capture the plain text in the bottom dock.
2. Use the Phase 2 stacked editor for the step Description field. The step description literal cannot carry newlines: PDL quoted strings escape only `\` and `"` (FILE-FORMAT §1). Use the block form landed in Phase 3 for step text so the multiline Markdown has one owner.
3. Reuse the Phase 3 presentation explanation component for step descriptions. Render the current step's Markdown source in a dedicated region beside the drawing, not in the transport dock.
4. Reserve canvas space for the region instead of overlaying the drawing. Coordinate it with the flow-notes aside so both can be visible without occupying the same place. When visibility changes, trigger the existing presentation refit.
5. Add failing tests for Markdown rendering, no overlap with the step component, separation from flow notes, and clearing the explanation on exit. Add a browser regression that checks rendered Markdown and does not use the transport dock as the explanation surface.
6. Acceptance: the editor accepts multiline Markdown, the presentation explanation renders beside the drawing, and the step component remains visible.

Validation:

- Run the step-properties tests, presentation tests, and browser regression.
- Review light and dark screenshots with short and long descriptions, narrow viewport, keyboard use, reduced motion, and no network.
- Re-shoot curated present-mode captures if the explanation region changes the shell.

### Phase 5 — Spark follows the connection route

Current code anchors: `web/src/engine/anim/engine.ts`, `web/src/engine/anim/engine.test.ts`, `web/src/engine/anim/sparks.test.ts`, `e2e/bug15-spark-beat-timeline.spec.ts`.

1. Reproduce with a curved connector and capture the spark at mid-travel off the drawn line.
2. Add a failing animator test with fake path geometry whose midpoint is off the straight line. Assert that spark keyframes include intermediate points sampled from the path.
3. Extract the keyframe construction into a pure helper that receives path length, sampled points, and the shared timing. Keep DOM geometry behind the existing port so the helper is testable without a browser.
4. Change `sparkGlyph` to sample the connector between the resolved start and end distances at small fixed intervals. Emit keyframes in path order for forward travel and reverse order for reversed travel. Keep source pulse, arrival, gap, and final rest timings unchanged.
5. Use a sample count based on path length with a safe cap. Too few samples cut the curve; too many create large keyframe arrays. Add a test for a short path, a long path, and bidirectional travel.
6. Acceptance: at every sampled time the spark transform matches a point on the connector path, including curved and reversed routes.

Validation:

- Run the animator unit tests and the connection-animation browser tests.
- Inspect a filmstrip at several points in travel and confirm each spark sits on the drawn connector.
- Check reduced motion still settles the token at the route endpoint with no animated movement.

### Phase 6 — Full verification and closure

After each phase lands, run its targeted tests. After the whole set lands, run the full gates in this order:

1. `npm run check` for TypeScript and lint.
2. `npm test` for unit tests with coverage thresholds.
3. `npm run build` so the browser tests use the current bundle.
4. `npx playwright test` plus the no-network scenario.
5. `go test ./...` when the file format or Go-side behaviour changed; also run the Go static analysis and complexity tools and check TypeScript and Go corpus parity.
6. `bash scripts/check-docs.sh` and `bash scripts/check-repo-clean.sh --worktree`.
7. Review fresh light and dark screenshots against the style guide. File or fix defects before closure. Refresh curated goldens only with `UPDATE_GOLDENS=1` and commit that diff with the change that moved the interface.

Closure evidence must name the commands run and their results. No item moves to the archive until the failing case is reproduced, the regression test was seen failing before the fix, the real checks pass, and the screenshots were reviewed.

## Cross-cutting design constraints

- Reproduce first and write the behavioural regression before the fix. Source inspection identifies likely causes; it does not prove a reported browser defect.
- Keep domain rules out of components. UI components render state and call narrow application ports; pure engine/workspace services own geometry, graph traversal, format rules and validation. Do not make an engine package import UI strings or browser globals.
- Maintain one source of truth per state and one document writer. Do not add parallel visibility flags, fake workspace files, duplicated option lists or per-menu enablement rules. Prefer a discriminated state/result type over several booleans or optional fields that permit invalid combinations.
- Keep changes small and cohesive. Extract a module only when it gives a rule one owner; do not build a general framework or mix opportunistic cleanup into a bug fix. Preserve existing ports where possible and remove an API only after tracing its callers.
- A format change is atomic: TypeScript and Go parser/printer/IR/validation, format documentation, corpus regeneration and parity fixtures land together. UI work also needs keyboard, reduced-motion, narrow-viewport, light/dark and no-network verification as applicable.

## Previously closed

Closed items from the last round stay in [docs/archive/](docs/archive/). The coordinated plan that drove them stays in [docs/BUGS-RESOLUTION-PLAN.md](docs/BUGS-RESOLUTION-PLAN.md) as the record of how each one was triaged and gated.

Closed items, in the order they were archived:

- `bugs-present-hash-anchor.md` — a presentation link resolves in the reader's own workspace.
- `bugs-menu-viewport-contract.md` — one viewport-safe contract for every menu.
- `bugs-long-filenames-file-actions.md` — a long name never hides file actions.
- `bugs-presentation-playback.md` — presentation framing, sparks and transport.
- `bugs-default-virtual-flow.md` — a link-only diagram is presentable at once.
- `bugs-hosted-release-verification.md` — the live site proves its own revision.
- `bugs-visible-default-grid.md` — a fresh profile shows the dots grid.
- `bugs-route-validation.md` — routes are validated as a whole polyline.
- `bugs-entity-label-centering.md` — labels sit on their rendered centre.
- `bugs-project-icon-registry.md` — 43 built-ins plus portable project icons.
- `bugs-c4-drill-down.md` — genuine C4 decomposition with embedded source.
- `bugs-step-properties.md` — selected message steps edit their resolved link's shared animation.
- `bugs-hamburger-task-groups.md` — the menu is grouped by user task without losing a command.
- `bugs-browser-assessment-round-3.md` — step properties are visible on selection, spark count is a spaced maximum, beats can cycle until a click, and delay edits no longer stall the UI.
- `bugs-critical-assessment-round-2.md` — the assessment of this whole round: the presentation filmstrip e2e no longer depends on machine load, and a settled delay edit writes once.
- `bugs-curve-arrow-endpoint.md` — a curved connector's arrowhead always points into the entity it ends on.
- `bugs-tab-close-outside.md` — a tab's close cross sits inside the tab's own outline.
- `bugs-stale-review-captures.md` — the curated review captures show the interface that actually ships, and a shell change re-shoots them.
- `bugs-flow-panel-model.md` — Flow Steps lists the flow; the Properties panel edits the selected step, and the two selections exclude each other.
- `bugs-late-canvas-load.md` — a canvas load that finishes after the user starts typing no longer replaces the typed document, and the code view opens only once the file is in the buffer.
