# Changelog

All notable changes to PanelCraft. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versioning is SemVer-ish with
milestone-aligned minors. Dates are UTC.

## 2026-11-17 — the update offer leaves the presentation shell

- A waiting-worker offer that was already visible no longer stays in the
  chrome-free presentation shell under the transparent advance surface.
  Presentation now hides the banner row with the rest of the editor chrome;
  leaving presentation restores the same offer with Restart and Later
  hit-testable. No lifecycle flag or service-worker behaviour changed.
- The browser hit-test review covers narrow and zoomed viewports, menus, modals,
  the presentation launcher, presentation and paused frames, and reload,
  including real pointer and keyboard activation and the exact worker state,
  hit stack and pointer-event data. Details:
  [docs/archive/bugs-update-banner-hit-test.md](archive/bugs-update-banner-hit-test.md).

## 2026-11-17 — orthogonal waypoints have one whole-path simplification contract

- Explicit bends on orthogonal links are now planned as one route instead of one
  leg at a time. Entity crossings remain a hard constraint; clean candidates are
  ranked by fewer whole-path reversals, fewer skipped bends, shorter length and
  authored-index ties. A bend inside a shape or one that makes the connector run
  out and back is skipped with a reason on the connector, while an intentional
  detour that reverses nothing still survives.
- The authored `waypoint` lines stay untouched in PDL, IR, the code view and the
  file. Straight and curved routes keep every waypoint verbatim. This replaces
  the earlier rule that every outside bend was authoritative.
  Details: [docs/archive/bugs-orthogonal-waypoint-simplification.md](archive/bugs-orthogonal-waypoint-simplification.md).

## 2026-11-17 — presentation Play replays the current beat

- Play in the presentation dock, the play bar and the presentation keyboard
  toggle now ask the playback runner to replay the parked beat from time zero
  with one full dwell, instead of resuming a frozen animation. Navigation is
  not re-entered, and only the old beat's own animations are cancelled, so
  camera work sharing the animation player is left alone.
  Details: [docs/archive/bugs-presentation-replay-beat.md](archive/bugs-presentation-replay-beat.md).

## 2026-11-17 — presentation step number sits on its badge centre

- The number in the presentation's SVG beat badge no longer sits four units low
  inside its circle. The renderer now places it exactly on the dot's centre,
  which already uses a central baseline, so one-, two- and three-digit steps
  are centred in both themes. The dock's text counter is unaffected.
  Details: [docs/archive/bugs-presentation-badge-centering.md](archive/bugs-presentation-badge-centering.md).

## 2026-11-16 — the hosted site proves its own revision (item 11)

- Every bundle now carries the commit it was built from: `build-info.json` (sha,
  short sha, ref, build time, sha256 of every emitted file) plus
  `<meta name="panelcraft-build">` in `index.html`. The identity file is written
  after the service worker's precache manifest, so it can never be served from the
  previous build's cache.
- Publication is gated on the revision instead of on a deploy job going green: the
  `pages` workflow runs when `ci` finishes for `main`, publishes only on a
  successful run, checks out that exact SHA, refuses to continue when the checked
  out HEAD differs, and keeps the documentation-only path filter by diffing the
  deployed commit against its parent. A manual dispatch must still show a green
  `ci` run for the dispatched commit before it can publish.
- A post-deployment evidence step (`scripts/hosted-evidence.mjs`) downloads the
  served identity, compares it with a fresh rebuild of the same SHA and re-hashes
  every asset `index.html` references, so a stale upload fails even when the
  identity file looks right. The record is attached to the run and kept 90 days.
- A hosted Playwright configuration (`npm run e2e:hosted`) exercises items 7–16
  against the deployed URL with no local server, in two contexts: a fresh profile,
  and a client that already has the service worker installed. The upgrading case
  reads the build identity back out of the worker's cached shell — online and with
  the network cut — so "which bundle is active" is answered, not assumed; the
  update/restart lifecycle stays rehearsed locally against the same bundle, since
  a deployed worker script cannot be rewritten.
- `bugs.md` is now guidelines only; every item from this round lives under
  `docs/archive/`. Details:
  [docs/archive/bugs-hosted-release-verification.md](archive/bugs-hosted-release-verification.md).

## 2026-11-16 — C4 drill-down and embedded source (item 16)

- A C4 element can now *own* a subordinate diagram. A new object line
  `drilldown "<workspace path>" [view <id>]` declares that a `system`,
  `system_ext` or `container` decomposes into another `.pcd` file, authored on the
  parent only so an edge cannot be described twice. Allowed transitions follow the
  zoom levels (system → container, container → component/deployment); a child that
  declares no `level` is accepted.
- Opening it is real navigation, not a rename of the two existing mechanisms:
  imports still reuse objects as read-only ghosts *inside* a diagram and a flow
  `goto` still jumps between flows, while a drill-down opens a *subordinate*
  document with a breadcrumb trail (`Back to shop.pcd › Webshop`), a dashed
  parent-context boundary naming the element and its file, and a keyboard-reachable
  affordance in the properties panel. A broken, cyclic or duplicate relation keeps
  the current diagram and explains why instead of navigating.
- `source { language "…" text "…" … }` embeds a short piece of source text in the
  document — one line per source line, 64 KiB / 4096 lines per object, 256 KiB per
  document. It reaches the shell through a local viewer/editor and is shown, never
  executed or fetched; saving it is one undoable document command.
- Format, IR (v10), printer, TypeScript and Go parsers/validators/printers landed
  together with corpus seeds (`c4-drilldown`, `sem-decomposition`) and the shared
  TS⇄Go fixture, so round-trip and parity stay byte-exact. New syntax error `E116`
  rejects an empty source block, which the printer would otherwise silently drop;
  validation adds `P211` duplicate parent, `P212` missing target (warning), `P213`
  escaping/non-`.pcd` path, `P214` incompatible level, `P215` a kind that cannot
  decompose, `P216` cycle, `P217` source over the limits, `P218` unknown view id.
  Renaming or moving a target rewrites every referring path in the same step.
- Mermaid export names `decomposition links (drilldown)` and `embedded source` in
  its declared drop list, and the exporter's catalogue test keeps the document in
  sync. Details: [docs/archive/bugs-c4-drill-down.md](archive/bugs-c4-drill-down.md).

## 2026-11-15 — Project icons: portable, sanitized, manageable

- A diagram can now carry its own icons. A new top-level `icon <handle> { label "…" media "image/svg+xml" data "<canonical Base64>" }` statement declares an SVG inside the `.pcd`, referenced by the existing object `icon name` property, so a file mailed, committed or rendered by the CLI looks the same everywhere — no sidecar asset, no network fetch, no icon font (the offline-only rule; ADR-0006).
- Format, IR (v9), printer, TypeScript parser/validator and the Go port landed together, with corpus seeds and a shared TS⇄Go fixture, so `parse → print → parse` stays byte-stable and both engines agree byte for byte. New syntax codes `E114` (payload is not canonical Base64) and `E115` (media type this version cannot draw) abort the file rather than re-print something unusable; validation adds `P206` duplicate handle, `P207` built-in handle collision (the built-in namespace is reserved, so `icon cloud` never means two pictures), `P208` payload/count limits (64 KiB per icon, 256 KiB and 64 icons per document), `P209` unsafe or non-UTF-8 SVG, `P210` a name that resolves to nothing.
- Icons are sanitized on ingest *and* checked at render against one allowlist (no scripts, event handlers, `<foreignObject>`, `<style>`, embedded `<image>`, external `href`, `url()`/`@import`/`javascript:`), implemented in TypeScript and Go and pinned by `testdata/icon-cases.json`. A payload that fails is reported and never drawn; renderable icons are embedded as a `data:` URI, so an SVG-as-image runs in static mode with nothing to execute or fetch.
- The built-in set grew from 8 to 43 vendor-neutral technical glyphs (compute, storage, network, security, clients, platform, ops, data, concepts), all originals drawn in-repo, GPL-3.0-only, with the provenance and licensing record in [ICONS.md](ICONS.md) and a sync test tying each asset to the drawn module.
- A searchable picker (built-ins by label/category/keyword, plus this file's icons with previews and honest "cannot be drawn" markers) replaces the free-text icon box, and **Manage project icons** adds, imports, pastes, replaces, renames and removes project icons: a rename rewrites every reference in one undoable document change, and removing a used icon reports the count and asks before clearing references, so no icon reference ever breaks silently. Mermaid export declares `icons` dropped whether they are built-in or declared.
- Review turned up three defects in the new icon path, all fixed: a picked icon did not repaint the canvas (the payload was copied onto the object and the scene key ignored the icon), the shell republished payloads on every render and looped, and two built-in glyphs (`user`, `queue`) read wrong at the size the canvas draws — both redrawn and checked on a contact sheet at 16/22/48 px. The properties panel now shows the icon that is actually drawn and writes it to the object's own `icon` field.

## 2026-11-15 — Review fixes for the flow editor and Markdown documentation

- Process step cards showed the shape name twice and hid the authored text; the title now carries what the step does and the summary keeps the shape name, like message cards. Long flow names are readable on hover.
- The flow outline can no longer be corrupted by a line break in a title, description, label or step text (prose collapses to one line), a blank title falls back to the flow id instead of an empty heading, `goto "#flow"` no longer prints a dangling `#`, and an undefined shape is named once (`"ghost" (not in this diagram)`) instead of twice.
- The *Steps* header keeps its label and its three actions on one row at the default panel width — the sequence action is labelled `.seq` (the download is still `.seq.mmd`) — and the e2e now asserts that instead of relying on screenshot review.

## 2026-11-15 — UX08-WP15 integrated verification gate

- Added the `ux08` milestone to `scripts/verify.sh` (22 stages) so the whole application-experience milestone is one reproducible command: the UX-08 unit suites grouped by requirement, the performance budgets and the 300-object pan/zoom/drag baseline, axe accessibility in both themes, the network-blocked offline/PWA checks, every UX-08 end-to-end scenario, the full Playwright suite and repo hygiene. No behaviour changed; the gate proves the behaviour the WP01–WP14 briefs claim, and the milestone's residual limitations are recorded rather than descoped.

## 2026-11-15 — UX08-WP14 flow documentation for people and agents

- Flows now export as deterministic Markdown: `.md` beside *Steps* documents the selected flow and **All flows (.md)** documents every flow in one file, generated from the parsed document (never playback beats) and downloaded offline through the existing adapter — flow title and purpose, numbered steps with nested alt branches and par lanes, readable names plus stable ids, link label and direction, per-step description, dwell, camera mode/focus/zoom/transition and `goto` targets, with unresolved references kept and marked instead of silently dropped.
- Added golden fixtures covering all eight step kinds, nested alt/par, `goto`, unicode, quoted names and every presentation field (`testdata/markdown/`), byte-compared against the downloaded files in Playwright; documented the agent PDL workflow in the user guide with a valid example that both parsers now check (`check-docs.sh` covers the guide's ```pcd fences, `docsExamples.test.ts` covers them from TypeScript), and paired every declared Mermaid sequence drop with what the Markdown outline keeps in the generated interop matrix.

## 2026-11-14 — FLOW-02 connector sparks

- Added per-link playback sparks (`sparks 1..8`, `speed 0.25..4` in the link style block, PDL/IR v7 and TS⇄Go parity): deterministic staggering, one-way completion, bidirectional ping-pong until the step ends, `flip` as the initial direction, bounded validation, unchanged step timing, static reduced-motion playback and cleanup on every exit path.

## 2026-11-14 — FLOW-01 canvas-assisted flow editing

- Flow Steps is an on-demand dockable panel instead of a permanent tab, with visual step cards (kind stripe, title, actor/link summary), canvas-assisted targeting (from/to/target from the selection, message steps seeded only from existing connectors), participant highlighting, and accessible names for the step controls.

## 2026-11-14 — CX-04 visual connector style pickers

- Replaced the connector dropdowns with accessible preview tiles (inline SVG + text label, check mark and weight for the selection, arrow-key navigation) for route geometry, line texture, common weights and independent head/tail markers, keeping the numeric Width field for custom values.

## 2026-11-14 — DOC-01 context-menu documentation

- Corrected the user guide's context-menu list to the shipped commands (duplicate/copy/paste/delete, six align, two distribute, equal size) and removed the unsupported "bring to front" claim, pointing layering at the Stacking order field instead; a light/dark E2E now fails if the guide and the menu drift apart.

## 2026-11-14 — CX-05 group-endpoint links no longer crash auto-layout

- Auto-layout skips links whose endpoint is a compound group boundary (dagre cannot rank a parent), so such documents validate, lay out and render instead of throwing; the link still draws from the boundary rectangle.

## 2026-11-14 — CX-03 object stacking order

- Added per-object **Stacking order** with Auto as the default and an optional integer `z` override (PDL/IR v6, TS⇄Go parity), stable document-order ties, z-aware paint/hit-test/mini-map order shared by canvas, SVG/PNG export and CLI rendering, undoable properties editing, and a clean corpus seed with a declared Mermaid drop.

## 2026-11-14 — CX-02 object and connector overlap avoidance

- Added deterministic bounded avoidance across solid objects and earlier connectors, a persisted per-link **Allow overlap** override with PDL/IR v5 and Go parity, authoritative manual waypoints, minimum-conflict fallback, and shared canvas/minimap/SVG/PNG/CLI route geometry.

## 2026-11-14 — CX-01 perimeter-locked connector endpoints

- Added draggable, normalized start/end anchors with PDL/IR v4 and Go parity, exact routing across all modes, resize-safe persistence, undo/redo, accessible light/dark handles, and consistent SVG/PNG/CLI geometry; PNG export now falls back to local image decoding where Chromium rejects SVG bitmap blobs.

## 2026-11-14 — UX-06 equal-size resize cues

- Added deterministic equal-width/height snapping with labeled, accessible resize-only cues, transient geometry, cancel cleanup, and one persistent undo command per committed resize.

## 2026-11-14 — UX-05 application theme preference

- Added a persisted, no-flash System/Light/Dark selector across application surfaces while keeping document and CLI render themes independent, including deterministic light/dark SVG and PNG output.

## 2026-11-14 — UX-04 separated shape content

- Reserved distinct label, glyph, icon and imported-badge regions across all shape kinds, with consistent auto-fit, explicit resize and reload geometry plus keyboard/contrast fixes found by accessibility review.

## 2026-11-14 — UX-03 on-demand workspace browser

- Split Files and Flow Steps into independent dockable panels, retained dirty tabs and flow selection
  across close/reopen, and covered keyboard-only file operations, persistence, accessibility and both themes.

## 2026-11-14 — UX-02 canvas-first workspace

- Made Shapes the only panel open by default and added browser-local close/reopen, left/right/bottom
  docking, floating panels, resizing, keyboard alternatives, reset, focus transfer, viewport
  recovery, and reliable layout persistence without changing diagram data.

## 2026-11-14 — UX-07 diagnostic status

- Removed the stray diagnostic zero with a visually-hidden utility and polite atomic status,
  preserving accessible counts, visible parse-error feedback, and clean recovery.

## 2026-11-11 — P6: flow-presentation polish

- Added a softer one-beat history fade for previous objects and links while keeping
  current actors live and all other elements at the specified 25% opacity.
- Wired the production animator to `prefers-reduced-motion`, matching the existing
  instant camera behavior with static emphasis and no pulsing rings or travel.
- Added unit and real-browser regressions plus reviewed light/dark playback and
  presentation captures; numbered badges, parallel lanes and compact transports remain.

## 2026-11-11 — P6: N10 string centralization

- Centralized UI chrome, accessible names, context/history copy, template copy and
  new-flow defaults in a typed English catalog with named-placeholder interpolation.
- Added a TypeScript AST audit for rendered text, accessible attributes and copy-bearing
  properties. English remains the only exposed locale; no runtime behavior change intended.

## 2026-11-11 — P6: accessible mini-map

- Completed FR-C1's mini-map with topology/viewport rendering, click-to-center,
  arrow-key panning, Home-to-fit, live flow-camera updates and responsive hiding.
- Canvas rendering is O(objects + links) with device-pixel-ratio capped at 2;
  the real 300-object pan/zoom/drag baseline remains at 60/60/122 fps.
- Added geometry/component tests, narrow-screen E2E and reviewed light/dark goldens.

## 2026-11-11 — P6: sequence export

- Completed M6-WP7: a selected flow downloads as `.seq.mmd`, preserving participants,
  messages, `alt`/`par` blocks, process/info/conclusion notes, direction flips and
  dashed links. Timing, navigation and participant-less-note loss is explicitly declared.
- Added converter/UI regressions, a checkout golden and a real-browser download E2E.

## 2026-11-11 — P6: routing completion

- Completed FR-C8 with persisted orthogonal/straight/curved link routes (IR v3), curved
  hit-testing, route-aware rendering, properties controls, and TS⇄Go corpus parity.
- Added deterministic label placement around solid objects, unrelated routes, and other
  labels, plus a theme-aware halo for crowded fallbacks. Existing orthogonal geometry
  remains the default; explicit waypoints survive all three modes.

## 2026-02-14 — P5: spec-completion and C4 CLI rendering (F-37…F-41)

- Implemented `panelcraft render` with isolated, storage-free browser rendering and
  real-Chrome SVG/PNG output, theme/view/width flags, and actionable failures (F-37).
- Corrected `convert` to produce canonical PDL from Mermaid flowchart, C4, and
  sequence input (or canonicalise PDL), with `-o` accepted on either side of the
  input and no output after fatal parse errors (F-38).
- Fixed flow-camera SVG-origin mapping and added browser assertions that active
  actors remain inside the canvas; dependencies now show the owning file (F-39/F-40).
- Added compound C4 auto-layout and boundary-transparent routing for headless
  output. Real conversion→render integration and light/dark visual review cover
  boundaries, external objects, and relationship labels (F-41).

## 2026-02-14 — P4: docs truth pass and sync-path perf gate (F-26, F-27)

- **F-27**: new `N4` perf gate — 500-object document, one rename, merge → print →
  parse → `docToState` → minimal diff measured at **3.0 ms** against a 150 ms budget,
  with the diff asserted local.

- **F-26**: `SPEC.md` gained a "v1.0 status" section (FR-C5/C6/C7/C8/C9/C10/C12 and
  FR-I1…I3 marked implemented; curved/straight routing, mini-map, cross-file inlining
  and per-step illustrations recorded as post-v1). `USER-GUIDE.md` now documents the
  grouped palette, in-place rename, eight-handle resize, `size`, waypoints, hover
  cards, the saved/dirty pill, the error state, templates, the history affordance,
  present mode and the flow closing card. `agents.md` lists the docs/corpus/clean-
  worktree gates and the preview-dist pitfall.

## 2026-02-14 — P4: laws-of-UX pass (F-25)

- Saved/dirty pill with last-save time and a problem chip; template gallery for a new
  file (three parsable starting points); palette grouped by C4 level; progressive
  link-type picker (four verbs + "More types"); canvas hover info card; undo/redo
  toasts; flow closing card (replay / export SVG / close); docked transport; 32 px
  minimum hit targets.
- Fixed while verifying: the gallery overlay was shell-level and blocked the editor
  (F-35); the shipped templates did not parse (F-36) — a regression test now parses
  every template.

## 2026-02-14 — P3: unified undo & history (F-24)

- **F-24 unified undo**: canvas commands and code edits share one journal
  (`HistoryFeed`), surfaced by a header `⟲ History` popover with surface badges and
  Undo/Redo routed to the action's owner. Canvas pushes are observed through
  `UndoStack.setObserver`; code edits are recorded per typing burst.

## 2026-02-14 — P3: canvas diagnostics (F-23)

- **F-23 canvas diagnostics**: objects whose statement is invalid get an error ring while the
  canvas keeps the last good render, and a `Diagram out of date — fix N problems` banner replaces
  the silent freeze. Mapping a diagnostic to an object handles the parser's col-1 reporting and
  failed parses (`ringTargets` + raw-line fallback in `objectAtLine`).
- **F-33**: `Ctrl/Cmd+Alt+P` (properties) now fires even when focus sits inside a panel.
- **F-34**: a broken statement is attributed to the statement it belongs to, not the next line.

## [1.0.0] — 2025-11-07

First stable release. Milestones M0–M7 complete (see
[docs/IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) and the milestone logs
in [docs/milestones/](milestones/)).

### Added
- **Canvas editor**: WYSIWYG SVG scene (9 object kinds, C4-ish shape
  language), typed links, drag/snap, undo/redo, hit-testing, keyboard nav
  (M2).
- **Code view ⇄ canvas live sync**: native `.pcd` grammar (own parser,
  printer, semantic validation P1xx/P2xx), always-visible source pane, sync
  state machine with diverged-state resolution, format (`Shift-Alt-F`)
  (M1, M4).
- **Mermaid interop**: flowchart import (best-effort) and export (declared
  feature drop); TS⇄Go converter parity gated on a shared golden corpus (M1,
  M4).
- **Workspace**: multi-file browser storage (IndexedDB), ZIP round-trip,
  export reminders, storage-quota banners, snapshots with versioned restore
  (M3, M6).
- **Flows & animation**: step machine, plan builder, play bar with ARIA live
  narration, reduced-motion support (M5).
- **Views, tags, search**: named views with hide rules + saved positions,
  tag chips with fade rendering, dagre auto-layout (deterministic, pinned
  override), dependencies panel, fuzzy quick search `Ctrl/Cmd+P` (M6).
- **Exports**: `.pcd` (canonical), `.mmd`, sanitized `.svg`, `.png` (2×),
  workspace ZIP (M3–M6).
- **Hardening (M7)**: WCAG 2.1 AA axe gate (both themes + dialogs),
  N1–N3 perf budget gates, DOM-prune SVG export sanitizer + fuzz suite, CLI
  path-traversal gates, service-worker offline shell with update flow.
- **CLI** (single Go binary, embedded SPA): `serve` (strict CSP, read-only
  `/files`), `validate [--json]`, `convert [--out]`, `version`.
- **Release engineering**: cross-compiled binaries (linux/darwin/windows ×
  amd64/arm64, CGO off, checksums), GitHub Pages deploy, offline build
  proven (`GOPROXY=off`).

### Quality gates (all green at release)
`bash scripts/verify.sh m7` — 28 stages: tsc/eslint, vitest + coverage
thresholds, perf budgets, focused suites, web build, vet/staticcheck/gocyclo,
go test + corpus parity (IR/TS/Go), docs validation (own architecture
diagrams parse), docs link check, asset-origin scan, axe/offline/full e2e
(S1–S7), release dry run.

[Unreleased]: https://github.com/pijalu/panelcraft/compare/v1.0.0...HEAD
