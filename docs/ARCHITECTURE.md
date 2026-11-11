# ARCHITECTURE — PanelCraft

Skeleton (M0). Details evolve per milestone; module diagrams live as `.pcd`
files in [docs/architecture/](architecture/README.md) — written in PanelCraft
itself (SPEC §14), marked *unvalidated* until M1 parser lands
(`panelcraft validate docs/architecture` becomes a CI gate in M1).

## System shape

Client-only SPA (vite + Preact + TS strict) + single Go binary. The SPA is the
product; the Go binary embeds the built SPA (`go:embed web/dist`) and serves
it read-only (`panelcraft serve`), plus CLI verbs (validate/convert/render,
M1+). No server-side state, no runtime network beyond static asset load
(SPEC FR-S1, N7/N11).

## Package map

| Package | Role | Depends on |
|---|---|---|
| `web/src/engine/model` | IR types + operations, semantic validation | — (pure) |
| `web/src/engine/format` | PDL lexer/parser/printer, mermaid converters | model |
| `web/src/engine/render` | SVG scene graph renderer, hit-testing | model |
| `web/src/engine/layout` | deterministic dagre auto-layout, including compound C4 boundaries | model |
| `web/src/engine/flows` | flow step machine | model |
| `web/src/engine/anim` | animation plan builder, reduced-motion | flows |
| `web/src/workspace` | virtual FS, ZIP, IDB store, undo | model |
| `web/src/ui` | Preact components, panels, dialogs | engine + workspace via ports |
| `web/src/cliRender` | storage-free browser entry for standalone SVG/PNG rendering | engine + canvas controller |
| `cmd/panelcraft` | CLI entry (serve/validate/convert/render/version) | internal/*, web |
| `internal/server` | embedded SPA HTTP shell (CSP, fallback, /files/*) | web (dist) |
| `internal/ir` | Go IR codec (M1) | — |
| `internal/pdl` | Go PDL parser/printer (M1, mirrors TS) | ir |
| `internal/render` | loopback-only chromedp headless render | server (serves embedded CLI entry) |
| `testdata/corpus` | golden corpus shared by TS + Go tests | — |

## Ports rule (SOLID, agents.md)

Engine and workspace never import `ui` or browser globals directly — they
depend on interfaces ("ports"): `LayoutEngine`, `Storage`, `Clock`,
`AnimPlayer`. UI composes concrete adapters; tests substitute fakes
(in-memory storage, fake-indexeddb, deterministic clock). This keeps
`engine/*` pure and corpus-parity testable on both TS and Go sides.

## Data flow (one file, end to end)

```
.pcd text ──parse──► IR ──validate──► IR (P1xx/P2xx diagnostics)
    ▲                     │
    │ print (canonical)   ├──► render (SVG scene graph)
    │                     ├──► layout (auto-layout positions)
    │                     └──► flows/anim (step plans)
 workspace (virtual FS) ── persist ──► IndexedDB (browser-local only)
```

Go mirrors the `text ⇄ IR` leg exactly (`internal/pdl` + `internal/ir`),
enforced byte-parity on the shared golden corpus from M1 (CI gate). The Go
Mermaid converters emit canonical PDL directly. For CLI rendering, the binary
serves the embedded `?cli-render=1` entry on an ephemeral loopback listener;
that entry receives source through the browser adapter, never opens a workspace,
and returns sanitized SVG or a Chrome PNG screenshot.

## Deployment topologies

1. **Static SPA** — `web/dist` on any file server / GitHub Pages (FR-H);
   asset-origin scan + network-blocked e2e prove self-containment. The
   service worker (`web/src/sw.ts`, emitted by the vite build) precaches the
   shell — the SPA boots offline (N8); user data stays in IndexedDB, never in
   the SW.
2. **Single binary** — `panelcraft serve` embeds `web/dist`; strict CSP,
   SPA fallback, read-only `/files/*`; no write endpoints ever (FR-X, N6).
   Version stamped at link time (`-ldflags -X main.version`); release matrix
   linux/darwin/windows × amd64/arm64 (CGO off, `scripts/release.sh`).

## Security posture (SPEC N6, M7-WP4)

- Strict CSP on `serve` (no inline eval in the app), no telemetry.
- Exported SVG passes a DOM-prune sanitizer (script/foreignObject/iframe
  elements + `on*` / `javascript:` / `srcdoc` attributes removed, then
  re-serialized); the fuzz suite (`sanitize.fuzz.test.ts`) replays 500+
  hostile-label pipelines and 13 raw adversarial cases against it.
- CLI/workspace import paths cannot escape the workspace root (`P103`,
  `filepath.Rel` guard); `/files/*` rejects traversal (tested).
- The a11y gate (`e2e/m7-a11y.spec.ts`) runs axe WCAG 2.1 A/AA over the shell
  and dialogs in both themes.
