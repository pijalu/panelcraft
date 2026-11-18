# agents.md — PanelCraft

Agentic development conventions for this repository. **Humans:** this file is also for
you — it is the contributor handbook in condensed form. Full product spec:
[docs/SPEC.md](docs/SPEC.md). Format spec: [docs/FILE-FORMAT.md](docs/FILE-FORMAT.md).

For UI design, implementation, and screenshot review, load the
[Laws of UX skill](.agents/skills/laws-of-ux/SKILL.md). Its workflow covers accessibility,
reduced motion, responsive behavior, privacy, and the style guide; load only the individual
law references relevant to the interaction under review.

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
   only). Write the meaning, never just a code — see "Identifiers in this repo" below.
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

## Identifiers in this repo

Short tags (`M7`, `WP13`, `F-24`, `FR-K3`, `N7`, `SPEC §8.5`, `CX-04`…) are addresses,
not explanations. A reader of a commit message, a code comment or a page of docs has
not memorised `docs/SPEC.md`, so **the sentence must stand on its own and the tag, if it
helps, comes after it**. Written out, they mean:

| Tag | What it points at |
|---|---|
| `M<n>`, `M<n>-WP<n>` | Milestone and one of its work packages — `docs/milestones/` |
| `WP<n>`, `UX<n>-WP<n>` | Numbered work package inside a milestone brief |
| `F-<nn>` | Numbered finding/feature item of the implementation plan |
| `FR-<x><n>` | Functional requirement in `docs/SPEC.md` |
| `N<nn>` | Non-negotiable constraint in `docs/SPEC.md` |
| `SPEC §n.m` | Section of `docs/SPEC.md` |
| `CX-<nn>`, `UX-<nn>`, `FLOW-<nn>`, `DOC-<nn>` | Closed work item, write-up in `docs/archive/` |

Good: "offline-only rule — no runtime network calls besides static assets".
Bad: "see N7". `bash scripts/check-jargon.sh <base-ref>` fails a change that adds a
bare tag without the words around it.

## Commands

```bash
# gates that must also stay green after a format/IR change
bash scripts/check-docs.sh        # doc links + every ```pcd fence parses
bash scripts/check-repo-clean.sh  # no generated content tracked / dirty worktree
node scripts/corpus-accept.mjs    # regenerate corpus + TS/Go parity fixtures
npm run check && npx vitest run && npx playwright test && go test ./...

# web
npm ci                       # install (lockfile committed)
npm run dev                  # vite dev server :5173
npm run check                # tsc + eslint (CI gate)
npm test                     # vitest run + coverage thresholds (perf files
                             # excluded: budgets are measured uninstrumented)
npm run test:perf            # N1–N4 perf budgets, no coverage instrumentation
npm run e2e                  # playwright (build first: npm run build — the
                             # webServer runs `npm run preview` on the EXISTING
                             # dist, so a stale bundle silently tests old code)
npm run e2e:hosted           # hosted smoke: items 7–16 against the DEPLOYED site
                             # (HOSTED_URL=… EXPECTED_BUILD_SHA=… ; fresh profile
                             # + a client with the service worker installed)
node scripts/hosted-evidence.mjs --url <site> --dist web/dist \
  --expect-sha <sha>         # deployment evidence: served SHA + asset hashes
npm run build                # static bundle → web/dist (also writes
                             # build-info.json + the panelcraft-build meta tag)

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
- [ ] Format changes landed atomically: parser + printer + IR + `FILE-FORMAT.md`
      + corpus regeneration (`node scripts/corpus-accept.mjs`) + Go parity
- [ ] e2e goldens only via `UPDATE_GOLDENS=1`; run artefacts go to `test-results/`
- [ ] Release change: `npm run e2e:hosted` green against the deployed URL, and
      `scripts/hosted-evidence.mjs` passed for the published SHA (a green deploy
      job alone proves nothing about which revision is served)
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
* **Commits**: imperative subject ≤72 chars, body explains *why* in plain words. A
  short pointer to the spec is fine as an addition, never as the explanation.
* **Branches**: `feat/<milestone>-<slug>`, PRs into `main`; CI must be green before
  merge (no direct pushes to main).

## E2E + vision loop (UI work)

1. Implement → `npm run build` → `npm run e2e` (Playwright chromium).
2. **Screenshot policy (F-09).** Every run writes captures to
   `test-results/screenshots/` (gitignored artifact) — a full `npm run e2e` must
   leave `git status --porcelain` empty (`scripts/check-repo-clean.sh --worktree`
   enforces it locally and in CI). Curated, reviewable captures live in
   `e2e/goldens/` and are refreshed **only** with
   `UPDATE_GOLDENS=1 npm run e2e` — that diff is part of the commit under review.
   Nothing compares a curated capture automatically, so a stale one stays stale
   silently: a change that moves the shell (top bar, panel rails, tab strip,
   canvas chrome) re-shoots them in the same change.
   Generated `dist/**` is never committed (the root `dist/release` dry-run
   binaries were untracked in F-09; purge older history with
   `git filter-repo --path dist --invert-paths` if the repository size matters,
   then force-push the rewritten branch — coordinate first, it rewrites SHAs).
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
| `e2e` | Playwright specs + curated goldens (`e2e/goldens/`) |
| `e2e-hosted` | Hosted smoke specs: items 7–16 against the deployed site, fresh + upgrading client |
| `scripts/hosted-evidence.mjs` | Deployment evidence: served SHA, asset hashes, provenance record |
| `docs/architecture` | PDL workspace: PanelCraft's own architecture diagrams (corpus seeds) |
| `docs` | SPEC, IMPLEMENTATION-PLAN, FILE-FORMAT, STYLE-GUIDE, milestones, adr/ |

## When stuck (debug protocol)

1. Reproduce with the smallest failing command/test; state exact output.
2. One hypothesis at a time; instrument, don't speculate-edit.
3. Two failed fix attempts on the same bug ⇒ stop, write up findings
   (attempts + evidence), top-2 hypotheses + discriminating test, ask for review.
4. Never weaken tests, never hard-code around failures you haven't explained.
