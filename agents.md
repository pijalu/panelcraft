# agents.md — PanelCraft

Agentic development conventions for this repository. **Humans:** this file is also for
you — it is the contributor handbook in condensed form. Full product spec:
[docs/SPEC.md](docs/SPEC.md). Format spec: [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md).

## Project in one paragraph

Client-only web app for IcePanel-style architecture diagrams (IcePanel = inspiration
only, no links/affiliation in docs): WYSIWYG SVG canvas + always-visible code view,
native `.pcd` format (own grammar, mermaid-inspired), mermaid import/export converters,
flows/animation, multi-file workspace in browser storage only (nothing server-side),
ZIP import/export, GitHub Pages hostable, single Go binary (serve + validate/convert/
render CLI). License **GPL-3.0-only**.

## Ground rules (non-negotiable)

1. **License**: every new source file starts with the GPL-3.0 SPDX header
   (`// SPDX-License-Identifier: GPL-3.0-only`). Deps must be GPL-compatible
   (MIT/Apache-2.0/BSD); new dependency ⇒ ADR first.
2. **Milestones are the contract** (SPEC §9). New ideas → backlog (SPEC §12), never
   silently expanded scope.
3. **Quality gates** (SPEC §8): Go `staticcheck` + `gocyclo ≤10/15`; TS `eslint`
   complexity ≤12, `tsc --noEmit` clean; **coverage ≥80% on core packages** (vitest
   thresholds enforce); corpus parity TS⇄Go is a CI gate.
4. **No unverified claims**: every "done" statement cites the command that proves it
   (test run, e2e pass, screenshot review). Mark unverified work as such.
5. **Storage stays browser-local.** Any change that adds a network call (beyond static
   asset load) violates SPEC FR-S1/N7 — reject in review. E2E no-network test is the
   enforcement.
6. **Docs stay human-readable.** agents.md and docs/ are written for people first;
   agent-optimized pointers secondary. No IcePanel URLs in docs (name-as-inspiration
   only).
7. **Architecture docs are written in PanelCraft itself** (SPEC §14): all architecture
   diagrams live as `.pcd` files under `docs/architecture/` — never ASCII/Mermaid art
   in Markdown. They are corpus seeds; keep them grammar-valid (FILE-FORMAT.md) and
   re-validate via `panelcraft validate docs/architecture` once M1 lands. Prose docs
   stay Markdown; normative content never lives in a picture alone.
8. **No external dependencies at runtime, no CDN — ever** (SPEC N7/N11): no external
   origins, no webfonts, no CDN scripts; everything inlined in the bundle / Go binary.
   Build works offline after one-time `npm ci` + `go mod download`. CI asset-origin
   scan (`scripts/check-selfcontained.sh`) + network-blocked e2e are the gates — a PR
   adding an external URL to a resource load must be rejected.

## Commands

```bash
# web
npm ci                       # install (lockfile committed)
npm run dev                  # vite dev server :5173
npm run check                # tsc + eslint (CI gate)
npm test                     # vitest run + coverage thresholds
npm run e2e                  # playwright (build first: npm run build)
npm run build                # static bundle → web/dist

# go
go build ./...               # bin: panelcraft (embeds web/dist — build web first)
go test ./...                # unit + corpus parity
go vet ./... && staticcheck ./...
gocyclo -over 15 cmd internal web && echo OK   # CI fails >15; target ≤10
                                               # (scoped: node_modules ships Go code)

# cli smoke
panelcraft validate testdata/corpus
panelcraft convert testdata/corpus/checkout.pcd -o /tmp/x.pcd
panelcraft serve --addr :8080 --open
```

## Definition of done (per task)

- [ ] Real check run and pasted as evidence (not "should pass")
- [ ] Coverage gate green for touched packages
- [ ] Complexity gates green (no new `// rationale:` exceptions without ADR)
- [ ] E2E scenario green if UI-touching; screenshots captured
- [ ] **Vision review pass if UI-touching**: screenshots reviewed against
      docs/STYLE-GUIDE.md checklist; defects filed or fixed (SPEC §8.4)
- [ ] Docs updated (SPEC/FILE-FORMAT/ARCHITECTURE/CHANGELOG as applicable)
- [ ] GPL headers present on new files

## Working conventions

* **Small diffs, one concern per change.** No opportunistic cleanup, no drive-by
  reformatting.
* **SOLID**: engine packages depend on interfaces (ports), not concrete impls
  (LayoutEngine, Storage, Clock, AnimPlayer are ports). See docs/ARCHITECTURE.md.
* **Parser changes**: touch `engine/format` + golden corpus in the same change; run
  parity both sides before pushing. Never hand-edit `*.ir.json` goldens — regenerate
  via `npm run corpus:accept` / `go run ./internal/corpus -accept` and diff-review.
* **Tests**: unit-test the failing behavior first (test-first for bugfixes); no test
  weakening to get green; flaky test = fix root cause, no retries/skips.
* **Commits**: imperative subject ≤72 chars, body explains *why*; reference FR-/SPEC-§.
* **Branches**: `feat/<milestone>-<slug>`, PRs into `main`; CI must be green before
  merge (no direct pushes to main).

## E2E + vision loop (UI work)

1. Implement → `npm run build` → `npm run e2e` (Playwright chromium).
2. Screenshot baselines land in `e2e/__screenshots__/`; review diffs deliberately.
3. Open the app (dev server or built dist) via browser automation; capture milestone
   screenshots (light+dark).
4. Review screenshots vs STYLE-GUIDE checklist (alignment, contrast, spacing, empty
   states, animation end states). File defects with screenshot refs; fix; re-shoot.
5. Record review outcome in milestone log (docs/milestones/M< n >.md).

## Repo map (who owns what)

| Path | Contents |
|---|---|
| `web/src/engine/format` | PDL parser/printer, mermaid converters (TS) |
| `web/src/engine/model` | IR types + operations, validation |
| `web/src/engine/{render,layout,flows,anim}` | SVG engine, dagre port, step machine |
| `web/src/workspace` | virtual FS, ZIP, IDB store, undo |
| `web/src/ui` | Preact components, panels, dialogs |
| `cmd/panelcraft` | Go CLI entry (serve/validate/convert/render) |
| `internal/{ir,pdl,server,render}` | Go IR codec, PDL parser, embedded server, chromedp render |
| `testdata/corpus` | golden .pcd + .ir.json (shared TS/Go) |
| `e2e` | Playwright specs + screenshots |
| `docs/architecture` | PDL workspace: PanelCraft's own architecture diagrams (corpus seeds) |
| `docs` | SPEC, IMPLEMENTATION-PLAN, FILE-FORMAT, STYLE-GUIDE, milestones, adr/ |

## When stuck (debug protocol)

1. Reproduce with the smallest failing command/test; state exact output.
2. One hypothesis at a time; instrument, don't speculate-edit.
3. Two failed fix attempts on the same bug ⇒ stop, write up findings
   (attempts + evidence), top-2 hypotheses + discriminating test, ask for review.
4. Never weaken tests, never hard-code around failures you haven't explained.
