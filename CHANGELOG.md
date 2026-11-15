# Changelog

All notable changes to PanelCraft. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: SemVer (pre-1.0 = milestone-driven).

## [Unreleased]

### Added — UX-08 application experience

- **UX-08 WP03** The editor shell now runs on one semantic chrome token layer (activity rail,
  panels, tabs, lists, menus, inputs, buttons, focus, disabled, banners, scrollbars) with WCAG AA
  pairs asserted in both themes; chrome controls use the owned 16 px inline SVG icon set instead of
  Unicode glyphs, targets are 32 px, and the deleted duplicate chrome block in `app.css` no longer
  overrides the themed rules. `docs/STYLE-GUIDE.md` documents the chrome tokens, control/icon rules
  and the "no inline colours" contract.
- **UX-08 WP03 fix** A menu whose first entry is unavailable now focuses its first *enabled* action
  (focusing a disabled button is a no-op and stranded keyboard focus on the trigger).
- **UX-08 WP03 fix** The clear-data dialog takes focus on its confirmation field and dismisses on
  Escape from anywhere inside the modal, not only from that field.

### Added — UX review

- **UX-01** Added a reusable Laws of UX review skill with 30 PanelCraft-specific references.
- **UX-02 follow-up** A transient viewport blip (fullPage screenshot metrics, a
  hidden/minimised window) no longer collapses every open panel: resize recovery
  waits for the resize to settle and ignores implausible widths, so a settled
  docked workspace survives such frames.

### Added — connector, flow and UX review (CX/FLOW/UX backlog)

Closes the queued backlog items in `bugs.md`; each one keeps its own archive record
under `docs/archive/` with the executed plan, validation and review evidence.

- **CX-01** Connector start/end points are draggable and lock to the entity perimeter,
  with the automatic side/midpoint choice still the default and one undoable edit per move.
- **CX-02** Deterministic route avoidance keeps committed connector polylines clear of
  objects, with an explicit per-link overlap override where avoidance is impossible.
- **CX-03** Objects carry a persisted stacking order (Auto by default, stable
  document-order ties) projected identically by paint order, hit-testing, the mini-map,
  exports and the CLI.
- **CX-04** Connector route, line texture, typical weights and independent head/tail
  markers are chosen from inline-SVG preview tiles in front of a real radio group; the
  numeric Width field still accepts any custom width and no document/IR change was needed.
- **FLOW-01** Flows are edited through an on-demand Flow Steps panel the canvas can drive,
  without a separate flow store and without inventing links.
- **FLOW-02** Connectors carry playback intensity (spark count and speed) without changing
  flow timing, dwell or validation; missing values reproduce the previous behaviour.
- **UX-03** Files became an on-demand workspace browser instead of a permanently docked list.
- **UX-04** Element text no longer mixes with glyphs and icons: label and icon content live
  in separate regions that survive resize and reload.
- **UX-05** A persisted System/Light/Dark application selector applies before first paint and
  stays independent of the diagram's own PDL theme.
- **UX-06** Equal-size cues and snapping guide component resize, with the snapped result kept
  as one undoable resize.
- **DOC-01** The user guide now documents the context-menu commands the canvas really offers
  and no longer advertises stacking commands that do not exist.

### Fixed — review pass 2 (docs/FIX-PLAN.md)

- **F-01** Canvas edits no longer rewrite the file as an objects+links
  projection: `applyCanvasState` (engine/model/merge.ts) merges the canvas into
  the parsed document, so flows, views, positions, styles, imports, meta,
  comments, attributes, tags and waypoints survive a drag/rename. The bare
  projection remains only as the unparsable-buffer fallback.
- **F-02** Object/link ids are never reused: `loadState` re-baselines the id
  counter from the loaded file and `addObject`/`commitLink` probe for a free id
  (`uniqueId`), so a new object can no longer duplicate an existing id.
- **F-03** Machine→editor writes are minimal diffs (`codeview/diff.ts`): the
  caret keeps its logical position instead of collapsing to offset 0, and a
  write that only differs in trailing whitespace is skipped entirely.
- **F-04** The code buffer is no longer canonicalised under the caret: an idle
  apply keeps exactly what the user typed, the canonical form goes to the file,
  and Format (`Shift-Alt-f`)/save is the explicit canonicalisation path.
  `divergedFromSaved` compares meaning (canonical print), not bytes.
- **F-05** The printer omits an empty attribute block, so a canvas-origin write
  no longer touches every line (corpus + Go parity fixtures regenerated).
- **F-06** `group` and `note` objects survive a load (they were filtered out of
  the canvas projection and disappeared on the next apply).
- **F-07** `dashed` (object and link) and `bidir` round-trip through the canvas
  merge into the file's `style` block instead of being dropped.
- **F-08** Canvas-origin link semantics no longer mutate: untyped arrows stay
  untyped (no injected `uses`), `a <-> b` stays bidirectional, and the
  properties panel gained an explicit "(untyped)" option.
- **F-09** Repo hygiene: `dist/**` and run screenshots are untracked; e2e captures
  go to `test-results/screenshots/`, curated goldens live in `e2e/goldens/` and are
  refreshed only with `UPDATE_GOLDENS=1`; `scripts/check-repo-clean.sh` gates
  tracked generated content and worktree cleanliness (CI + `verify.sh`).

- **F-28/F-29** Startup and durability defects found while verifying F-01: a
  pre-load canvas snapshot is no longer mistaken for an edit (it could write an
  object-less document over the file), a no-op render request no longer cancels a
  newer pending render, and document content is persisted immediately instead of
  riding the 800 ms autosave debounce (a reload inside that window lost the edit).

- **F-13** (IR v2) Objects carry optional `size <w> <h>` geometry: a known attribute
  in the parser/printer/serializer (TS + Go, corpus and parity fixtures regenerated),
  resize with eight anchors on every kind (min 48×32, grid snap, one undo per drag),
  fit-to-name through an injectable text-measurement port (two-line wrapping,
  grow-only on create/rename/load) and an explicit `Fit` command.

- **F-14** Geometry persists: a drag/resize end commits the moved positions into the
  active view (implicit `Default`, 250 ms debounce) through the sync machine, so the
  canvas, the code view and the file agree; opening/switching only applies stored
  positions. `Auto-layout` is explicit, undoable and persisted; a new `Reset layout`
  drops the view's `position` lines without touching the diagram.

- **F-12** Arrow visual model: link style blocks carry `head`/`tail`/`line`/`width`
  (TS + Go, corpus/parity fixtures cover it); the renderer has one marker per shape
  (`arrow|open|diamond|circle|square|none`) for both ends, line textures and stroke
  width, plus a per-type colour hint via `data-link-type`. Properties panel gained
  head/tail/line/width controls and `Shift+A` cycles the head (undoable).
- **F-30** Machine→editor projections are no longer fed back as user typing (they
  could flip the sync chip to `editing`/`error` after a pure canvas write) and focus
  is re-asserted after a projection.

- **F-31** The offline e2e spec no longer races its own service worker (serial file +
  cache selected by name), removing an intermittent red gate.

- **F-10** Collapsible, resizable shell: every panel (files, shapes, code, properties)
  collapses to a rail — the code rail keeps the sync-state chip — with persisted widths
  (`StoredWorkspace.settings`, schema v2 + migration), drag splitters with clamps and
  `Ctrl/Cmd+B` / `Ctrl/Cmd+J` / `Ctrl/Cmd+Alt+P` shortcuts. The code pane starts
  collapsed below 1440 px, so the canvas gets its width back on small screens.
- **F-32** The stored layout is adopted during render, so the first click after load is
  never overwritten; focus follows a collapsing panel to its rail button.

- **F-11** Properties panel sections: Identity / Metadata / Style / Advanced, collapsible
  with a persisted state; new controls for custom key-value `property` entries, style
  overrides (fill/stroke/text/icon, painted through CSS custom properties on the object
  group) and a link `Bidirectional` toggle; the Advanced section shows id, size and the
  `Fit to name` command.

- **F-15** In-place rename: `F2` or double-click opens an input on the canvas (screen
  space, follows pan/zoom, chip above 200 % zoom), Enter/blur commit as one undoable
  change, Escape cancels; canvas label, properties panel and code line stay in sync.

- **F-17** Illustration registry: six beat illustrations (travel-token, pulse,
  sequential-glow, packet-burst, compare-split, trail-fade) with per-kind defaults and
  a per-flow choice in the flow header; the planner is unchanged.

- **F-18** Flow editing parity: steps drag-reorder, duplicate (deep copy) and carry an
  editable per-step dwell — new `delay <ms>` step attribute (IR `delayMs`, TS + Go,
  parity fixtures, applied by the planner); the step header is sticky with an `unsaved`
  chip and every step offers "play from this step".

- **F-19** Canvas command layer: clipboard copy/paste with fresh-id remapping,
  duplicate, align (six anchors), distribute (x/y) and equal-size — each one undoable
  and reachable from `mod+C/V/D` or a right-click context menu that only offers what
  the selection allows. Link waypoints are now document data the canvas can edit:
  routing passes through them orthogonally and a selected link exposes draggable
  handles that write straight back to the file.

- **F-20** Imports resolved and rendered: `alias.objectId` references are now part of
  the grammar (lexer + parser for link endpoints, flow targets and `attach`, TS + Go
  parity), imported objects render as read-only ghosts (dashed, `imported` badge)
  click-through to their source file, links to them survive canvas writes, and
  missing/cycle/escape problems surface in a banner.

- **F-21** Mermaid interop completed: `sequenceDiagram` import (participants → objects,
  messages → a flow), `classDef`/`class` → tags (colours declared as a drop),
  `linkStyle` → link style, a `C4Context` exporter, and a generated
  `docs/MERMAID-MATRIX.md` asserted against the converters' declared drop catalogues.

- **F-22** Canvas accessibility and the canvas↔code map: scene nodes are focusable
  (`role`/`aria-label`), `Tab`/arrows walk the objects with roving focus (`Enter`
  select, `F2` rename), a selection highlights the matching statement in the code view
  (decoration, no caret stealing) and a caret on a statement selects its object.

### Added — M2 Canvas MVP (PLAN §4)

- Imperative SVG canvas (ADR-0001): viewport pan/zoom (10–400 %, wheel +
  keyboard), grid toggle, fit-to-diagram.
- Diff-patch scene-graph renderer — stable ids, move-only transform swaps,
  selection persistence; C4 shape set (person/system/system_ext/container/
  component/datastore/queue/note/group) styled exclusively via theme tokens.
- Selection: click, shift-multi, rubber band, link hit-testing with slop.
- Drag with 8 px grid snap + alignment guides; anchored group resize.
- Link UX: edge-halo drag → ghost → commit, orthogonal router v1 with
  obstacle detour; link type/label/dashed editing.
- Properties panel: name/description/technology/tags/dashed — every edit an
  undoable ValueChange; undo/redo (mod+z / mod+shift+z) with 100-step stack
  and typing-run coalescing.
- Palette: 9 C4 kinds — click-to-place, pointer drag-drop, 1..9 quick-add.
- S1 e2e (create flow, light/dark screenshots), N1 perf baseline (60 fps
  pan/zoom/drag at 300 objects), vision review round 1 — docs/milestones/M2.md.

### Added — M0 Scaffolding (PLAN §2)

- Canonical GPL-3.0-only LICENSE (replaces pre-M0 placeholder).
- Web build: vite + Preact + TypeScript strict; eslint complexity gates
  (≤12); vitest + v8 coverage with thresholds (core 80%, `ui/*` 60% reported).
- Go shell: `panelcraft serve` (embedded SPA, strict CSP, SPA fallback,
  read-only `/files/*`, dev-mode `--dev-dir`) and `panelcraft version`.
- CI: `ci.yml` stage chain (SPEC §8.5), `pages.yml` + `release.yml` stubs
  (deploy/release engineering land with M7).
- `scripts/verify.sh` multi-stage local gate (`m0` first) and
  `scripts/check-selfcontained.sh` asset-origin scan (N7/N11).
- Playwright scaffold: S7 no-network smoke + light/dark screenshot baselines,
  pixelmatch visual-diff util.
- Docs: STYLE-GUIDE (tokens + vision checklist), ARCHITECTURE skeleton,
  milestone log `docs/milestones/M0.md`.
