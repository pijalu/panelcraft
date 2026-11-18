# PanelCraft — Product & Technical Specification

**Repository:** https://github.com/pijalu/panelcraft
**Version:** 1.0-draft · **Status:** Approved for implementation (M0)
**Related docs:** [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) · [FILE-FORMAT.md](FILE-FORMAT.md) · [architecture/](architecture/) (PDL workspace, see §14) · [../agents.md](../agents.md) · ADRs in [adr/](adr/)

---

## 1. Summary

PanelCraft is a client-only web application for creating, editing, animating and sharing
software architecture diagrams, inspired by IcePanel (inspiration only — no affiliation,
no links in documentation):

* **WYSIWYG canvas editor** — drop components, draw typed connections, edit properties inline.
* **Code view** — the diagram source is always visible, editable and the single source of
  truth; canvas ⇄ code stay synchronized (mermaid-flavored text format with extensions).
* **Mermaid interop** — imports mermaid `flowchart` and C4 diagrams via converter;
  exports to mermaid with declared feature drop. The native grammar is its own —
  *inspired by* mermaid, not bound to its syntax.
* **Flows & animation** — IcePanel-style step-by-step flow playback (8 step types) over
  static diagrams.
* **Workspace** — multiple files, directory tree, per-file import/export, full ZIP
  export/import.
* **Zero server storage** — everything lives in the browser; nothing is sent anywhere.
* **Shipable two ways** — fully static on GitHub Pages, *and* as a single Go binary
  (Windows/Linux/macOS) that serves the app plus a headless CLI (`validate` / `convert`
  / `render`).

### Out of scope (explicitly)

Real-time collaboration, authentication, server-side persistence, AI assistance, mobile
native apps. Full mermaid feature coverage (only the subset in [FILE-FORMAT.md](FILE-FORMAT.md)).

---

## 2. Decisions locked with product owner

| # | Decision | Choice |
|---|----------|--------|
| D1 | Model topology | **Hybrid**: files are standalone diagrams; objects may reference other files via `imports` (link-style reuse) |
| D2 | Rendering | **Custom SVG engine**; mermaid.js is *never* the editor renderer — mermaid is import/export text format only |
| D3 | Go binary role | Static app server **+ headless CLI** (`validate`, `convert`, `render` via headless Chrome) |
| D4 | Frontend stack | **Preact** for UI chrome + framework-agnostic TypeScript SVG engine |
| D5 | Flows | **All 8 IcePanel step types in v1** (see §7) |
| D6 | Quality gates | Go: `staticcheck` + `gocyclo`; JS: `eslint` (incl. complexity rules) + `vitest`, **≥80% coverage on core packages**; E2E: **Playwright + vision review in dev loop** |
| D7 | Native file format | Own `.pcd` grammar, mermaid-**inspired**; **no mermaid-validity requirement**. Mermaid handled by import converter and lossy exporter only |
| D8 | License | **GPL-3.0-only** (SPDX `GPL-3.0-only`), LICENSE file at repo root |

Rationale for each: ADR 0001–0005.

---

## 3. Users & key scenarios

**Persona A — Architect (author).** Maintains a workspace of diagrams describing a
system landscape. Creates diagrams visually, refines them in code view, animates flows
to explain request journeys.

**Persona B — Reviewer (reader).** Opens a shared `.pcd` file or ZIP, walks flows in
play mode, exports PNG/SVG for docs.

**Top scenarios (must work end-to-end):**

1. *S1 Create*: new file → drag person/system/container onto canvas → link them → set
   properties → diagram renders live; code view shows updated source.
2. *S2 Code round-trip*: paste a mermaid `C4Container` snippet into code view → canvas
   renders it → edit node in canvas → code view updates; file remains valid mermaid
   (PanelCraft extensions live in comment block).
3. *S3 Flow playback*: define 6-step flow (incl. one `alt`, one `par`) → press Play →
   camera focus + animated edges step-by-step; non-active elements dim.
4. *S4 Workspace IO*: build directory tree `landscape/`, `systems/billing/` → export ZIP →
   clear browser data → import ZIP → identical workspace.
5. *S5 Mermaid import*: open `architecture.mmd` (flowchart + subgraphs) → converted to
   `.pcd`, auto-laid-out, fully editable.
6. *S6 CLI*: `panelcraft validate ./diagrams` lints all files (CI gate);
   `panelcraft render checkout.pcd --out checkout.png` produces a PNG via headless Chrome.
7. *S7 Static hosting*: open the GitHub Pages URL → full functionality offline-capable,
   no backend calls (verified by network monitor in E2E).

---

## 4. Functional requirements

### 4.1 Workspace & files (FR-W)

* **FR-W1** Virtual file tree with folders and `.pcd` files; create, rename, delete,
  move (drag & drop), duplicate. Row actions stay reachable at any panel width: a
  long name wraps to two clamped lines (full name in the tooltip) instead of pushing
  the buttons out of view, and the row offers the same actions in a context menu
  (right-click, `Shift+F10`/context-menu key) for pointer, touch and keyboard use.
* **FR-W2** Multi-tab editing; unsaved-changes indicator; autosave (see FR-S1).
* **FR-W3** Per-file import: `.pcd`, `.mmd`/`.mermaid` (mermaid text), `.txt` (treated as mermaid).
* **FR-W4** Per-file export: `.pcd`, `.mmd` (mermaid subset export), `.svg`, `.png`
  (current view), `.seq.mmd` (flows exported as mermaid `sequenceDiagram`, optional M6).
* **FR-W5** Workspace ZIP export (`workspace.zip`, plain folder layout + optional
  `panelcraft.workspace.json` manifest) and ZIP import; round-trip must be lossless.
* **FR-W6** Global quick search (`Ctrl/Cmd+P`): files, objects, flows (M6).
* **FR-W7** Snapshots: manual named snapshots of the whole workspace, restore point
  (M6, local only).

### 4.2 Canvas editor (FR-C)

* **FR-C1** Pan (space-drag / wheel-drag / trackpad), zoom (wheel/pinch, 10%–400%),
  fit-to-selection, fit-to-diagram, zoom controls, mini-map (M6).
  Secondary (right) and middle mouse-button drags also pan directly; a moved
  secondary drag does not open the context menu.
* **FR-C2** Grid + snap-to-grid (toggleable); alignment guides when dragging. Grid type
  (off/dots/lines) and snapping are independent browser-local editor preferences. A
  profile that has never chosen a grid shows a subtle dots grid with snapping on; a
  saved explicit choice (including off) is preserved across upgrades and never
  overwritten. The grid is editor chrome only (absent from presentation, minimap and
  SVG/PNG/CLI output).
* **FR-C3** Stencil palette (C4 types): Person, Software System, External System,
  Container, Component, Data Store, Queue/Topic, Group/Boundary, Note.
  Drag-drop or click-to-place; one press adds one element. A new element is
  labelled with the first free `Kind n` name for its own kind, counted from 1
  ("Container 1", then "Container 2"), independent of other kinds and of the
  element ids.
* **FR-C4** Objects: select, multi-select (rubber band, shift-click), drag, resize
  (groups/boundaries), rotate *not* supported (C4 shapes are axis-aligned).
* **FR-C5** Inline rename (double-click), description tooltip, icon per object
  (built-in icon set plus document-declared project icons, M5 / FILE-FORMAT §3.1).
* **FR-C6** Properties panel: name, description, technology, tags (multi),
  custom key-value properties, style overrides (fill, border, text color, icon).
* **FR-C7** Connections: drag from port/edge halo to target; typed links
  (`uses`, `includes`, `requests`, `returns`, `publishes`, `subscribes`, `reads`,
  `writes`, `data`, custom); label; direction (uni/bi); arrowhead styles; dashed/solid.
  Double-clicking a link, pressing `Enter` on a single selected link, or right-click →
  **Properties** opens its inspector with focus in the Label field.
* **FR-C8** Edge routing: orthogonal (default), curved (bezier), straight; drag
  waypoints; per-edge style override.
* **FR-C9** Undo/redo (command stack, coalesced typing/drag operations, ≥100 steps),
  full keyboard shortcuts (§10).
* **FR-C10** Context menus: canvas, object, edge (duplicate, delete, bring-to-front,
  add to group, create flow step from link…). Every menu surface — application,
  panel, nested submenu and context menu — shares one contract: placed from measured
  rectangles inside the viewport without covering its trigger, nested surfaces flip
  when the preferred side has no room, overflowing lists scroll internally with a
  visible cue, focused entries scroll into view, and arrows/Home/End/Enter/Escape/Tab
  plus focus restoration behave identically. Frequently used commands stay direct
  while advanced arrangement commands are grouped, never removed.
* **FR-C11** Dependencies view of selected object: highlight incoming/outgoing + list
  panel (M6).
* **FR-C12** Copy/paste/duplicate objects within and across files (internal clipboard;
  cross-file paste resolves missing imports by inlining).

### 4.3 Code view (FR-K)

* **FR-K1** Split layout: canvas + code side-by-side (horizontal or vertical), or
  single-pane toggle. CodeMirror-based editor (see ADR-0004) with PanelCraft syntax
  highlighting.
* **FR-K2** Live two-way sync, debounced (canvas → code ≤150 ms; code → canvas on
  idle/pause or explicit apply if parse errors).
* **FR-K3** Diagnostics: parse/validation errors shown inline (line:col) + problem
  panel; error state never loses user text.
* **FR-K4** Format-on-save (canonical pretty-printer, idempotent).
* **FR-K5** The saved file is the **source of truth**; canvas state is a projection.
  Closing a file with diverged editor buffer prompts to apply/discard.

### 4.4 Mermaid interop (FR-M) — details in FILE-FORMAT.md

* **FR-M1** Import converter, mermaid `flowchart`/`graph` (incl. subgraphs, edge labels,
  shapes) → PDL, with shape→semantic-type mapping (documented table) and auto-layout.
* **FR-M2** Import converter, mermaid C4 (`C4Context`, `C4Container`, `C4Component`,
  `C4Dynamic` incl. `System*`, `Container*`, `Rel*`, `Deployment*` subset) → PDL
  objects/links; `Show*`/layout directives ignored.
* **FR-M3** Import converter, mermaid `sequenceDiagram` → optional conversion to a Flow
  over participant boxes (M6).
* **FR-M4** Export to mermaid (`flowchart`): nodes, typed edges, labels, subgroups;
  **feature drop is declared and documented** — flows/animations, manual positions
  (replaced by auto-layout), styles (approximated by mermaid classes), properties,
  imports are not representable. Export is one-way; PDL remains the only source of truth.
* **FR-M5** Import diagnostics: unsupported mermaid constructs reported with line:col;
  conversion never silently drops content. Export fidelity matrix documented (FR-M4).
* **FR-M6** No mermaid-validity requirement on `.pcd` files; mermaid compatibility is
  converter-only, in both directions.

### 4.5 Flows & animation (FR-F)

IcePanel-style visual storytelling over the static diagram.

* **FR-F1** Multiple named flows per diagram; flow editor: ordered step list, drag to
  reorder, per-step title + description. A flow carries its own one-line `description`,
  an optional atomic multiline Markdown `descriptionLines` block and a `presentation`
  flag for showing those notes during playback; each step may carry its own `description`.
  All of them live in the file (IR v8/v13), never in a UI-only store.
  The step list shows the flow — order, type, title, participants, play and
  duplicate — and the selected step's properties (type and description, camera,
  playback, the connector animation its link shares, advanced fields) are edited
  in the Properties panel, which also shows the flow's own properties when the
  flow rather than a step is selected. A flow selection and a canvas selection
  are mutually exclusive: picking a step clears the canvas selection and pressing
  the diagram clears the step.
  A document with connections and no authored flow has a virtual default
  flow derived from those connections (stable topological order, labels and parallel links
  preserved, creation order as the cycle fallback). It is never persisted: opening,
  presenting, saving and reloading leave the file unchanged, and the first explicit edit
  materialises it as one undoable command. An authored flow is always authoritative.
* **FR-F2** Step types (all in v1):
  | Type | Meaning | Visual behavior |
  |---|---|---|
  | `intro` | Set the scene | Show all steps overview; no dimming |
  | `msg` | Message A→B over existing link (direction may be flipped for the step) | Animated moving token along edge, step number badge, focus both ends |
  | `process` | Single object does something | Pulse/emphasis on object + badge |
  | `alt` | OR branches | Branch selector UI; plays chosen path; others dimmed |
  | `par` | AND parallel | Steps animate concurrently on split lanes |
  | `goto` | Jump to another flow (same or other file), optional return point | Navigate; breadcrumb to return |
  | `info` | Free text not tied to elements | Info toast/card |
  | `conclusion` | Close story | Show summary; un-dim |
* **FR-F3** Play mode: play/pause/step-forward/step-back/restart, per-step auto delay
  (default 2.5 s, configurable per step), exit restores pre-play view state.
* **FR-F4** Animation style: edge token (circle) traveling with trailing dash animation,
  object emphasis ring, non-participants dimmed to 25% opacity, smooth camera
  (pan/zoom to step actors, 300 ms ease). All timing constants in theme config. A step may
  override the automatic camera with `camera auto` (explicit default), `camera hold` (keep
  the previous framing) or `camera focus (x, y) [zoom n]` in document coordinates, with an
  optional `duration 0–300 ms` travel time; without metadata the camera behaves as before.
* **FR-F5** Reduced-motion: respect `prefers-reduced-motion` → crossfade instead of
  movement.
* **FR-F6** Flow validation: steps reference existing objects/links; dangling refs are
  errors (code view + validate CLI).

### 4.6 Views, tags, layout (FR-V)

* **FR-V1** Tags on objects/links; tag filter bar → fade non-matching (perspectives).
* **FR-V2** Named views per diagram: element visibility set, tag filters, saved
  positions, layout mode (`auto:LR|TB` or `saved`). Diagram has ≥1 view; default view
  implicit.
* **FR-V3** Auto-layout: layered (direction LR/TB) via dagre behind a `LayoutEngine`
  port; deterministic for identical input (stable ordering by id).
* **FR-V4** Manual positions stored in file; mixing auto + pinned nodes supported.

### 4.7 Imports & reuse (FR-I) — hybrid model (D1)

* **FR-I1** `imports:` section maps aliases → relative file paths; imported file's
  *objects* are referenceable (ghost rendering: dashed border, "imported" badge).
* **FR-I2** Imported objects are read-only in the importing file; click-through opens
  source file (workspace-relative).
* **FR-I3** Cycle detection: import graph must be acyclic (error otherwise).
* **FR-I4** Missing import file → explicit problem marker, diagram still renders
  non-imported content.

### 4.8 Storage (FR-S)

* **FR-S1** Persistence: IndexedDB autosave, debounced 800 ms; last-open workspace
  restored on load. Storage model = **browser-local only**; "nothing server-side" is a
  hard constraint (E2E asserts zero network calls after initial load).
* **FR-S2** Ephemeral mode ("private tab" toggle): in-memory only, no IDB writes;
  export reminder banner every 10 min.
* **FR-S3** Quota handling: surface quota errors; graceful degradation to ephemeral
  mode with warning; storage usage indicator in settings.
* **FR-S4** Reset/clear-all-data with typed confirmation.
* **FR-S5** Schema versioning of stored workspace (migrations forward-only).

### 4.9 CLI (Go binary) (FR-X)

Single static binary, no runtime deps, all assets embedded (`go:embed`).

* `panelcraft serve [--addr :8080] [--open] [dir]` — serves the SPA at `/`, workspace
  files under `[dir]` read-only at `/files/*` (optional convenience for demo assets).
  SPA fallback to `index.html`. No write endpoints, ever.
* `panelcraft validate <file|dir>... [--json]` — parse + semantic validation
  (dangling refs, import cycles, flow refs, duplicate ids). Exit 0 clean; exit 1
  findings; exit 2 usage/IO error. CI-friendly.
* `panelcraft convert <in.mmd> [-o out.pcd]` — mermaid → PanelCraft canonical form.
* `panelcraft render <file.pcd> --out out.png|svg [--width 1920] [--theme dark|light]
  [--chrome /path/to/chrome]` — headless render via Chrome DevTools
  Protocol (chromedp, pure Go). Serve embedded app, drive it, screenshot/serialize SVG.
  Fails with actionable error if no Chrome found.
* `panelcraft version`.

### 4.10 Hosting (FR-H)

* **FR-H1** GitHub Pages deployment of the built SPA on `main` (Actions). App runs
  100% static; base-path configurable at build time (`/panelcraft/`).
* **FR-H2** GitHub Releases attach binaries: `panelcraft_{linux,darwin,windows}_{amd64,arm64}`
  (+ checksums). Windows = `.zip`, others `.tar.gz`.

---

### 4.11 C4 decomposition and embedded source

An element may own a subordinate diagram, so a C4 model is navigable instead of
flat. Grammar and diagnostics: [FILE-FORMAT.md](FILE-FORMAT.md) §3.2, §3.3, §10.

* **Ownership** — `drilldown "<workspace path>"` on a `system`, `system_ext`
  or `container` declares that this element decomposes into the given `.pcd` file.
  Named views were removed (ADR 0007); a `view` suffix is a parse error. The IR v12
  relation is discriminated into a linked path or an embedded recursive document.
  It is authored on the parent only; the child never declares a backlink, so there
  is one source of truth per edge.
* **Allowed transitions** follow the C4 zoom levels: system/system_ext →
  `level container`, container → `level component` or `level deployment`. A child
  that declares no `level` is accepted; a mismatching one, a kind that cannot
  decompose (person, datastore, queue, note, group), a duplicated target, a cyclic
  chain, a missing file and an escaping or non-`.pcd` path are reported as
  diagnostics (P211–P220, P222) instead of being silently repaired.
* **Navigation** — a drill-down is opened from a visible, keyboard-reachable affordance on
  the entity (properties panel plus canvas context action). The child opens in its
  own tab with breadcrumbs back through the trail, and a parent-context boundary
  that names the parent element and file — visually distinct from imported ghosts
  and never a duplicate of the parent object.
* **Embedded source** — `source { language "…" ; text "…" … }` embeds a short piece of source
  text in the document (one `text` line per source line, 64 KiB / 4096 lines per
  object). It is data: shown in a local read/edit viewer, never executed, never
  parsed as markup, never fetched; editing it is one undoable command.
* **Distinctness** — imports, flows and drill-downs stay distinct: an import reuses objects
  read-only inside the diagram, a flow `goto` moves between flows, and a drill-down
  opens a subordinate diagram. Nothing is presented as a substitute for another.
* **Exports** — exports declare themselves: decomposition links draw no edge, so SVG/PNG
  and CLI rendering are unaffected, and Mermaid export names `drilldown` and
  `source` in its documented drop list.

## 5. Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| N1 | Render/interaction perf | 60 fps pan/zoom & drag ≤300 objects; ≤2 000 objects usable (layer virtualization) |
| N2 | Open time | 100-object file → interactive < 300 ms (mid-range laptop) |
| N3 | Parser perf | 10k-line file parses < 1 s |
| N4 | Binary size | < 30 MB compressed |
| N5 | Accessibility | WCAG 2.1 AA for UI chrome; canvas: full keyboard object nav, ARIA live narration in play mode; `prefers-reduced-motion` honored |
| N6 | Security | Strict CSP (no inline script eval in app), exported SVG sanitized (no scripts/foreignObject from untrusted labels), CLI: path traversal guarded, no telemetry |
| N7 | Self-containment & privacy | **Zero external resources at runtime**: no CDN, no third-party origins, no webfonts (system font stack), icons = inline SVG (no icon fonts/CDN); zero network calls at runtime — proven by E2E network block + CI asset scan |
| N8 | Offline | App shell + last workspace available offline (service worker, M7); bundle fully self-contained |
| N9 | Browser support | Evergreen Chrome/Edge/Firefox/Safari (last 2 versions); `CompressionStream` required (Safari ≥16.4), fallback dependency fflate if feature absent (ADR-0004) |
| N10 | i18n | English v1; all strings centralized for later l10n |
| N11 | Offline build & reproducibility | Build runs **without network** after one-time dependency fetch (`npm ci` + `go mod download`, lockfile/go.sum committed); CI may run fully offline via caches; produced artifacts are self-contained — web bundle inlines all assets, Go binary embeds `web/dist` via `go:embed` |

### Visual style targets (validated by vision review, §9)

* Dark-first theme, high contrast, C4-ish shape language (soft rectangles, person
  glyph), consistent 4 px spacing grid, subtle shadows, 150–300 ms transitions.
* Style guide + golden screenshots per milestone (docs/STYLE-GUIDE.md in M0).

---

## 6. File format (summary — full spec in FILE-FORMAT.md)

* Native format **PDL (PanelCraft Diagram Language)**, extension `.pcd`, UTF-8,
  **own grammar inspired by mermaid** — deliberately *not* required to be valid mermaid
  (D7). One coherent syntax for structure *and* semantics: typed nodes, typed links,
  plus first-class `flow`, `layout`, `import`, `style`, `tag` directives — no comment-block
  workarounds.
* Mermaid enters/leaves the tool exclusively through converters:
  * import: mermaid → PDL (lossless for supported subset, diagnostics otherwise);
  * export: PDL → mermaid (lossy, declared feature drop).
* Guarantees:
  * PDL ⇄ internal IR ⇄ PDL is lossless (canonical round-trip, golden-tested).
  * Parser accepts unknown-but-parseable constructs as data (forward compatibility),
    reports them as warnings; semantic validation is a separate pass.
* Internal **IR = language-neutral JSON schema** — shared contract between the TS
  implementation and the Go CLI (parser parity tests, §8).

---

## 7. Domain model (IR overview)

```
Workspace { schemaVersion, files[], settings }
File      { path, meta, imports[], objects[], links[], groups[], flows[], layout? }
Object    { id, kind(person|system|system_ext|container|component|datastore|queue|group|note),
            name, description, technology, tags[], properties{}, style{}, importedFrom?,
            drilldown?: { kind: 'linked', path }
                     | { kind: 'embedded', path, doc: Doc },
            source?{ language?, lines[] } }                            ← IR v12
Link      { id, from, to, type, label, direction(uni|bi), style{}, waypoints[] }
Flow      { id, title, description?, descriptionLines?[], presentation?, steps[] }  ← IR v13
Step      { type(intro|msg|process|alt|par|goto|info|conclusion), description?,
            camera?{ mode(auto|hold|focus), x?, y?, zoom?, durationMs? }, delayMs?,
            payload (per type: from/to/linkRef | on | branches[](label,steps[]) | branches[](steps[]) |
                     target{file?,flow,return} | text) }
Layout    { directive?(auto:Dir|saved), positions[{id,x,y}], pins[], hidden[], hiddenTags[] }
```

Rules: ids are stable strings (`[a-z][a-z0-9_]*`, unique per file); link endpoints must
resolve to objects or imported aliases; flows reference link ids for `msg` steps
(mermaid-imported edges get auto ids `L1..Ln` recorded in `links:` so flows survive
round-trips). `drilldown` is a parent-only relation to a workspace-relative `.pcd`
file; `source` is line-oriented text the document owns. Named views were removed;
Neither is a link and neither is persisted outside the file.

---

## 8. Quality strategy (gates, per D6)

### 8.1 Static analysis & complexity

* **Go**: `go vet`, `staticcheck` (default checks, zero findings), `gocyclo` —
  **target ≤10, hard fail >15** per function; `gocognit` ≤30. Enforced in CI on
  `./...`.
* **TypeScript**: `eslint` — `complexity ≤12`, `max-lines-per-function ≤120`,
  `max-depth ≤4`, `@typescript-eslint` strict; `tsc --noEmit` clean. Same thresholds
  in CI. Deliberate exceptions require `// rationale:` comment + ADR note.

### 8.2 Unit tests (vitest / go test) — coverage plan

Core packages (**≥80% lines+branches, enforced by vitest thresholds**):

| Package (TS) | Must cover |
|---|---|
| `engine/format` | PDL parser/printer: golden corpus round-trips (see below), error positions, mermaid import mapping incl. malformed input |
| `engine/model` | IR ops: add/remove/update object/link/flow, import resolution, cycle detection, validation rules |
| `engine/layout` | dagre adapter: determinism, pin handling |
| `engine/render` | scene-graph → SVG snapshot assertions (jsdom), element hit lists |
| `engine/flows` | step machine: all 8 types, alt/par branching, goto resolution, timing plan |
| `engine/anim` | animation plan builder (durations/keyframes), reduced-motion path |
| `workspace/store` | virtual FS ops, ZIP pack/unpack (round-trip), IDB wrapper (via `fake-indexeddb`), migrations |
| `workspace/undo` | command stack, coalescing |
| `ui/*` | component tests (@testing-library/preact): panels, palette, dialogs (**≥60%, reported, not gated**) |

Go: table-driven tests for `validate`/`convert`/IR codec; `httptest` for server;
corpus parity tests below.

**Golden corpus**: `testdata/corpus/` — ≥30 curated files (mermaid samples, C4
samples, flows incl. alt/par/goto, edge cases: unicode, long labels, deep nesting,
malformed variants). Each file has expected `.ir.json` + canonical `.pcd`. Shared by
TS and Go tests → **parser parity is a CI gate** (IR diff must be empty).

### 8.3 E2E (Playwright)

* Scenarios map 1:1 to §3 scenarios S1–S7 plus: undo/redo, tag filtering, theme
  switch, zip round-trip, quota-error path (mocked), keyboard-only editing pass.
* **No-network assertion** (S7): route-block all external requests; app must function.
* Screenshots at every scenario end (light+dark) → committed baselines for visual diff
  (pixelmatch, 0.1 threshold) and as input for vision review.

### 8.4 Vision validation loop (development-time)

Each milestone: run E2E suite → collect screenshots → agent reviews them against
docs/STYLE-GUIDE.md checklist (alignment, contrast, spacing, animation end-states) →
file UI defects with screenshot refs → fix → re-shoot. Vision review is a **definition-
of-done item per milestone**, recorded in the milestone log. (Playwright visual diff is
the CI regression net; vision review catches *quality* issues diffing can't.)

### 8.5 CI (GitHub Actions)

* `ci.yml`: build web → lint+staticcheck+gocyclo → unit tests (Go matrix + Node) →
  coverage gate → perf budgets (N1–N4, uninstrumented) → corpus parity → build go →
  **asset-origin scan** (§8.6) → e2e (Playwright, chromium, network-blocked) →
  visual diff. The bundle is built first because `internal/*` and `cmd/panelcraft`
  embed `web/dist`: `go vet`, `staticcheck` and `go test` cannot compile those
  packages without it (same order as `scripts/verify.sh`). Perf budgets run
  outside the coverage run (`npm run test:perf`): a latency budget measured under
  the V8 instrumenter is not the budget.
* `release.yml`: tag → cross-compile binaries (matrix GOOS/GOARCH, CGO off) →
  checksums → GitHub Release.
* `pages.yml`: deploy built SPA to GitHub Pages on main.

### 8.6 Self-containment gate (N7/N11)

* CI script `scripts/check-selfcontained.sh`: scans `web/dist/**` for external-origin
  resource loads — `<script src>`, `<link href>`, `url()` in CSS, `import()` targets —
  any origin ≠ self ⇒ **build fails** (source `https://` inside string literals/labels
  is fine; resource loads are not).
* No CDN, no webfont links, no externally-hosted icons anywhere in source or dist.
* E2E suite runs with **all external requests blocked** (S7): app must be fully
  functional — the runtime proof of N7.
* Go: binary embeds `web/dist`; `go build` consumes only module cache (no network
  after `go mod download`).

---

## 9. Milestones

| M | Scope | Done means |
|---|-------|-----------|
| M0 | Scaffolding: repo, CI, vite+preact+ts setup, agents.md, STYLE-GUIDE, architecture workspace in PDL (§14), empty app served by Go bin | CI green end-to-end; S7 skeleton passes |
| M1 | Format engine: IR schema, PDL parser/printer, mermaid import, golden corpus, Go parser parity, `validate`/`convert` CLI | Corpus green both sides; FR-M1/M2 import tests |
| M2 | Canvas MVP: render engine, pan/zoom, select/drag, palette drop, linking, properties panel, undo | S1 passes E2E + vision review |
| M3 | Workspace: file tree, tabs, IDB storage, zip, per-file IO | S4 passes; FR-W* |
| M4 | Code view sync + mermaid export + format-on-save + diagnostics | S2 passes; FR-K*, FR-M4 |
| M5 | Flows + animation + icons + themes | S3 passes; FR-F* |
| M6 | Tags/views, auto-layout, dependencies view, search, snapshots, seq export | FR-V*, FR-W6/W7 |
| M7 | A11y pass, perf pass (N1–N3), service worker, docs complete, release engineering, GH Pages live | All NFRs measured; v1.0 released |

---

## 10. Keyboard shortcuts (v1 baseline)

`Ctrl/Cmd+S` save+format · `Ctrl/Cmd+Z / Shift+Z` undo/redo · `Ctrl/Cmd+E` play/edit
toggle · `Ctrl/Cmd+P` quick search · `Ctrl/Cmd+K` command palette (M6) · `Tab/Shift+Tab`
cycle objects · arrows nudge (grid step; `Shift` = 1 px) · `Enter` properties ·
`Ctrl/Cmd+D` duplicate · `Del` delete · `1..9` palette quick-add · `L` then click
target = link mode · `F` fit · `+/-/0` zoom in/out/reset · `G` grid visibility (turning it back
on restores the last visible grid type; snapping is a separate setting).

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| TS/Go parser drift | Single IR JSON contract + shared golden corpus, parity CI gate (§8.2) |
| SVG perf on large diagrams | Layer virtualization, offscreen culling, perf test in E2E (N1) budget; document limits |
| ZIP without deps breaks on older Safari | Feature-detect `CompressionStream`; fflate fallback (ADR-0004) |
| Mermaid subset mismatch (user pastes unsupported syntax) | Import converter diagnostics with line numbers + documented fidelity matrix (FR-M4/M5); never silent data loss |
| Headless render env differences | chromedp pinned; CI runs `render` smoke test on linux; documented `--chrome` flag |
| Scope creep (IcePanel parity temptation) | Milestone table is the contract; new ideas → backlog, not current milestone |
| IndexedDB data loss (user clears browser) | Autosave + export reminders + zip (S4); quota/ephemeral handling FR-S2/S3 |

---

## 12.1 v1.0 status of the requirement list

The list above is the product vision; this section records what v1.0 actually ships
so the document is not read as a promise. Everything not mentioned here is
implemented and covered by tests.

**Implemented in v1.0 (was listed as later/partial):**

* FR-C5 inline rename (F2 / double-click), object icon per kind.
* FR-C6 custom key-value properties and style overrides (fill, stroke, text, icon).
* FR-C7 typed links, label, direction (uni/bi), arrowheads (`head`/`tail`:
  arrow/open/diamond/circle/square/none), line texture (solid/dashed/dotted), width.
* FR-C8 waypoints are draggable and persisted (`waypoint` lines); orthogonal, straight,
  and curved routing with deterministic object/route/label collision avoidance for
  labels. A route is validated as a whole polyline: automatic routes avoid both
  endpoints and other entities. Orthogonal waypoints are scored as whole candidates
  (crossings, then full-path reversals, skipped bends, length, authored-index tie);
  an inside-entity or reversal-causing bend is skipped with a reason on the connector
  while the authored line stays in PDL/IR. Straight and curved routes keep every
  waypoint verbatim (see FILE-FORMAT “Overlap avoidance”).
* FR-C10 canvas and object context menus (duplicate, delete, copy/paste, align,
  distribute, equalise size).
* FR-C12 copy/paste/duplicate within a file, with id re-allocation on paste.
* FR-I1…FR-I3 imports: `import Alias as "./x.pcd"`, read-only ghosts rendered on the
  canvas, click-through to the source file, cycle detection.
* C4 decomposition and embedded source: `drilldown` opens the subordinate
  diagram with breadcrumbs and a parent-context boundary; `source` keeps a short
  piece of source text in the file behind a local viewer (FILE-FORMAT §3.2, §3.3).
* FR-X / S6 CLI: Mermaid/PDL → canonical PDL conversion and real-Chrome SVG/PNG
  rendering, including light/dark themes, output sizing and C4 auto-layout.
* N10 UI strings are centralized in a typed English catalog with named-placeholder
  interpolation and an AST audit for rendered copy, accessible names and copy fields.

**Moved to the post-v1 backlog (not implemented, deliberately):**

* FR-C4 resize applies to *every* object kind (not only groups/boundaries); rotation
  is still not supported (axis-aligned C4 shapes).
* FR-C9 cross-surface undo ordering is a shared journal (`HistoryFeed`) with
  focus-aware routing, not a single stack for every surface.
* FR-C12 cross-file paste resolves imports by *linking*, not inlining.
* FR-C1 mini-map is implemented with pointer/keyboard navigation and live flow-camera
  tracking; curved camera paths remain a presentation refinement.

**Known UI limitations** (documented rather than silently different):

* Object `description`/`technology`/`tags` are edited in the properties panel and
  shown on the canvas hover card; there is no separate tooltip affordance.
* The illustration styles in flow playback are chosen per flow (`auto` by default);
  there is no per-step illustration override.

## 12.2 Open items (post-v1 backlog)

Comments/annotations on objects · export to draw.io/PlantUML · plugin API for custom
stencils · additional diagram notations (sequence-native, deployment advanced) ·
optional file-system access API for real folders.
Flow→`sequenceDiagram` export (`.seq.mmd`) was subsequently completed from M6-WP7.
N10 full UI string centralization was subsequently completed in `strings.ts`; the
runtime remains English-only (see M7.md). F-39/F-40 subsequently closed the carried
camera-containment and dependencies-heading items; active flow actors now have browser containment assertions
and the dependencies heading names the owning file. The flow-presentation pass subsequently
added one-beat history fading and production reduced-motion parity, with light/dark review.

Route-editing follow-ups (found in the connection-move review):

* **Bend preservation on channel slides** — sliding a channel whose run contains
  an explicit bend absorbs the bend into the collinear run: the geometry is kept,
  but the bend's waypoint handle disappears from the document without a
  "remove bend" intent.
* **First bend on a straight link** — only routes that already have an interior
  channel expose segment handles, so a plain two-point or L-shaped link cannot
  be bent by dragging; bend creation needs an affordance on the link path itself.
* **Bend behind a shape** — a bend explicitly dragged behind an endpoint entity
  (not just past the port line, which is clamped) can still make a leg cross
  that entity; the router would need to treat endpoint rects as obstacles for
  that leg, which v1 deliberately avoids.

---

## 13. License

* **GPL-3.0-only** (SPDX: `GPL-3.0-only`). `LICENSE` (full text) at repo root; each
  source file carries the standard GPL header; SPDX headers in every source file.
* Binary distribution (GitHub Releases) satisfies GPL-3.0 corresponding-source by
  linking the public repository + commit reference in release notes.
* Third-party dependencies must be GPL-compatible (MIT / Apache-2.0 / BSD). New
  dependencies require a license check recorded in the ADR proposing them.
* Documentation and sample diagrams in-repo: same license, CC-BY-SA-4.0 acceptable
  alternative for docs/ only — decision recorded in ADR-0005.

---

## 14. Documentation policy — "architecture docs are written in PanelCraft"

Self-hosting rule (product owner decision): **all architecture documentation of
PanelCraft is authored in PanelCraft's own format (PDL, `.pcd`)** — dogfooding the
format end-to-end.

* Prose documents (this SPEC, FILE-FORMAT, ADRs, guides) = Markdown; prose stays
  human-readable text.
* **Every architecture diagram** — module graph, deployment/topology, data-flow,
  milestone dependencies — lives as a `.pcd` file under `docs/architecture/` (a PDL
  workspace), never as ASCII/Mermaid art in Markdown.
* Benefits enforced by construction:
  * the docs double as **golden-corpus seeds** for the M1 parser (they must parse);
  * doc drift is caught by `panelcraft validate docs/architecture` in CI (from M1 on);
  * the rendered docs *are* the product's visual output — style regressions surface in
    our own documentation first.
* Until parsers exist (pre-M1), `.pcd` docs are plain text under the grammar of
  FILE-FORMAT.md and are marked **unvalidated** in docs/architecture/README.md; M1's
  done-criteria include corpus-green for every doc file.
* When prose must reference a diagram: link the `.pcd` file and describe intent in
  words (a picture never carries normative content alone).

## 12.3 Release-gate follow-ups (found during the bug round)

* **Pages publishes only the last merge** — the deploy gate decides whether to
  publish by diffing the merge commit against its first parent. When a red `main`
  build is later fixed by a follow-up pull request, the shipped changes behind it
  are not republished: the follow-up looks documentation-only, and the site keeps
  serving the older revision until the deploy is dispatched by hand. Comparing
  against the revision the site actually serves (`build-info.json`) would close it.
* **The hosted smoke only runs after a deploy** — nothing exercises `e2e-hosted`
  against the previous revision, so a spec that drifts from the shipped interface
  is invisible until a deploy finally happens, and then fails the release gate
  instead of the pull request that broke it.
