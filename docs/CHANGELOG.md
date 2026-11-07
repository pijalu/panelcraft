# Changelog

All notable changes to PanelCraft. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versioning is SemVer-ish with
milestone-aligned minors. Dates are UTC.

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
