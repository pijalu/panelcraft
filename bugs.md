# Bug and feature Tracking

## Guideline
1. Create a detailed fix plan for each bug - the plan must contain test approach and validation steps - execute the plan and validate the fix when all elements are in place.
2. Any issues found must be fixed and the fix plan must be updated accordingly.
3. Issues found during testing must be fixed and the fix plan must be updated accordingly.
4. Each bug should be moved to docs/archive when tested and closed as the associated plan.
5. Use interactive shell/filmstrip to validate the output of the tool - you must verify the actual terminal output.
6. Check code quality with each tool run separately (do not chain them with `;` or `&&`):
- `go vet ./...`
- `staticcheck ./...`
- `gocognit -over 15 .`
- `gocyclo -over 12 .`
- `go test -count=1 -race -cover ./...`
Fix any issues.
! For cognitive and cyclomatic complexity, Pre-existing warnings are acceptable only if they are unrelated to the change and explicitly noted !

At the end of the session - the bug list should be empty, change committed and this file should only contain the guidelines for bug reporting.
If new items are added, restart the process.

Use goals to execute the fix plan - focus on micro tasks goals with new contextto lower context usage - use todos for micro tasks that should share context

Commit at the end of each fix with a clear and descriptive commit message

## Report format
Describe the bug or feature request under `# To fix` below. Keep one section
per item with a short title, the observed behavior, and the expected behavior.

# To fix

## Planning status and common requirements

The items below are clarified work items, not completed work. Current-state notes come
from code inspection, the Laws of UX website, existing curated screenshots, and a live
Vite/browser review. No full test suite was run during this intake review.

“Interactive shell/filmstrip” means: run the real terminal commands, inspect their actual
output, and inspect Playwright screenshot sequences at meaningful interaction states in
both light and dark themes. Do not treat a screenshot capture as a substitute for reading
terminal results, or a passing test as a substitute for visual review.

### Existing capabilities to preserve

- Application chrome already follows `prefers-color-scheme`; the PDL document has a
  separate render theme.
- Links already support orthogonal, straight, and curved routes; solid, dashed, and dotted
  textures; configurable width; independent head/tail markers; and explicit waypoints.
- The canvas already has an 8 px grid, grid snapping, move-alignment guides, and an
  **Equal size** command.
- Flows are already stored inside their diagram's `.pcd` document. No storage-model change
  is needed to make flows part of a diagram.
- The flow editor already supports all eight step types, ordering, duplication, delays,
  nested `alt`/`par`, playback, and sequence export. The work below changes its interaction
  and presentation, not those semantics.
- Current flow playback draws one token traveling once per message step; `flip` reverses
  the initial direction. Reduced-motion behavior must remain intact.
- Current routing attempts to avoid objects, but not other connectors. Explicit waypoints
  bypass object avoidance.
- Objects currently render in document order. Links occupy a separate layer below objects.

### Format and persistence rules

- Connector endpoint anchors, per-connector overlap permission, object z overrides, and
  connector spark speed/count are document data. Each requires an atomic format change:
  IR version as applicable, TS IR, parser, printer, serializers, Go IR/parser/printer,
  `docs/FILE-FORMAT.md`, shared corpus fixtures, TS⇄Go parity, migration/default behavior,
  and user documentation in the same commit.
- Serialize only non-default values where practical so existing files stay minimal. Missing
  properties must preserve current behavior.
- Never hand-edit `*.ir.json` goldens. Regenerate through `node scripts/corpus-accept.mjs`
  and review the resulting diff.
- Panel docking, floating geometry, open/closed state, and application theme preference are
  workspace UI settings, not PDL diagram data. Use versioned settings migration and safe
  defaults for missing or corrupt values.
- Browser-local-only storage remains mandatory. No feature below may add runtime network
  calls, server persistence, CDN assets, webfonts, or external icon dependencies.

### Common validation gate

Run the relevant focused tests first, then the following gates as separate commands. Do
not chain quality tools with `;` or `&&`.

- `npm run check`
- `npm test`
- `npm run build` before E2E, because preview tests use the existing `dist` bundle
- `npx playwright test`
- `go vet ./...`
- `staticcheck ./...`
- `gocognit -over 15 .`
- `gocyclo -over 12 .`
- `go test -count=1 -race -cover ./...`
- `bash scripts/check-docs.sh` for documentation or format changes
- `bash scripts/check-repo-clean.sh --worktree` at the end

The complexity commands in this file intentionally scan more broadly than the scoped
example in `agents.md`. Baseline their output before the first change. Pre-existing findings
may be waived only when unrelated and explicitly recorded; never weaken a threshold or
exclude code merely to make a change pass.

For every UI item, capture the important interaction states in light and dark themes under
`test-results/screenshots/`. Review alignment, contrast, spacing, focus, empty states, and
animation end states against `docs/STYLE-GUIDE.md`. Update curated goldens only through
`UPDATE_GOLDENS=1 npm run e2e`, and include that diff in the reviewed commit.

Commit each completed item separately with its regression tests, documentation, and a
one-line changelog entry. Move the closed item and its executed plan to `docs/archive`.

---

## FLOW-01 Replace the permanent Flows sidebar with canvas-assisted editing

**Observed/current behavior**

- Flows are already embedded in the active `.pcd` document, but edited through a permanent
  Files/Flows sidebar tab and text inputs for object IDs/endpoints.
- The current ordered list supports all eight step types, nested `alt`/`par`, reorder,
  duplicate, delay, and play-from-step.

**Expected behavior**

- Remove the permanent Files/Flows sidebar. Do not create a separate flow document or
  storage entity.
- During flow editing, open an independent **Flow Steps** panel that can collapse, close,
  reopen, dock left/right/bottom, or float. It is absent until needed and uses the UX-02
  panel framework.
- Allow users to click canvas objects or connectors to target steps. Support creating a
  message step from an existing connector or by choosing source/target objects that resolve
  to an existing link; do not silently invent diagram links.
- Show ordered visual step cards containing a clear step-type treatment, editable
  title/description/text as applicable, and readable actor/link summaries. Selecting a card
  highlights its canvas participants; selecting canvas participants offers flow actions.
- Retain efficient ordered-card drag/reorder and nested `alt`/`par` editing in Flow Steps.
  Preserve add, remove, duplicate, delay, play-from-step, flow selection/creation, playback,
  sequence export, diagnostics, code round-trip, and all eight step types.
- Canvas-assisted editing and code editing remain two views of the same source of truth.

**Implementation plan**

1. Extract Flow Steps from SidePane into the shared panel registry and add explicit commands
   to enter/leave flow editing.
2. Add a selection/targeting port between CanvasController and the flow editor; avoid raw ID
   typing for normal canvas-driven operation.
3. Implement visual cards and nested editors on top of existing `flowDoc` mutations, keeping
   parser/printer semantics unchanged unless a separate format need is discovered.
4. Preserve dirty-state, undo/history, playback, and validation behavior across both surfaces.

**Test approach**

- Unit: object/link-to-step targeting, disambiguation, invalid/dangling references, all eight
  step types, nested branches/lanes, and no silent link creation.
- Component: visual card contents, canvas highlight, reorder, close/reopen, dirty buffers,
  and accessible keyboard alternatives to canvas picking.
- E2E: build a flow entirely through canvas-assisted selection; edit every step type;
  reorder/nest; play; export sequence; edit in code; reload; verify the old Flows tab is gone.
- Visual filmstrip: enter flow editing, pick source/target/connector, each card type,
  nested `alt`/`par`, playback, and docked/floating Flow Steps in both themes.

**Validation steps**

- Run flow unit/component tests, existing S3/flow-edit/sequence-export E2E plus the new
  canvas-assisted specs, and the common gate.

---

## FLOW-02 Add configurable connector sparks with bidirectional ping-pong

**Observed/current behavior**

- Flow playback animates one token once per message step and a trailing dash.
- `flip` reverses initial travel; no connector speed/count settings exist.
- Reduced motion currently replaces movement with persistent emphasis.

**Expected behavior**

- Persist spark **speed** and **count** on each connector so animation intensity can underline
  relative usage. Missing values preserve current one-token/default-speed behavior.
- Use a documented positive speed multiplier where 1 means current speed, and a positive
  integer count with validated safe bounds. Multiple sparks are staggered deterministically
  along the same path.
- Unidirectional connectors: sparks appear at the start, travel across the line once during
  the step, and disappear at the end.
- Bidirectional connectors: after reaching the far end, sparks reverse and ping-pong until
  the step ends. `flip` chooses the initial direction; it does not change connector
  direction semantics.
- Speed changes particle motion, not the step's configured dwell/auto-advance delay. Count
  changes visual density, not flow steps. Parallel lanes and camera movement remain correct.
- Reduced motion shows static emphasis and no moving sparks. Stop, step change, exit, and
  file switch remove every animation artefact.

**Implementation plan**

1. Add connector animation properties atomically to PDL/IR, properties UI, corpus, and docs.
2. Generalize token creation/timing through the animation player port, using actual path
   length and deterministic staggering.
3. Integrate lifecycle cleanup and reduced-motion/static states without changing planner
   semantics or per-step delays.

**Test approach**

- Unit: default compatibility, speed/count validation, staggering, one-way completion,
  bidirectional reversal until cancellation, `flip`, parallel lanes, reduced motion, and
  cleanup on every exit path.
- Corpus: TS⇄Go parity, round-trip, minimal default printing, and invalid values.
- E2E with controlled timing: set speed/count; play uni/bi flows; pause/step/restart/exit;
  reload; emulate reduced motion; verify no orphan tokens.
- Visual filmstrip: low/high density, different speeds, reversal endpoints, parallel lanes,
  static reduced-motion state, and settled end frames in both themes.

**Validation steps**

- Run animation/format tests with fake clocks, corpus parity, flow E2E, reduced-motion E2E,
  and the common gate.

---

## CX-04 Make route, line, and arrow selection visual

**Observed/current behavior**

- Orthogonal/straight/curved routes, solid/dashed/dotted lines, width, and head/tail markers
  already work through text dropdowns and numeric input.
- The request for “dotted/stripped/full/bold” maps to existing dotted/dashed/solid textures
  and width; curved switching itself does not need a new routing model.

**Expected behavior**

- Replace text-only selection with visual previews for route geometry, line texture, common
  widths/boldness, arrow/no-arrow, and independent head/tail marker choices.
- Keep all existing options and custom width support. The currently selected preview is
  obvious by more than color alone and has an accessible text name.
- Selection updates the selected connector immediately, remains undoable, persists through
  PDL/reload, and works in docked/floating Properties and reduced-motion mode.
- No new document property is required unless an actual missing visual capability is found.

**Implementation plan**

1. Build a reusable accessible visual option picker using inline SVG previews and existing
   theme tokens.
2. Wire it to current route/line/width/head/tail controls without changing their update
   semantics.
3. Retain textual labels/tooltips and keyboard navigation.

**Test approach**

- Component: every preview, selected state, keyboard operation, accessible names, and custom
  current values not represented by a preset.
- E2E: choose every route/texture/marker and bold width; verify canvas path/marker/style,
  code text, undo, and reload.
- Visual filmstrip: picker open/selected states and a connector style gallery in both themes.

**Validation steps**

- Run PropertiesPanel/controller/link tests and link/routing E2E, review the style gallery,
  then run the common gate.

---

## DOC-01 Reconcile stacking-order documentation with actual commands

**Observed/current behavior**

- `docs/USER-GUIDE.md` says the canvas context menu includes “bring to front.”
- `web/src/ui/CanvasMenu.tsx` currently offers duplicate/copy/paste/delete, alignment,
  distribution, and equal size, but no bring-to-front command.

**Expected behavior**

- Documentation and shipped UI agree after CX-03 lands.
- If CX-03 includes context-menu z commands, document their exact labels/behavior. Otherwise
  remove the unsupported claim and document the actual Auto/integer z control.
- Do not advertise numeric z, context commands, or persistence until the corresponding
  behavior is implemented and tested.

**Implementation plan**

1. Update the editing/context-menu section together with the CX-03 UI that ships.
2. Check related SPEC/status claims and CLI/export documentation for the same mismatch.
3. Record the corrected behavior in the changelog with CX-03.

**Test approach**

- Manual UI-to-guide comparison of every context-menu entry and z control.
- Documentation link/PDL fence checks and an E2E assertion for any newly documented command.

**Validation steps**

- Run `bash scripts/check-docs.sh` and the CX-03 E2E scenario, then include the docs diff in
  the same reviewed commit.

---

## Recommended execution order and dependencies

1. **Independent foundation:** UX-01. DOC-01 closes with CX-03.
2. **Shell first:** UX-02, then UX-03. FLOW-01 depends on this panel framework.
3. **Independent visual work:** UX-04, UX-05, UX-06, CX-04; coordinate shared CSS/property
   panel changes rather than mixing them into one commit.
4. **Serialize format changes to avoid corpus conflicts:** CX-01 before CX-02 because routing
   consumes explicit anchors; CX-03 independently; FLOW-02 after connector format patterns
   are established. Each remains its own atomic format commit.
5. **Flows last within the UI sequence:** FLOW-01 after UX-02/UX-03; FLOW-02 after its format
   work and animation regression fixtures are ready.
6. Run broader regression and visual suites after each item, not only at the end. New defects
   found during validation become new tracked items and restart the intake/fix process.
