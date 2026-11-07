# Changelog

All notable changes to PanelCraft. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: SemVer (pre-1.0 = milestone-driven).

## [Unreleased]

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
