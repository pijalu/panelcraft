# Changelog

All notable changes to PanelCraft. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versioning is SemVer-ish with
milestone-aligned minors. Dates are UTC.

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
