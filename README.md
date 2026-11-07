# PanelCraft

[![CI](https://github.com/pijalu/panelcraft/actions/workflows/ci.yml/badge.svg)](../../actions)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Web-based architecture diagramming tool (IcePanel-inspired — no affiliation):
WYSIWYG canvas editor with an always-visible code view, step-by-step flow
animation, and a multi-file workspace that lives **entirely in your browser** —
nothing is stored server-side.

**Status: specification phase.** Implementation starts at milestone M0 — see
[docs/SPEC.md](docs/SPEC.md) (product & technical spec) and
[docs/FILE-FORMAT.md](docs/FILE-FORMAT.md) (native `.pcd` file format).

## Planned capabilities

- Editable, animated diagrams: drop components, draw typed links, edit properties;
  play step-by-step flows over the diagram
- Code view ⇄ canvas live sync; the text file is the single source of truth
- Native format `.pcd` (own grammar, mermaid-inspired); mermaid import (converter)
  and export (declared feature drop)
- Browser-only storage (IndexedDB); per-file export `.pcd` / `.mmd` / `.svg` / `.png`,
  full workspace ZIP round-trip
- **Fully self-contained**: no CDN, no external resources, runs/builds offline;
  system fonts, inline SVG icons only
- GitHub Pages hostable (fully static) **and** single Go binary
  (serve + `validate` / `convert` / `render` CLI) for Windows/Linux/macOS

## Repository layout (planned)

See the repo map in [agents.md](agents.md).

## Contributing

Read [agents.md](agents.md) — it doubles as the contributor handbook: commands,
quality gates (staticcheck, gocyclo, eslint, ≥80% core coverage), e2e + visual
review loop, definition of done.

## License

[GPL-3.0-only](LICENSE).
