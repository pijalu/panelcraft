# Changelog

All notable changes to PanelCraft. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versioning is SemVer-ish with
milestone-aligned minors. Dates are UTC.

## Unreleased — fix: editor chrome and quick placement (drawing-session review)

- The editor transport bar that appears when a flow plays from the Flow Steps
  panel now docks inside the window: the canvas yields its height to it instead
  of pushing it below the fold, and the mini-map sits above it, so every control
  stays reachable without scrolling the page.
- A presentation no longer paints the canvas grid behind the diagram; the saved
  grid preference returns unchanged when the presentation ends.
- Quick-add (`1`–`9`) places each new shape clear of the ones already there —
  the centre of the view first, then right, below, above, left on the grid — so
  a second shape never hides the first. Palette drops at a point are unchanged.
- Menus are positioned before their first paint, so a context menu opened near
  a window edge no longer flashes outside the window for a frame.

Details and evidence: [play bar dock](archive/bugs-playbar-dock.md),
[presentation grid](archive/bugs-presentation-grid.md),
[quick-add cascade](archive/bugs-quick-add-cascade.md),
[menu placement](archive/bugs-menu-placement-flash.md).

## Unreleased — fix: the diagram source is visible while you draw

- A fresh workspace opens the Code pane beside the canvas instead of hiding the
  source behind a collapsed rail. Canvas edits reach the visible text within the
  documented debounce, the drawn connection is a presentable Default flow, and
  the explicit collapse, close, single-pane and reset controls keep working. A
  layout you saved — including a collapsed or closed Code pane — is still yours.
- A fresh profile on a narrow screen now fits the default before the first paint,
  so Code starts as a labelled rail rather than a drawer covering the canvas.

Details and evidence: [source visible by default](archive/bugs-code-visible-by-default.md).

## Unreleased — fix: presentation dock reserves its measured height

- The presentation canvas and advance surface now share the dock's measured
  border-box height instead of a fixed 96 px inset. Wrapped narration, choices,
  progress dots and safe-area padding resize both surfaces and trigger a camera
  refit, keeping active-step content and dock controls visible at narrow widths.
- Presentation hides the duplicate editor play bar, eliminating its horizontal
  overflow, and synchronizes playback status with the shell so rapid Back/Forward
  navigation cannot clear or hide a newly restored presentation.

Details and measurement evidence: [presentation dock clipping](archive/bugs-presentation-dock-clipping.md).

## Unreleased — progressive web filesystem

- Browser-only workspaces now use the best backend the browser offers instead of always
  IndexedDB: an authorized local folder, then origin-private files, then Web Storage, then
  legacy IndexedDB, then memory. The choice is data-aware — an existing non-empty
  workspace is never replaced by an empty preferred backend — and nothing is copied or
  migrated between backends, so an older release still finds its workspace.
- **Open directory…** and **Reconnect local folder…** live in the Files panel. A chosen
  folder is remembered and reopened silently only while read/write permission is granted;
  otherwise the app stays on browser files and asks for permission from the reconnect
  click. Page loads never raise a permission prompt. **Use browser storage** leaves a
  folder explicitly and leaves its files untouched.
- Every backend has its own label in the Files panel, and the clear-data dialog names the
  files it actually deletes. Static hosting still makes no workspace API requests.

## Unreleased — local-first workspace storage

- `panelcraft serve -local DIR` now edits ordinary workspace files through a confined,
  loopback-only filesystem backend. `-storage-type filesystem` is the default,
  `filestorage` is an alias, and `-depth N` limits visible descendants. Strong revisions
  prevent stale browser saves from overwriting external edits. Without `-local`, serving
  remains browser-storage-only and static hosting still performs no API discovery.
- Supporting browsers offer **Open local folder…** for direct, server-free folder access.
  IndexedDB remains the default and universal fallback; cancelling a picker preserves the
  current workspace, and directory selection is session-scoped.
- The Files panel identifies non-default storage. Save failures and conflicts remain
  visible, the status pill says **Unsaved**, and clear-data confirmation describes the
  real files affected.
- `-storage-type git` opens or initializes a standalone local repository and composes the
  confined filesystem store. Content changes create embedded Git commits; metadata-only
  saves do not. **Git versions** lists history, previews file lists and restores a version as a
  forward commit. Externally staged paths and merges block mutation; no remote, credential,
  hook or network operation is performed. Remote Git and GitHub integration remain design-only.

Details and evidence: [pluggable workspace storage](archive/bugs-pluggable-workspace-storage.md)
and [local Git workspace storage](archive/bugs-local-git-storage.md).

## Unreleased — brand: wordmark and application icon

- The header wordmark uses a bold Panel/Craft treatment with a theme-aware purple gradient on
  **Craft**. The supplied architecture-diagram artwork now provides the favicon, PWA install
  icons, maskable icons and Apple touch icon. Source artwork lives at
  `web/assets/brand/panelcraft-icon.png`; the standard-library generator writes the checked-in
  sizes, so no remote asset or new dependency is involved.
- The icon sits beside the wide wordmark; below 720 px only the icon remains, with `PanelCraft`
  alternative text. Present is icon-only with a tooltip, and the hamburger is the rightmost control.
- Fresh and reset workspaces expose Files, Flow Steps, Shapes, Code and Properties as collapsed
  rails without overwriting a returning user's saved layout.

## Unreleased — fixes: presentation, restoration and offline identity

- Presentation hides selection outlines, resize handles and editing overlays while retaining flow
  highlights and badges. Exiting restores the previous selection.
- Renaming an object refreshes its SVG accessible name along with the visible label. Restoring a
  snapshot refreshes the active canvas and code under the same path and persists across reload.
- Offline icon and manifest requests return their matching cached response instead of the HTML
  shell. Browser coverage proves the icon decoded, JavaScript and CSS were cached, and a template
  can be edited with the network offline.

Details and evidence: [brand and browser-workflow validation](archive/bugs-brand-workflow-validation.md).

## Unreleased — flows: a live Default for every diagram

- Every valid diagram has a virtual **Default flow**, including a blank diagram, an element-only
  diagram and one that already has custom flows. Blank Default starts with zero steps and follows
  the first added element. Default covers current connectors and objects without being persisted;
  editing it creates a separate **Custom flow**, while Default keeps tracking
  the drawing. Default and New flow snapshot connectors in strict creation order; existing
  custom flows keep their own ordering and overrides. Flow creation and editing preserve the whole document.
- Steps reference their elements and inherit connector labels and object descriptions. A step
  can override those values for one flow and return to inheritance when cleared. Parallel
  anonymous connectors retain their identity through playback and both documentation exports.
- Browser regressions also closed Default-to-Custom focus loss, canvas-assisted selection,
  document-history routing from flow controls (including collapsed Code), the fast-undo
  stale-projection race, and history loss when the Code panel changes dock.
- Every new-file starter initially selects only Default with steps matching its drawing. The Flow
  template now draws `POST /checkout` and `201 Created` as top-level connectors instead of hiding
  them in a separate Checkout flow; the C4 card correctly describes its two links.

Details and evidence: [Default flow integrity](archive/bugs-default-flow-integrity.md),
[Default flow on blank diagrams](archive/bugs-blank-default-flow.md),
[new-file starter steps](archive/bugs-new-diagram-flow.md), and
[Default playback and creation order](archive/bugs-default-flow-playback.md).

## Unreleased — release: the site publishes what it is missing

- Whether a merge reaches the live site is now decided by comparing the revision
  the site serves with the revision being published, not by looking at what the
  candidate's last commit touched. The old rule skipped a deploy whenever a
  shipped change was followed by a documentation-only merge, which left a round of
  bug fixes unpublished for two merges while every job reported success.
- That decision lives in `scripts/deploy-gate.sh` and is checked against real
  commit graphs (`scripts/deploy-gate.test.sh`, 8 cases) in `ci` and in
  `scripts/verify.sh`. An unknown served revision publishes rather than skips, and
  a missing or failing decision fails the job instead of reading as "nothing to
  deploy".

Details and evidence: [hosted release verification](archive/bugs-hosted-release-verification.md).

## Unreleased — test infrastructure: one seeding primitive

- The browser suites author documents through one helper instead of 79
  hand-written copies of "click the code editor, select all, type". It requires
  the editor to hold focus before the chord, proves the buffer ends up holding
  the text it was given, and re-types once when the editor was rebuilt mid-typing
  (which is what produced the recurring, unrelated-looking CI failures).
- Two assertions that measured the machine rather than the product were replaced
  by the property they were meant to protect: a paused beat's animation clock may
  advance one frame (it cannot advance less), and the unparseable-buffer dialog
  is asserted to refuse Apply outright instead of clicking a button that was only
  enabled while the parse was in flight.

Details and evidence: [browser-suite determinism](archive/bugs-ci-e2e-determinism.md).

## Unreleased — bug round: palette add, default names

- One press on a shape in the Shapes palette adds exactly one element. Before,
  the press ran both the drag path and the click path, so a plain click placed
  the shape twice — once at the pointer, once in the middle of the view.
- A new element is named with the first free number for its own kind ("Container
  1", then "Container 2"), counted from 1 and independent of other kinds and of
  the element ids. Before, every kind drew its number from one counter, so a
  person added after a component was called "Person 2".

Details and evidence: [palette double add](archive/bugs-palette-double-add.md),
[default name numbering](archive/bugs-default-name-numbering.md).

## Unreleased — bug round: blank diagram, shared field layout, step prose

- Creating a file offers a blank diagram beside the templates: it opens as the
  active tab with a valid empty document and no sample shapes or flows.
- Flow name, purpose, notes, introduction, conclusion, the step's text and its
  description share one field layout, and every multiline field grows with its
  content between a stable minimum and a readable maximum before it scrolls.
- Step prose gained a block form (`intro { text "…" }`, and
  `presentation { description { text "…" } }`), because a PDL quoted string
  cannot carry a line break. The IR keeps the joined text, so no field was added
  and existing documents round-trip unchanged; an empty block is a new syntax
  error, `E120`.
- Connector sparks now follow the drawn route instead of interpolating between
  the two endpoints, so a curved or bent connector no longer shows the spark
  cutting across the diagram.

Details and evidence: [blank diagram](archive/bugs-blank-diagram.md),
[shared field layout](archive/bugs-shared-field-layout.md),
[framing fields and explanation](archive/bugs-flow-framing-fields.md),
[step description explanation](archive/bugs-step-description-explanation.md),
[spark route](archive/bugs-spark-route.md).

## 2026-11-17 — browser assessment round 3

- Selecting a flow step now shows its inspector directly in the Flow Steps
  panel, above the cards, instead of leaving the fields below the fold.
- Spark count is an at-most value: the beat timeline measures connector length,
  caps concurrent tokens by their spacing and staggers their starts. A
  bidirectional connector still travels between both elements and back.
- Steps can set `advance click` to cycle the current beat until the presenter
  clicks, or `advance end` for the previous auto-advance. The choice is stored
  in the document and printed only when authored.
- Delay edits commit once after a short quiet period instead of rewriting the
  file on every keystroke; autosave stays debounced. Details and evidence:
  [docs/archive/bugs-browser-assessment-round-3.md](archive/bugs-browser-assessment-round-3.md).

## 2026-11-17 — application menu grouped by task

- The hamburger menu now keeps the frequent file, flow and history commands on
  its root surface and groups the rest into three named submenus: File & data,
  Layout & workspace and Application. Every command keeps its id, checked and
  disabled state and action; no menu state is persisted for the grouping.
- Keyboard navigation of nested menus was hardened: ArrowRight focuses inside
  a newly measured submenu, navigation keys no longer jump back to the root,
  and an internal submenu scroll no longer shrinks its own placement. Details,
  membership matrix and evidence:
  [docs/archive/bugs-hamburger-task-groups.md](archive/bugs-hamburger-task-groups.md).

## 2026-11-17 — selected flow-step properties edit the shared link

- The inline step inspector keeps its single selection path and kind-correct
  fields. Message endpoints are read-only context; picking a connector now
  keeps its reference in sync, so a later edit resolves the same link.
- For a message with a resolvable connector, the inspector exposes spark count
  and speed as shared link animation, with one source of truth for the 1–8 and
  0.25–4× bounds. Unknown or ambiguous references disable the controls and
  explain why instead of editing a guessed link. Other step kinds show no spark
  editor, and editing a derived flow's connector style does not materialise the
  flow. Details: [docs/archive/bugs-step-properties.md](archive/bugs-step-properties.md).

- Flows can carry an atomic multiline `description` block and a `presentation` flag
  (IR v13), alongside the legacy one-line form. TypeScript and Go parser, printer,
  IR and corpus parity changed together; new syntax error `E119` rejects an empty
  block. Flow-level notes are separate from the current step's description in the
  player, including on the closing card.
- A local typed Markdown subset is shared by the presentation aside and the `.md`
  export: headings, bold, italic, inline code, lists and links render as Preact
  nodes, with one URL policy. Raw HTML stays text, images are unsupported, and
  unsafe or active URL schemes never become links.
- The notes panel is a labelled non-modal aside that does not steal focus,
  refits the camera when it appears or disappears and on viewport resize, and
  stacks above the canvas on narrow screens. Details and evidence:
  [docs/archive/bugs-flow-markdown-panel.md](archive/bugs-flow-markdown-panel.md).

## 2026-11-19 — complete decomposition picker and embedded export

- Decomposition targets are a discriminated IR v12 value: a linked workspace
  path or an embedded child with its own recursive document and stable logical
  path. TypeScript and Go parser, printer, IR, validation, CLI and corpus parity
  changed together; `source` stays separate embedded program text.
- The properties panel picks from known workspace `.pcd` files and embedded
  children, keeps unresolved legacy values visible, explains disabled cyclic
  choices, and asks before an embedded child is converted to a linked file.
- `.pcd` export asks only when a linked child is reachable. “Embed all” uses one
  pure graph planner to embed every transitive descendant; any missing,
  unparsable, invalid, cyclic, shared or unreadable child fails the whole export
  with diagnostics. “Keep linked” preserves the root's authored links.
- Embedded children appear as derived explorer rows under their owning root.
  Their canvas, code, properties and flow editors use a root-plus-path document
  reference and one root-document write; no fake VFS file is created. Details:
  [docs/archive/bugs-embedded-decomposition.md](archive/bugs-embedded-decomposition.md).

## 2026-11-18 — named views removed, layout state promoted

- Named `view` blocks and the view bar are gone. One diagram now keeps its layout
  in explicit top-level `layout`/`position`/`pin`/`hide` statements (IR v11);
  `pcdToState` reads positions from that one block, so opening and editing a file
  still restores the saved arrangement. Legacy `view "…" { … }` and
  `drilldown "…" view <id>` are rejected with diagnostics E117/E118 and a manual
  conversion is documented in FILE-FORMAT §7.1.
- Route reset and diagram-layout reset are one undoable command each and use one
  shared selection policy in both the application and canvas menus. Resetting
  routes never changes object positions; Reset diagram layout clears positions
  and persists deterministic auto-layout, distinct from Reset workspace layout.
- TypeScript and Go parser, printer, IR, validation, CLI (`--view` removed),
  corpus/parity fixtures and the architecture seeds changed atomically. Details:
  [docs/adr/0007-remove-named-views.md](adr/0007-remove-named-views.md).

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
