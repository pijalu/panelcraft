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
| `web/src/engine/layout` | dagre-port auto-layout | model |
| `web/src/engine/flows` | flow step machine | model |
| `web/src/engine/anim` | animation plan builder, reduced-motion | flows |
| `web/src/workspace` | virtual FS, ZIP, IDB store, undo | model |
| `web/src/ui` | Preact components, panels, dialogs | engine + workspace via ports |
| `cmd/panelcraft` | CLI entry (serve/version; M1: validate/convert/render) | internal/*, web |
| `internal/server` | embedded SPA HTTP shell (CSP, fallback, /files/*) | web (dist) |
| `internal/ir` | Go IR codec (M1) | — |
| `internal/pdl` | Go PDL parser/printer (M1, mirrors TS) | ir |
| `internal/render` | chromedp headless render (M7) | server (serves app) |
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
enforced byte-parity on the shared golden corpus from M1 (CI gate).

## Deployment topologies

1. **Static SPA** — `web/dist` on any file server / GitHub Pages (FR-H);
   asset-origin scan + network-blocked e2e prove self-containment.
2. **Single binary** — `panelcraft serve` embeds `web/dist`; strict CSP,
   SPA fallback, read-only `/files/*`; no write endpoints ever (FR-X, N6).
