# PanelCraft

[![CI](https://github.com/pijalu/panelcraft/actions/workflows/ci.yml/badge.svg)](../../actions)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

Web-based architecture diagramming tool (IcePanel-inspired — no affiliation):
WYSIWYG SVG canvas with an always-visible code view, step-by-step flow
animation, and a multi-file workspace. Static hosting keeps data **in your browser**;
an explicitly configured local server or a user-selected browser folder can instead
store ordinary files on your device. Ships as a static site (GitHub Pages-hostable,
service-worker offline shell) and a single Go binary
(`serve` + `validate` / `convert` / `render` CLI) for Windows/Linux/macOS.

## Quick start (users)

- **Hosted**: [open PanelCraft on GitHub Pages](https://pijalu.github.io/panelcraft/) —
  works offline after the first load (service worker caches the app shell; your
  data stays in your browser).
- **Self-host / CLI**: grab a binary from Releases (linux/darwin/windows ×
  amd64/arm64, checksums in `SHA256SUMS`), then:

  ```bash
  panelcraft serve --open                  # app + browser workspace storage
  panelcraft serve -local ./diagrams --open # editable real files, loopback only
  panelcraft validate docs/architecture  # validate .pcd files (exit 1 = errors)
  panelcraft convert diagram.mmd -o diagram.pcd # Mermaid C4/flowchart → canonical PDL
  panelcraft render diagram.pcd -o diagram.png --theme dark --width 1920
  panelcraft version
  ```

  `-local` accepts `-storage-type filesystem` (the default, also `filestorage`) and
  `-depth N` to limit descendants; omit depth or use `-1` for unlimited. Writable
  serving is restricted to loopback. Local and remote Git backends are not implemented.
  In a supporting browser, **Application menu → File & data → Open local folder…**
  also edits a chosen folder directly, without a server.

  Full command reference: [docs/USER-GUIDE.md](docs/USER-GUIDE.md#cli-reference).

## What it does

- Editable diagrams: drop components (person/system/container/datastore/…),
  draw typed links, edit properties; auto-layout (dagre), named views, tags
- **Code view ⇄ canvas live sync** — the text file is the single source of
  truth; the native `.pcd` grammar is mermaid-inspired (spec:
  [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md))
- **Flows**: record step-by-step narratives over the diagram and play them
  back with animated highlighting + ARIA narration
- Multi-file workspace in IndexedDB, a confined local server directory, or a chosen
  browser folder; snapshots; per-file export `.pcd` / `.mmd`
  / `.svg` (sanitized) / `.png`; full workspace ZIP round-trip; mermaid import
- **Fully self-contained**: no CDN, external resources, or third-party runtime origin;
  static/direct-folder sessions make no workspace network requests; system fonts,
  inline SVG icons; WCAG 2.1 AA UI chrome

## Documentation

| Doc | Contents |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | product & technical spec, NFRs, quality gates |
| [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md) | native `.pcd` grammar (normative) |
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | user guide: create/edit/flows/views/CLI reference |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | architecture prose + `.pcd` diagrams |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | release history |
| [agents.md](agents.md) | contributor handbook (commands, gates, DoD) |
| [docs/adr/](docs/adr/) | architecture decision records |

## Development

```bash
npm ci && go mod download      # one-time (offline afterwards, SPEC N11)
npm run dev                    # vite dev server :5173
bash scripts/verify.sh m7      # full local CI gate (28 stages)
```

## Contributing

Read [agents.md](agents.md) — it doubles as the contributor handbook: commands,
quality gates (staticcheck, gocyclo, eslint, ≥80% core coverage), e2e + visual
review loop, definition of done.

## License

[GPL-3.0-only](LICENSE).
