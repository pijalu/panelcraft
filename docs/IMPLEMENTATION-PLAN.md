# PanelCraft — Implementation Plan

**Status:** Active · maps SPEC §9 milestones to concrete work packages (WP)
**Conventions:** branch `feat/<milestone>-<slug>`, DoD + gates per [../agents.md](../agents.md),
progress log per milestone in `docs/milestones/M<n>.md`.
**Reading guide:** WP ids are stable references (`M2-WP6`); commit messages cite them.
Every WP ends with the standard DoD checklist — only WP-specific acceptance is listed here.

Estimates are ideal-dev days for one contributor; parallelization notes where two tracks
can overlap without merge pain.

---

## 1. Sequencing overview (critical path)

```
M0 scaffolding ──► M1 format engine ──► M4 code view ──► M5 flows ──► M7 hardening
        │                │            ▲
        │                ├──► M2 canvas MVP ──► M5
        │                └──► M3 workspace ──► (M4 zip IO ties in)
        └── docs/style guide feed every milestone vision review
```

* **Critical path:** M0 → M1(WP1.1–1.3) → M2 → M5 → M7.
* **Parallelizable:** M3 (workspace/storage) can run parallel to M2-tail/M4-head by a
  second track — contract: `workspace/fs` API frozen at end of WP3.1.
* **Hard dependency:** `engine/model` IR types (WP1.1) are consumed by parser, renderer,
  flows, storage — nothing UI-side starts before they exist.

| M | Theme | Est. | Exit evidence (SPEC §9) |
|---|---|---|---|
| M0 | Repo, CI, shells | 3–5 d | CI green; S7 skeleton passes |
| M1 | Format engine + CLI core | 8–10 d | corpus parity green both sides |
| M2 | Canvas MVP | 8–10 d | S1 e2e + vision pass |
| M3 | Workspace + storage | 5–7 d | S4 e2e (zip round-trip) |
| M4 | Code view + mermaid export | 5–7 d | S2 e2e |
| M5 | Flows + animation | 8–10 d | S3 e2e + vision pass |
| M6 | Views/tags/layout/search | 5–7 d | FR-V*, FR-W6/W7 e2e |
| M7 | Hardening + release | 8–10 d | all NFRs measured; v1.0 |

---

## 2. M0 — Scaffolding (week 1)

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M0-WP1 | Repo init: real GPL-3.0 LICENSE (replace placeholder), .gitignore, go.mod, npm layout, empty dirs per repo map | root, `web/`, `cmd/`, `internal/`, `testdata/corpus`, `e2e/`, `docs/milestones/` | tree matches repo map; LICENSE = canonical text |
| M0-WP2 | Web build: vite + preact + TS strict, eslint (complexity rules), vitest + coverage thresholds config (core 80%, `ui/*` 60% reported), scripts `dev/build/check/test/e2e/corpus:accept` | `web/`, `package.json`, `tsconfig*`, `eslint.config.*`, `vitest.config.*` | `npm run check` + `npm test` green (thresholds active, suites may be empty-but-annotated) |
| M0-WP3 | Go shell: `cmd/panelcraft` serve/version; `internal/server` with `go:embed web/dist`, SPA fallback, security headers (CSP, X-Content-Type-Options), read-only `/files/*` mount; dev-mode flag (serve from disk) | `cmd/panelcraft/`, `internal/server/` | `go test ./...` (httptest: fallback, headers, no-write assertion); `go vet` + `staticcheck` clean |
| M0-WP4 | CI: `ci.yml` stages (lint-go → lint-web → test-go → test-web → build → asset-origin scan → e2e-smoke → visual-harness noop), `pages.yml` stub, `release.yml` stub; gocyclo/staticcheck steps; `scripts/check-selfcontained.sh` (N7/N11 gate) | `.github/workflows/`, `scripts/` | one green full pipeline run on scaffold PR |
| M0-WP5 | Playwright scaffold: config (chromium), S7 smoke spec — app loads with **all external requests blocked** (also proves N7), screenshot harness (light+dark) + pixelmatch util | `e2e/` | smoke spec green locally + CI |
| M0-WP6 | STYLE-GUIDE.md: tokens (palette dark/light, 4 px spacing grid, type scale, shape language, motion durations 150–300 ms), screenshot checklist for vision reviews | `docs/STYLE-GUIDE.md` | checklist referenced by e2e vision loop |
| M0-WP7 | Docs wiring: ARCHITECTURE.md prose skeleton (ports rule, package map — details evolve per milestone), milestone log template, CHANGELOG init | `docs/` | SPEC related-docs links resolve |

**Acceptance (exit):** full CI green end-to-end; `panelcraft serve` serves empty app;
S7 skeleton passes with network blocked; asset-origin scan green.

---

## 3. M1 — Format engine (weeks 2–3) — critical path

Order matters inside M1: schema freeze before parser; parser before printer; Go port
mirrors TS (parity from day one, not ported later).

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M1-WP1 | **IR schema freeze**: JSON IR types (TS `types.ts` + Go `internal/ir` structs), schema doc updated in FILE-FORMAT §7, versioning rule (`irVersion`), golden JSON shape fixed | `web/src/engine/model/`, `internal/ir/` | type-level tests; both compilers strict-clean |
| M1-WP2 | PDL lexer+parser (TS): line/block structure, `line:col` positions, error policy (syntax aborts file; semantic defers to validation pass) | `web/src/engine/format/` | table-driven unit tests incl. every FILE-FORMAT §10 code trigger |
| M1-WP3 | Canonical printer (TS): section order, quoting, id-emit rule (§11); property test `print∘parse∘print` idempotent (fast-check fuzz) | `web/src/engine/format/` | fuzz suite in `npm test` (seeded, deterministic) |
| M1-WP4 | IR ops + semantic validation (TS): ref resolution, import cycle detect, P1xx/P2xx rules with positions | `web/src/engine/model/` | unit tests per rule P100–P204 |
| M1-WP5 | Mermaid flowchart import converter (TS): shape→kind table, subgraphs→groups, chained/`&` edges, diagnostics for unsupported | `web/src/engine/format/` | mapping-table golden tests (each mermaid sample → expected IR) |
| M1-WP6 | Mermaid C4 import converter (TS): `System*`/`Container*`/`Rel*` subset; `Show*/Update*` → info diagnostics | `web/src/engine/format/` | golden tests per C4 statement family |
| M1-WP7 | **Go parser + printer + IR codec port** (`internal/pdl`): same grammar tables, same error codes | `internal/pdl/`, `internal/ir/` | mirror of WP2–WP4 test tables (shared JSON test fixtures) |
| M1-WP8 | **Corpus infrastructure**: seeds ≥15 files now (docs/architecture/*.pcd + FILE-FORMAT §14 checkout example + 4 mermaid samples + 3 C4 samples + error cases), generator `corpus:accept` both sides, `.ir.json` goldens + canonical `.pcd` per file | `testdata/corpus/`, scripts | parity job: TS IR vs Go IR byte-equal on every corpus file |
| M1-WP9 | CLI `validate` + `convert`: flags (`--json`), exit codes 0/1/2, multi-file/dir globbing, CI integration validating `docs/architecture` | `cmd/panelcraft/` | Go tests (tmpdir fixtures); docs workspace validates exit 0 (fix seeds if grammar errata needed) |
| M1-WP10 | Grammar errata loop: ambiguities found → FILE-FORMAT updates + corpus case added in same change | `docs/FILE-FORMAT.md`, corpus | doc/example parity test (§14 example parses to its golden) |

**Acceptance:** corpus green TS+Go, parity diff empty; `panelcraft validate
docs/architecture` exit 0; coverage `engine/format`+`engine/model` ≥80%; FR-M1/M2
unit-complete. **Grammar freeze** at end of M1 (post-freeze changes = errata process).

---

## 4. M2 — Canvas MVP (weeks 3–5)

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M2-WP1 | Viewport: transform model, pointer/wheel input controller, zoom limits, keyboard map skeleton | `web/src/engine/render/`, `web/src/ui/` | math unit tests (screen⇄canvas transforms) |
| M2-WP2 | Scene graph → SVG renderer: layers (links/objects/overlay), diff-patch updates, stable id→DOM map | `web/src/engine/render/` | jsdom snapshot tests; re-render count assertions |
| M2-WP3 | Hit-testing + selection: single, shift-multi, rubber band, z-order | `web/src/engine/render/` | hit-list unit tests (overlaps, group bounds) |
| M2-WP4 | Drag/resize + snapping + alignment guides; grid toggle | `web/src/engine/render/`, `ui/` | unit tests (snap math, guide triggers) |
| M2-WP5 | Shape set: person glyph, system/container/component rects, datastore cylinder, queue, note, group boundary — theme tokens only (no hard-coded colors) | `web/src/engine/render/`, theme css | per-shape snapshot tests light+dark |
| M2-WP6 | Link UX: halo drag→hover→commit; typed link default `uses`; orthogonal router v1 (segment utils), arrowheads, label placement; **timebox**: if router quality stalls → curved-only fallback + decision note in milestone log | `web/src/engine/render/` | router unit tests (routes around trivial overlaps); manual vision check |
| M2-WP7 | Properties panel: object/link editing bound to IR ops (WP-M1-4) | `web/src/ui/` | component tests (@testing-library/preact) |
| M2-WP8 | Undo/redo command stack + coalescing (drag/typing) | `web/src/workspace/` | unit tests (coalesce windows, 100-step cap) |
| M2-WP9 | Palette: stencil drag-drop + click-to-place + `1..9` quick-add | `web/src/ui/` | component tests; e2e drag-drop |
| M2-WP10 | **S1 e2e** (create flow end-to-end) + screenshots + **vision review round 1** vs STYLE-GUIDE; perf baseline: 300-object synthetic scene pan/drag timing recorded vs N1 | `e2e/`, `docs/milestones/M2.md` | S1 green; perf numbers logged |

**Acceptance:** S1 e2e + vision pass; complexity gates green; coverage `engine/render` +
`workspace/undo` ≥80%.

---

## 5. M3 — Workspace & storage (weeks 5–6; parallel track)

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M3-WP1 | Virtual FS ops (create/rename/move/delete/duplicate, path utils) + file tree UI + tabs; **API freeze** here (enables parallel track) | `web/src/workspace/`, `ui/` | unit tests incl. path edge cases (traversal guard) |
| M3-WP2 | IDB store: debounced autosave (800 ms), `irVersion`-keyed schema + forward-only migrations, Storage **port** with in-memory fallback | `web/src/workspace/store` | fake-indexeddb tests: save/load/migrate/corrupt-db path |
| M3-WP3 | ZIP pack/unpack: owned container code over `CompressionStream`/`DecompressionStream`; lazy fflate fallback behind feature detect; manifest `panelcraft.workspace.json` | `web/src/workspace/zip` | round-trip tests (nested dirs, unicode names, empty dirs); fallback unit test with mocked API absence |
| M3-WP4 | Per-file IO: import `.pcd/.mmd/.txt`, export `.pcd/.mmd/.svg/.png` (SVG serialize from renderer; PNG via OffscreenCanvas) | `web/src/workspace/`, `engine/render` | export golden tests; e2e download assertions |
| M3-WP5 | **S4 e2e**: workspace zip export → clear storage → import → identical; quota-error path (mocked IDB throw → ephemeral + banner); ephemeral mode toggle | `e2e/` | S4 green; FR-S2/S3 asserted |

**Acceptance:** S4 green; FR-W1–W5; FR-S1–S4 unit-covered.

---

## 6. M4 — Code view & mermaid export (weeks 6–7)

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M4-WP1 | CodeMirror 6 component: PDL mode (tokenizer for highlight), gutter diagnostics, theme tokens light/dark | `web/src/ui/codeview/` | component tests; snapshot of highlight classes |
| M4-WP2 | **Sync state machine**: canvas→code (debounce 150 ms printer render) and code→canvas (parse-on-idle; error state never clobbers buffer); explicit states `clean/editing/error/pending-apply`; transitions unit-tested (this is the bug-prone core — test-first) | `web/src/ui/codeview/`, `workspace/` | exhaustive transition tests; property test: valid text always converges to IR |
| M4-WP3 | Diagnostics mapping: parser `line:col` → CM marks + problems panel; click-through focus | `ui/`, `engine/format` | unit tests position mapping |
| M4-WP4 | Format-on-save (printer hook) + diverged-buffer prompt (apply/discard on close) | `ui/`, `workspace/` | e2e: type garbage → save blocked → apply/clear |
| M4-WP5 | Mermaid exporter (`--mmd` semantics from FILE-FORMAT §9): kind→shape inverse map, tag→classDef, declared feature drop; golden `.mmd` outputs per corpus file | `web/src/engine/format/` | golden export tests; exported text re-imports losslessly-to-declared-subset (property test) |
| M4-WP6 | **S2 e2e** (mermaid paste → canvas → canvas edit → code updates) | `e2e/` | S2 green |

**Acceptance:** S2 green; FR-K1–K5; FR-M4/M5 goldens committed.

---

## 7. M5 — Flows & animation (weeks 7–9) — flagship

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M5-WP1 | Step machine (engine/flows): normalize steps, resolve refs (msg→link pair, `as` disambiguation, `flip`), playback **plan** builder (per-step actor sets, camera targets, dim sets) — pure, testable | `web/src/engine/flows/` | unit tests all 8 types incl. nested alt/par, goto resolution same-file+cross-file |
| M5-WP2 | Anim engine (engine/anim): WAAPI orchestration, token travel via `getPointAtLength` + trailing dash, emphasis ring, dim sets, reduced-motion crossfade variant; **Clock/AnimPlayer ports** (injectable timers → deterministic tests) | `web/src/engine/anim/` | plan-snapshot tests; timed tests with fake clock; reduced-motion path test |
| M5-WP3 | Camera controller: smooth pan/zoom-to-actors (300 ms ease), fit-step, exit-restore of pre-play viewport | `engine/render` | unit tests (target computation), e2e visual end-states |
| M5-WP4 | Flow editor UI: flow list, step list reorder (drag), per-type inspectors (alt branches editor, par lanes, goto picker w/ file+flow) | `web/src/ui/` | component tests per inspector |
| M5-WP5 | Play mode UI: transport (play/pause/step±/restart), step number badges, alt branch chooser, breadcrumb for goto, ARIA live narration hook (text ready for M7 a11y) | `web/src/ui/` | component tests; keyboard control tests |
| M5-WP6 | Icon set: inline SVG, GPL-compatible sources (license check recorded per ADR-0005), `icon` property pipeline to renderer | `assets/icons/`, `engine/render` | license note in milestone log; render snapshot per icon |
| M5-WP7 | Theme polish both modes; timing constants moved to theme config | theme css/tokens | visual diff baselines refresh |
| M5-WP8 | **S3 e2e** (6-step flow incl. alt choice + par concurrency assertions) + **vision review round 2** | `e2e/`, `docs/milestones/M5.md` | S3 green |

**Acceptance:** S3 green; FR-F1–F6; all timings from theme; reduced-motion asserted.

---

## 8. M6 — Views, tags, layout, search, snapshots (weeks 9–10)

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M6-WP1 | Tags + filter bar + fade rendering (tag fade = render-layer opacity anim) | `engine/render`, `ui/` | unit + visual tests |
| M6-WP2 | Named views: store/switch, `hide tag`/`hide id`, saved positions, `pin`; default implicit view | `engine/model`, `ui/` | unit tests view apply/remove |
| M6-WP3 | Auto-layout: dagre adapter behind LayoutEngine port; deterministic ordering (stable id sort); "apply layout to file" commit writes positions back | `engine/layout/` | determinism tests (same input → same output across runs); pin-handling tests |
| M6-WP4 | Dependencies view: incoming/outgoing highlight + list panel, click-through | `ui/`, `engine/model` | unit tests adjacency; component tests |
| M6-WP5 | Quick search `Ctrl+P`: files/objects/flows fuzzy; jump-to (opens file, selects object) | `ui/` | component tests |
| M6-WP6 | Snapshots: named workspace snapshots in IDB, restore, prune | `workspace/store` | unit tests incl. versioned restore |
| M6-WP7 | Optional: flow→`sequenceDiagram` export (`.seq.mmd`) — **drop to backlog without ceremony if M5/M6 schedule slips** | `engine/format` | golden tests |
| M6-WP8 | e2e additions (tag filter, view switch, layout determinism smoke) + **vision review round 3** | `e2e/`, milestone log | green |

**Acceptance:** FR-V1–V4, FR-W6/W7; M6-WP7 optional by design.

---

## 9. M7 — Hardening & release (weeks 10–12)

| WP | Task | Touched paths | Evidence / tests |
|---|---|---|---|
| M7-WP1 | A11y pass: keyboard-only editing audit (tab order, canvas nav, dialogs focus trap), ARIA live narration wired to play mode, contrast audit both themes (automated axe run + manual) | `ui/`, `engine/` | axe e2e suite green; checklist in milestone log |
| M7-WP2 | Perf: profile vs N1/N2/N3; implement layer virtualization + offscreen culling **only if** budgets missed; benchmark suite wired to CI (warn) | `engine/render` | before/after numbers logged; budgets met evidence |
| M7-WP3 | Service worker offline shell (app + assets; never user data), update flow | `web/` | e2e offline reload test |
| M7-WP4 | Security audit: CSP final, SVG export sanitizer + fuzz tests (labels with scripts/entities), CLI path-traversal tests | `engine/render`, CLI | fuzz suite green; header tests |
| M7-WP5 | Docs complete: README final, ARCHITECTURE.md prose finished, user guide (create/edit/flows/CLI), CLI reference, CHANGELOG | `docs/` | links resolve; examples validated by CLI |
| M7-WP6 | Release engineering: `release.yml` binary matrix (linux/darwin/windows × amd64/arm64, CGO off) + checksums; `pages.yml` live; version stamping (`panelcraft version` embed); boot-smoke each OS in CI | workflows, `cmd/` | artifacts attached to test release; pages URL serves app offline-capable |
| M7-WP7 | v1.0: corpus freeze, final vision review round (all screenshots), milestone retro, backlog groom (SPEC §12) | docs | tag `v1.0.0`; release notes cite commit |

**Acceptance:** SPEC §9 M7 row fully evidenced; all scenarios S1–S7 green in CI.

---

## 10. Cross-cutting execution rules

1. **WP-sized PRs**: one WP (or coherent slice) per PR; commit subject cites WP id.
2. **Corpus discipline**: any grammar/parser change ships with corpus cases + parity
   green both sides in the same PR (agents.md parser rule).
3. **Vision reviews** are scheduled, not aspirational: rounds at M2-WP10, M5-WP8,
   M6-WP8, M7-WP7 — screenshot set ≤12 per round (light+dark), findings logged in
   `docs/milestones/M<n>.md` with defect refs.
4. **Budget checkpoints**: perf baselines at M2-WP10 and M7-WP2 — regressions block
   milestone exit, not silently deferred.
5. **Schedule slip protocol**: cut in order — (a) M6-WP7 optional, (b) M6-WP4/WP5
   scope-reduce, (c) M7-WP3 (offline SW) to v1.1 — never cut M5 flows or storage
   durability; scope cuts require SPEC §12 backlog entry.
6. **Errata**: FILE-FORMAT is living spec during M1 only; post-freeze changes via
   errata section + corpus case.

## 11. Execution risk register

| Risk | Signal | Response |
|---|---|---|
| Grammar churn in M1 | frequent FILE-FORMAT edits | spike week: parse 30 real-world-ish diagrams before freeze (WP10 loop) |
| Orthogonal router quality | manual routes look bad in vision round 1 | timeboxed WP2-M2-6; fallback curved-only v1, decision note |
| dagre nondeterminism | flaky layout tests | pin version, stable sort pre/post; last resort: own layered layout (backlog) |
| chromedp CI flakiness | render smoke red on CI only | pinned chrome container; local-vs-CI parity check in WP M0-WP4 |
| Sync state machine bugs (M4-WP2) | code/canvas divergence reports | test-first mandate; property tests; if >2 fixes on same transition → redesign transition table |
| Vision loop cost | reviews skipped under pressure | fixed screenshot set, calendar-boxed rounds, findings are merge-blocking at round gates |
| Storage data loss reports | users lose workspace | export reminders (FR-S2) land with M3, not deferred; snapshots (M6-WP6) |

---

## 12. Post-v1 UX-08 — application experience and storytelling

The goal-level index and **15 standalone, single-task work-package briefs** live in
[milestones/UX08.md](milestones/UX08.md). UX-08 is **proposed, not implemented**. Assign one
brief per agent/PR; the brief contains its requirement, evidence, implementation steps,
dependencies, focused checks and acceptance criteria. Do not replace the briefs with a monolithic
shell/canvas/flow change.
