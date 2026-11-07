# PanelCraft v1.0.0

First stable release. PanelCraft is a client-only architecture diagram tool:
WYSIWYG SVG canvas with an always-visible `.pcd` source pane, live two-way
sync, flows with narration, views/tags/auto-layout, and a browser-only
workspace — served as a single self-contained Go binary.

## Highlights

- **Canvas editor** — 9-shape C4-ish language, typed links, drag/snap,
  undo/redo, keyboard navigation.
- **Code ⇄ canvas live sync** — native `.pcd` grammar with own parser,
  printer, semantic diagnostics (P1xx/P2xx), format command.
- **Mermaid interop** — flowchart import (best-effort) + export; TS⇄Go
  parity gated on a shared golden corpus.
- **Workspace** — multi-file IndexedDB storage, ZIP round-trip, snapshots
  with versioned restore, quota banners, private mode.
- **Flows & animation** — step machine, play bar, ARIA live narration,
  reduced-motion support.
- **Views, tags, search** — named views with hide rules, tag fade,
  deterministic dagre auto-layout, fuzzy quick search (`Ctrl/Cmd+P`).
- **Offline** — service-worker shell: install once, boot without network;
  update flow notifies on new versions.
- **Hardened** — WCAG 2.1 AA axe gate across themes and dialogs, perf
  budget gates (60 fps @ 300 objects, 10k-line parse < 1 s), DOM-prune SVG
  export sanitizer with fuzz suite, CLI path-traversal guards, strict CSP,
  zero external origins, no telemetry.
- **CLI** (single Go binary, embedded SPA): `serve` (strict CSP, read-only
  `/files`), `validate [--json]`, `convert [--out]`, `version`.

## Quality

Every release commit passes the 28-stage gate:
`bash scripts/verify.sh m7` (unit + property + fuzz + corpus TS⇄Go parity +
asset-origin scan + network-blocked e2e + a11y + offline e2e + release dry
run). License: GPL-3.0-only; dependencies restricted to MIT/Apache-2.0/BSD
per ADR-0004/0005.

## Artifacts

Binaries: `linux/{amd64,arm64}`, `darwin/{amd64,arm64}`,
`windows/{amd64,arm64}` (CGO off, `-trimpath`, version-stamped) +
`SHA256SUMS` + GitHub Pages bundle. The web build is fully self-contained:
no CDN, no external fonts — verified by `scripts/check-selfcontained.sh`
and a network-blocked e2e run.

## Docs

[User guide](docs/USER-GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) ·
[Spec](docs/SPEC.md) · [File format](docs/FILE-FORMAT.md) ·
[Changelog](docs/CHANGELOG.md) · [ADRs](docs/adr/) · full log in
[docs/milestones/M7.md](docs/milestones/M7.md).

---
*Full changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md). Release notes
generated from it at tag time; this file is posted verbatim by
.github/workflows/release.yml.*
