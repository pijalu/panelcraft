# Changelog

All notable changes to PanelCraft. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versioning is SemVer-ish with
milestone-aligned minors. Dates are UTC.

## 2026-11-14 — FLOW-02 connector sparks

- Added per-link playback sparks (`sparks 1..8`, `speed 0.25..4` in the link style block, PDL/IR v7 and TS⇄Go parity): deterministic staggering, one-way completion, bidirectional ping-pong until the step ends, `flip` as the initial direction, bounded validation, unchanged step timing, static reduced-motion playback and cleanup on every exit path.

## 2026-11-14 — FLOW-01 canvas-assisted flow editing

- Flow Steps is an on-demand dockable panel instead of a permanent tab, with visual step cards (kind stripe, title, actor/link summary), canvas-assisted targeting (from/to/target from the selection, message steps seeded only from existing connectors), participant highlighting, and accessible names for the step controls.

## 2026-11-14 — CX-04 visual connector style pickers

- Replaced the connector dropdowns with accessible preview tiles (inline SVG + text label, check mark and weight for the selection, arrow-key navigation) for route geometry, line texture, common weights and independent head/tail markers, keeping the numeric Width field for custom values.

## 2026-11-14 — DOC-01 context-menu documentation

- Corrected the user guide's context-menu list to the shipped commands (duplicate/copy/paste/delete, six align, two distribute, equal size) and removed the unsupported "bring to front" claim, pointing layering at the Stacking order field instead; a light/dark E2E now fails if the guide and the menu drift apart.

## 2026-11-14 — CX-05 group-endpoint links no longer crash auto-layout

- Auto-layout skips links whose endpoint is a compound group boundary (dagre cannot rank a parent), so such documents validate, lay out and render instead of throwing; the link still draws from the boundary rectangle.

## 2026-11-14 — CX-03 object stacking order

- Added per-object **Stacking order** with Auto as the default and an optional integer `z` override (PDL/IR v6, TS⇄Go parity), stable document-order ties, z-aware paint/hit-test/mini-map order shared by canvas, SVG/PNG export and CLI rendering, undoable properties editing, and a clean corpus seed with a declared Mermaid drop.

## 2026-11-14 — CX-02 object and connector overlap avoidance

- Added deterministic bounded avoidance across solid objects and earlier connectors, a persisted per-link **Allow overlap** override with PDL/IR v5 and Go parity, authoritative manual waypoints, minimum-conflict fallback, and shared canvas/minimap/SVG/PNG/CLI route geometry.

## 2026-11-14 — CX-01 perimeter-locked connector endpoints

- Added draggable, normalized start/end anchors with PDL/IR v4 and Go parity, exact routing across all modes, resize-safe persistence, undo/redo, accessible light/dark handles, and consistent SVG/PNG/CLI geometry; PNG export now falls back to local image decoding where Chromium rejects SVG bitmap blobs.

## 2026-11-14 — UX-06 equal-size resize cues

- Added deterministic equal-width/height snapping with labeled, accessible resize-only cues, transient geometry, cancel cleanup, and one persistent undo command per committed resize.

## 2026-11-14 — UX-05 application theme preference

- Added a persisted, no-flash System/Light/Dark selector across application surfaces while keeping document and CLI render themes independent, including deterministic light/dark SVG and PNG output.

## 2026-11-14 — UX-04 separated shape content

- Reserved distinct label, glyph, icon and imported-badge regions across all shape kinds, with consistent auto-fit, explicit resize and reload geometry plus keyboard/contrast fixes found by accessibility review.

## 2026-11-14 — UX-03 on-demand workspace browser

- Split Files and Flow Steps into independent dockable panels, retained dirty tabs and flow selection
  across close/reopen, and covered keyboard-only file operations, persistence, accessibility and both themes.

## 2026-11-14 — UX-02 canvas-first workspace

- Made Shapes the only panel open by default and added browser-local close/reopen, left/right/bottom
  docking, floating panels, resizing, keyboard alternatives, reset, focus transfer, viewport
  recovery, and reliable layout persistence without changing diagram data.

## 2026-11-14 — UX-07 diagnostic status

- Removed the stray diagnostic zero with a visually-hidden utility and polite atomic status,
  preserving accessible counts, visible parse-error feedback, and clean recovery.

## 2026-11-11 — P6: flow-presentation polish

- Added a softer one-beat history fade for previous objects and links while keeping
  current actors live and all other elements at the specified 25% opacity.
- Wired the production animator to `prefers-reduced-motion`, matching the existing
  instant camera behavior with static emphasis and no pulsing rings or travel.
- Added unit and real-browser regressions plus reviewed light/dark playback and
  presentation captures; numbered badges, parallel lanes and compact transports remain.

## 2026-11-11 — P6: N10 string centralization

- Centralized UI chrome, accessible names, context/history copy, template copy and
  new-flow defaults in a typed English catalog with named-placeholder interpolation.
- Added a TypeScript AST audit for rendered text, accessible attributes and copy-bearing
  properties. English remains the only exposed locale; no runtime behavior change intended.

## 2026-11-11 — P6: accessible mini-map

- Completed FR-C1's mini-map with topology/viewport rendering, click-to-center,
  arrow-key panning, Home-to-fit, live flow-camera updates and responsive hiding.
- Canvas rendering is O(objects + links) with device-pixel-ratio capped at 2;
  the real 300-object pan/zoom/drag baseline remains at 60/60/122 fps.
- Added geometry/component tests, narrow-screen E2E and reviewed light/dark goldens.

## 2026-11-11 — P6: sequence export

- Completed M6-WP7: a selected flow downloads as `.seq.mmd`, preserving participants,
  messages, `alt`/`par` blocks, process/info/conclusion notes, direction flips and
  dashed links. Timing, navigation and participant-less-note loss is explicitly declared.
- Added converter/UI regressions, a checkout golden and a real-browser download E2E.

## 2026-11-11 — P6: routing completion

- Completed FR-C8 with persisted orthogonal/straight/curved link routes (IR v3), curved
  hit-testing, route-aware rendering, properties controls, and TS⇄Go corpus parity.
- Added deterministic label placement around solid objects, unrelated routes, and other
  labels, plus a theme-aware halo for crowded fallbacks. Existing orthogonal geometry
  remains the default; explicit waypoints survive all three modes.

## 2026-02-14 — P5: spec-completion and C4 CLI rendering (F-37…F-41)

- Implemented `panelcraft render` with isolated, storage-free browser rendering and
  real-Chrome SVG/PNG output, theme/view/width flags, and actionable failures (F-37).
- Corrected `convert` to produce canonical PDL from Mermaid flowchart, C4, and
  sequence input (or canonicalise PDL), with `-o` accepted on either side of the
  input and no output after fatal parse errors (F-38).
- Fixed flow-camera SVG-origin mapping and added browser assertions that active
  actors remain inside the canvas; dependencies now show the owning file (F-39/F-40).
- Added compound C4 auto-layout and boundary-transparent routing for headless
  output. Real conversion→render integration and light/dark visual review cover
  boundaries, external objects, and relationship labels (F-41).

## 2026-02-14 — P4: docs truth pass and sync-path perf gate (F-26, F-27)

- **F-27**: new `N4` perf gate — 500-object document, one rename, merge → print →
  parse → `docToState` → minimal diff measured at **3.0 ms** against a 150 ms budget,
  with the diff asserted local.

- **F-26**: `SPEC.md` gained a "v1.0 status" section (FR-C5/C6/C7/C8/C9/C10/C12 and
  FR-I1…I3 marked implemented; curved/straight routing, mini-map, cross-file inlining
  and per-step illustrations recorded as post-v1). `USER-GUIDE.md` now documents the
  grouped palette, in-place rename, eight-handle resize, `size`, waypoints, hover
  cards, the saved/dirty pill, the error state, templates, the history affordance,
  present mode and the flow closing card. `agents.md` lists the docs/corpus/clean-
  worktree gates and the preview-dist pitfall.

## 2026-02-14 — P4: laws-of-UX pass (F-25)

- Saved/dirty pill with last-save time and a problem chip; template gallery for a new
  file (three parsable starting points); palette grouped by C4 level; progressive
  link-type picker (four verbs + "More types"); canvas hover info card; undo/redo
  toasts; flow closing card (replay / export SVG / close); docked transport; 32 px
  minimum hit targets.
- Fixed while verifying: the gallery overlay was shell-level and blocked the editor
  (F-35); the shipped templates did not parse (F-36) — a regression test now parses
  every template.

## 2026-02-14 — P3: unified undo & history (F-24)

- **F-24 unified undo**: canvas commands and code edits share one journal
  (`HistoryFeed`), surfaced by a header `⟲ History` popover with surface badges and
  Undo/Redo routed to the action's owner. Canvas pushes are observed through
  `UndoStack.setObserver`; code edits are recorded per typing burst.

## 2026-02-14 — P3: canvas diagnostics (F-23)

- **F-23 canvas diagnostics**: objects whose statement is invalid get an error ring while the
  canvas keeps the last good render, and a `Diagram out of date — fix N problems` banner replaces
  the silent freeze. Mapping a diagnostic to an object handles the parser's col-1 reporting and
  failed parses (`ringTargets` + raw-line fallback in `objectAtLine`).
- **F-33**: `Ctrl/Cmd+Alt+P` (properties) now fires even when focus sits inside a panel.
- **F-34**: a broken statement is attributed to the statement it belongs to, not the next line.

## [1.0.0] — 2025-11-07

First stable release. Milestones M0–M7 complete (see
[docs/IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) and the milestone logs
in [docs/milestones/](milestones/)).

### Added
- **Canvas editor**: WYSIWYG SVG scene (9 object kinds, C4-ish shape
  language), typed links, drag/snap, undo/redo, hit-testing, keyboard nav
  (M2).
- **Code view ⇄ canvas live sync**: native `.pcd` grammar (own parser,
  printer, semantic validation P1xx/P2xx), always-visible source pane, sync
  state machine with diverged-state resolution, format (`Shift-Alt-F`)
  (M1, M4).
- **Mermaid interop**: flowchart import (best-effort) and export (declared
  feature drop); TS⇄Go converter parity gated on a shared golden corpus (M1,
  M4).
- **Workspace**: multi-file browser storage (IndexedDB), ZIP round-trip,
  export reminders, storage-quota banners, snapshots with versioned restore
  (M3, M6).
- **Flows & animation**: step machine, plan builder, play bar with ARIA live
  narration, reduced-motion support (M5).
- **Views, tags, search**: named views with hide rules + saved positions,
  tag chips with fade rendering, dagre auto-layout (deterministic, pinned
  override), dependencies panel, fuzzy quick search `Ctrl/Cmd+P` (M6).
- **Exports**: `.pcd` (canonical), `.mmd`, sanitized `.svg`, `.png` (2×),
  workspace ZIP (M3–M6).
- **Hardening (M7)**: WCAG 2.1 AA axe gate (both themes + dialogs),
  N1–N3 perf budget gates, DOM-prune SVG export sanitizer + fuzz suite, CLI
  path-traversal gates, service-worker offline shell with update flow.
- **CLI** (single Go binary, embedded SPA): `serve` (strict CSP, read-only
  `/files`), `validate [--json]`, `convert [--out]`, `version`.
- **Release engineering**: cross-compiled binaries (linux/darwin/windows ×
  amd64/arm64, CGO off, checksums), GitHub Pages deploy, offline build
  proven (`GOPROXY=off`).

### Quality gates (all green at release)
`bash scripts/verify.sh m7` — 28 stages: tsc/eslint, vitest + coverage
thresholds, perf budgets, focused suites, web build, vet/staticcheck/gocyclo,
go test + corpus parity (IR/TS/Go), docs validation (own architecture
diagrams parse), docs link check, asset-origin scan, axe/offline/full e2e
(S1–S7), release dry run.

[Unreleased]: https://github.com/pijalu/panelcraft/compare/v1.0.0...HEAD
