# Changelog

All notable changes to PanelCraft. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: SemVer (pre-1.0 = milestone-driven).

## [Unreleased]

### Changed — every diagram has a live Default flow

- Every non-empty diagram now has a virtual **Default flow**, alongside any custom flows.
  Connections provide topologically ordered message steps and unrepresented objects provide
  process steps, including diagrams with no connections. Editing Default creates and selects
  an independent **Custom flow**; Default stays live as elements change. Creating or editing a
  flow rebases onto the current document and cannot discard its objects or connectors.
- Flow steps now reference diagram elements instead of duplicating their content. Connector
  labels and object descriptions are inherited in the inspector, playback and Markdown export;
  Mermaid export inherits connector labels and line styles. An explicit step value is a per-flow
  override and clearing it restores inheritance. Anonymous parallel connectors retain their
  distinct labels and styles.
- Flow-panel undo/redo now reaches the document history even while Code is collapsed, and
  collapsing or docking the panel preserves editor history. The editing session reconciles
  fast undo against the code buffer without mistaking a stale clean projection for the current
  file. This also fixes the first-keystroke focus loss when Default becomes a custom copy.

### Changed — Flow Steps lists the flow, Properties edits the step

- Flow Steps is a list again: one row per step with its number, type, title, the
  participants it moves between and a warning marker when the step does not
  resolve, plus play-from-here and duplicate. Adding a flow, adding a step
  (message, process, note, alternative, parallel, goto) and the all-flows export
  stay in the column; hidden connections are still reachable there.
- Selecting a step moves its properties to the Properties panel, grouped from
  what changes most to what changes least: kind and description, camera, playback
  (delay, advance), the connector animation shared by the step's link, then the
  advanced fields (flip, connector reference, hide connection). Selecting the
  flow shows the flow's own properties there — title, purpose, notes, the
  presentation toggle and illustration, and the exports. Introduction and
  Conclusion are always offered and dropped again when left empty.
- The two selections exclude each other: picking a flow or a step clears the
  canvas selection, and a press on the diagram clears the flow selection. The
  canvas reports that press itself, so a document reload cannot silently swap the
  panel while a step is being edited. Message endpoints are chosen from the
  document's own entities in closed-domain selects, which replaces the canvas
  pick buttons.

### Fixed — assessment of the second bug round

- The identifier-clarity gate is green again: thirteen lines this branch added
  (comments, test titles, one doc line) leaned on short plan tags such as a
  milestone or requirement number, so the CI step that rejects them failed.
  Each now says what it means in words.

- The presentation filmstrip browser scenario no longer depends on machine load:
  a pulse that had already finished dropped out of the element's animation list,
  so rewinding the layer silently skipped it and the sample read the rings'
  invisible base opacity. The scenario freezes the animation layer as soon as the
  spark exists and drops the finished camera glide after its own timer applied
  the framing.
- The flow step delay field no longer writes the same settled value twice. The
  quiet period and the blur both committed, and leaving an untouched field wrote
  once; the field now remembers the document's value and writes only a change.
  A browser scenario also proves a typed delay reaches the file once and is
  reverted by a single undo.

### Changed — known-value inputs and property hierarchy

- The icon control is now one searchable combobox with a single accessible name
  and value: the old free-text handle plus separate picker button is gone. It
  keeps project icons, built-ins, search, Manage project icons, no icon and a
  disabled unresolved choice for legacy handles, with keyboard navigation,
  Escape-to-focus-return and viewport-safe placement. All icon writes go through
  one command that also clears a stale style override in the same undo step.
- Object properties are ordered by task priority — Identity (name, kind, icon),
  Style, Metadata, Decomposition, Advanced — with section ids and persisted
  expansion unchanged. Flow `goto` file/flow and `process` targets are now closed
  domain selects with dependent flow options and visible diagnostics for values
  a file no longer contains; message endpoints are read-only and set from the
  canvas selection.

### Added — dedicated presentation links

- Presenting an authored flow now publishes `#present=<encoded-flow-id>` in the
  address bar. A direct load or reload opens that flow from the restored active
  file once browser storage is ready; Back leaves the presentation and Forward
  opens it again. Exit, natural end and external file switches clear the anchor
  without pushing extra history entries, while a cross-file `goto` keeps the
  link of the presentation that is still running. Malformed, unknown and
  non-authored ids fall back safely and never change the document. The hash
  carries only an encoded authored id, is never document input, and cannot give
  another browser profile access to this browser's local workspace.

### Fixed — spark and border effects share one beat timeline

- Connector sparks and actor border pulses no longer race on independent
  timers. A pure numeric timeline schedules, for every spark and every
  bidirectional leg, the source expansion, spark creation at peak expansion,
  travel, disappearance, arrival expansion and final rest inside the beat's
  dwell. The animator owns exactly the animations it creates and cancels them
  on replay, step change, exit and file change; camera glides are untouched.
  Reverse steps and bidirectional links pulse their resolved travel endpoints,
  parallel lanes keep independent timelines, and reduced motion shows the same
  settled frame without moving anything. A settled token now uses a unitless
  SVG transform so Chromium actually paints it at the destination.

### Added — UX-08 application experience

- **UX-08 WP13** Presenting is now a first-class action: a visible **Present** button (and the
  application menu) opens a launcher that lists every flow in the file with its purpose, step
  count and estimated length, derived from the playback plan (dwell plus camera transit). The
  camera frames each step by itself — introductions and conclusions fit the whole diagram, a
  message fits both participants with the connector and its label, a process step fits its shape,
  a parallel step fits all lanes, while a chooser, a note or a `goto` keeps the current view.
  Selecting a step exposes a **Camera** field — **Automatic**, **Hold**, or **Use current view**
  (records the viewport centre in canvas coordinates plus the zoom, so the framing survives a
  different window size), with clamped **Zoom** (0.1–4) and **Transition** (0–300 ms) fields. Step
  descriptions now surface under the narration line in both the transport and the present dock as
  part of the ARIA live region. Reduced motion applies each framing instantly with no glide. Two
  fixes came out of the present-mode screenshots: the tab strip no longer shows through the
  chrome-free shell, and the beat framing is recomputed for the wider present canvas so the step
  stays centred.

- **UX-08 WP12** Flows are now discoverable and authorable without memorising ids. Every
  collapsed panel keeps a labelled rail entry, so *flow steps* is visible in the default shell
  instead of hiding behind the View menu. The pane opens on a short explanation and **New flow**;
  a flow takes a **name** and a **purpose** (printed as its `description`), and each step is a
  numbered card with its kind, a readable title, the **actor names**, any step description and a
  note when it points at a shape the diagram does not define. Steps come from what you selected:
  **Add message** takes both endpoints from the selected connector, **Add process** needs exactly
  one selected shape, and **Add note**/**Add introduction**/**Add conclusion** are always there —
  impossible actions are disabled and say what to select, and no link is ever invented.
  `alt`/`par`/`goto` moved behind **Advanced step**, reordering works by drag, by the inspector
  arrows or with `Alt+↑`/`Alt+↓`, and **Present** plays the flow being edited. Four supporting
  fixes came out of the new end-to-end path: a blank file can now host a flow (it was rejected as
  a parse error), keyboard Enter activates shell buttons again after canvas interaction, typing in
  the pane no longer loses characters to the asynchronous file round-trip, and rails show their
  panel name instead of a bare chevron.

- **UX-08 WP11 (format, IR v8)** Flows and their steps can now document themselves in the file.
  A flow takes a one-line `description`, and any step may carry a `presentation { … }` block with
  a `description`, a `camera` override (`auto`, `hold`, or `focus (x, y) zoom n` in document
  coordinates) and a camera `duration` (0–300 ms of travel time, deliberately separate from the
  existing per-step `delay` dwell). Metadata is order-free on input and always printed in one
  canonical order; absent metadata prints nothing, so pre-v8 documents keep their exact canonical
  form. Ranges are enforced with positioned diagnostics in both engines, and Mermaid export
  declares the new fields as drops. The TS parser/printer and the Go CLI were updated together —
  shared fixtures and the whole corpus replay byte-identically — and a new
  `testdata/corpus/flow-presentation/` case covers all eight step kinds and all three camera modes.

- **UX-08 WP10** Connection labels are now readable on dense diagrams instead of being covered by
  shapes. Routes still paint below the objects; labels moved into their own layer *above* them
  (and are `pointer-events: none`, so a label floating over a shape never steals its click). Text
  is measured and wrapped to a bounded box (180 units wide, at most three lines) that is used for
  both collision scoring and paint, so what was scored is exactly what a reader sees. Placement
  slides along the route — in run-local coordinates, so orthogonal, straight and curved routes
  share one algorithm — with escalating offsets, scoring object, unrelated-route and earlier-label
  collisions first, then whether the box would hang outside the drawn frame, and distance only as
  a tie-break; route order keeps it deterministic. Displaced labels get a subtle dashed leader,
  faded/selected/playback states carry through, the full text stays in `aria-label` and in the
  route's hover text, and no label is ever dropped for length alone.

- **UX-08 WP09** A selected connector's geometry is now editable, not just its endpoints. Slidable
  runs show a channel grip: dragging it slides the whole orthogonal segment sideways while the
  semantic `anchor from`/`anchor to` endpoints stay pinned to their entities. Bends are draggable,
  double-clicking a channel adds one under the pointer, a focused bend nudge-moves with the arrow
  keys (one grid step, one unit with `Shift`) and is removed with `Delete`/`Backspace`, and
  `Escape` cancels the gesture in flight. Channels snap to entity corners, side midpoints and
  centres before the grid, with `Alt` suspending snapping. Properties gained an **Endpoints**
  block — **Start**/**End** as `Auto`/`Top`/`Right`/`Bottom`/`Left` plus a side-relative
  percentage, **Reset bends** and **Reset route** — placed above the appearance controls because
  geometry is what a reader follows. Every gesture is one undo step, and an untouched automatic
  route still gains no geometry: waypoints are materialised only when a route is actually edited.
- **UX-08 WP09 fix** Double-clicking a channel grip did nothing: the browser only emits `dblclick`
  when both clicks hit the same element, and the no-op pointer release repainted the overlay and
  replaced the handle node. An inert channel release no longer repaints, so the gesture works —
  and a unit test pins the node identity that the browser requires.
- **UX-08 WP09 fix** A connector route that doubles back on itself (the F-19 waypoint router goes
  down to a waypoint and back up the same channel) drew two overlapping grips, one per raw
  segment, and sliding either one deformed the route. Grips are now derived from maximal collinear
  *runs*, so such a route offers one grip and sliding it moves the whole run.
- **UX-08 WP08** A connector no longer hides its properties behind a lucky click: double-clicking
  a link's line, pressing `Enter` while it is the only selected link, or choosing **Properties**
  from the link's context menu all select it, bring the Properties panel back (even after it was
  closed) and put the cursor in its **Label** field — without selecting or clearing what is
  already there, so typing appends. The canvas only reports what to inspect; the shell owns the
  panel and focus. Object double-click/F2 inline rename is unchanged, and no gesture fires while
  you are typing in a field or the code editor.

- **UX-08 WP07** A shape's icon now sits at the top centre and the whole wrapped label block is
  centred in the space the icon leaves, so icon and text read as one unit instead of a label
  pinned to the shape's bottom edge with an icon stranded in the top-right corner. Rendering,
  text wrapping and auto-fit read one content box (icon band, built-in glyph band, label region,
  reserved queue/note/imported bands), so a person's head, a datastore's cap, a queue's arrow
  band and a note's fold can no longer collide with either. A box too short to stack the icon
  moves it beside the label rather than cropping it, explicit geometry in the document is never
  rewritten, and a group keeps its top-left title with a centred icon.
- **UX-08 WP07 fix** Unfilled glyph strokes were drawn as filled blobs: a `fill="none"`
  presentation attribute loses to the stylesheet's `.pc-glyph` fill, so the datastore lid and a
  note's folded corner rendered in the muted glyph colour (a light lid on a dark body in the dark
  theme). They opt out by class now, and a unit test refuses any `fill` attribute on glyph specs.
- **UX-08 WP07 fix** The `ux04-wide-short-dark` capture was taken in the light theme (pixel
  check: canvas `250,250,250`); it is `ux04-wide-short-light` now, so a screenshot name no longer
  claims a theme it did not render.

- **UX-08 WP06** A resize now always states its size: a badge beside the dragged handle shows the
  live `W × H`, and every other selected object keeps a badge with its own unchanged size — so a
  multi-selection drag reads at a glance which object is changing. Equal-size matches keep their
  separate bracket cues, so a snapped dimension still looks different from a plain measurement.
  A multi-selection exposes one handle set per selected object (only the grabbed object resizes);
  the badges keep a constant on-screen type size at any zoom, clamp inside the viewport, never
  enter an SVG/PNG export, and the canvas announces `Size W × H` once per frame instead of a live
  region per badge.
- **UX-08 WP06 fix** A CSS token typo (`--pc-text`) left the passive size badge black on the dark
  theme; the chrome token test now fails whenever a `var(--pc-…)` reference is undeclared.
- **UX-08 WP06 fix** The menu popover moved focus to its first item a frame after it became
  interactive, stealing focus back from a user who had already entered the list — Enter then ran
  the first action instead of the focused one. The popover now focuses synchronously on mount.

- **UX-08 WP05** The canvas grid has three independent states and no longer drags snapping along
  with it: *Application menu → View* offers **Grid: off / dots / lines** (radio) plus a separate
  **Snap to grid** checkbox, both stored as browser-local editor preferences and restored on
  reload. `G` toggles visibility and brings back the last visible type. Line and dot colours are
  themed tokens with a measured, deliberately low contrast, the line pattern stays one screen
  pixel at any zoom, and the grid is dropped below 50 % zoom where a cell would blur into an even
  tint. The grid stays editor chrome: it never reaches `.pcd` views, the minimap, presentation
  mode or an SVG/PNG/CLI export (sanitising strips it). Existing documents default to grid off
  with snapping on, so no stored diagram changes appearance or behaviour.
- **UX-08 WP05 fix** The application menu dismissed on Escape only through a window listener that
  attaches after the popover's first paint, so an Escape pressed while focus was still on the
  trigger left the menu open and blocking the canvas. The trigger now closes its own popover.

- **UX-08 WP04** PanelCraft is installable: a base-aware `manifest.webmanifest` with a stable ID,
  relative `start_url`/`scope`, `standalone` display and generated 192/512 px any+maskable icons
  (`scripts/gen-icons.go`, stdlib only). Chromium reports no installability errors. The app menu
  offers **Install application** when the browser can prompt and **Install from browser menu**
  otherwise; a standalone window shows neither. The service worker now precaches scope-relative
  URLs, so the same bundle installs and works offline under `/` and under a sub-path.
- **UX-08 WP04** Updates are user-consented. A new worker waits (no `skipWaiting` on install); the
  shell shows a non-blocking *Update available* banner with a primary **Restart** and a secondary
  **Later**, keeps the offer in the app menu after Later, and queues it while a flow plays or a
  presentation runs instead of stealing focus. Restart flushes the workspace first, asks before
  discarding unapplied code, then reloads exactly once on `controllerchange`.
- **UX-08 WP04 fix** A worker that claims the page (`clients.claim()`) no longer triggers a silent
  reload: only an explicit Restart reloads, so the first visit cannot duplicate canvas state.
- **UX-08 WP03** The editor shell now runs on one semantic chrome token layer (activity rail,
  panels, tabs, lists, menus, inputs, buttons, focus, disabled, banners, scrollbars) with WCAG AA
  pairs asserted in both themes; chrome controls use the owned 16 px inline SVG icon set instead of
  Unicode glyphs, targets are 32 px, and the deleted duplicate chrome block in `app.css` no longer
  overrides the themed rules. `docs/STYLE-GUIDE.md` documents the chrome tokens, control/icon rules
  and the "no inline colours" contract.
- **UX-08 WP03 fix** A menu whose first entry is unavailable now focuses its first *enabled* action
  (focusing a disabled button is a no-op and stranded keyboard focus on the trigger).
- **UX-08 WP03 fix** The clear-data dialog takes focus on its confirmation field and dismisses on
  Escape from anywhere inside the modal, not only from that field.

### Added — UX review

- **UX-01** Added a reusable Laws of UX review skill with 30 PanelCraft-specific references.
- **UX-02 follow-up** A transient viewport blip (fullPage screenshot metrics, a
  hidden/minimised window) no longer collapses every open panel: resize recovery
  waits for the resize to settle and ignores implausible widths, so a settled
  docked workspace survives such frames.

### Added — connector, flow and UX review (CX/FLOW/UX backlog)

Closes the queued backlog items in `bugs.md`; each one keeps its own archive record
under `docs/archive/` with the executed plan, validation and review evidence.

- **CX-01** Connector start/end points are draggable and lock to the entity perimeter,
  with the automatic side/midpoint choice still the default and one undoable edit per move.
- **CX-02** Deterministic route avoidance keeps committed connector polylines clear of
  objects, with an explicit per-link overlap override where avoidance is impossible.
- **CX-03** Objects carry a persisted stacking order (Auto by default, stable
  document-order ties) projected identically by paint order, hit-testing, the mini-map,
  exports and the CLI.
- **CX-04** Connector route, line texture, typical weights and independent head/tail
  markers are chosen from inline-SVG preview tiles in front of a real radio group; the
  numeric Width field still accepts any custom width and no document/IR change was needed.
- **FLOW-01** Flows are edited through an on-demand Flow Steps panel the canvas can drive,
  without a separate flow store and without inventing links.
- **FLOW-02** Connectors carry playback intensity (spark count and speed) without changing
  flow timing, dwell or validation; missing values reproduce the previous behaviour.
- **UX-03** Files became an on-demand workspace browser instead of a permanently docked list.
- **UX-04** Element text no longer mixes with glyphs and icons: label and icon content live
  in separate regions that survive resize and reload.
- **UX-05** A persisted System/Light/Dark application selector applies before first paint and
  stays independent of the diagram's own PDL theme.
- **UX-06** Equal-size cues and snapping guide component resize, with the snapped result kept
  as one undoable resize.
- **DOC-01** The user guide now documents the context-menu commands the canvas really offers
  and no longer advertises stacking commands that do not exist.

### Fixed — file row actions in a narrow panel

- A long file name no longer hides the row actions in the Files panel. The name is
  the only shrinkable part of the row, it wraps to two clamped lines with an ellipsis
  (the tooltip and the tab carry the full name), and the duplicate/rename/delete
  buttons keep a non-shrinking area inside the panel with no horizontal overflow.
  Right-clicking a row — or pressing `Shift+F10`/the context-menu key on it — offers
  the same actions in a menu built on the shared surface, so a cramped row, a touch
  screen or a keyboard user can still reach them; the menu targets the row it was
  opened from, delete keeps its two-step confirmation, and focus returns to that row
  when the menu closes or a rename is cancelled instead of falling to the document
  body. See `docs/archive/bugs-long-filenames-file-actions.md`.

### Fixed — menu viewport contract

- Every menu surface now shares one viewport-safe contract. Placement is measured:
  a menu opens on the side with room inside an 8 px margin, never covers its own
  trigger, and scrolls internally when the requested height does not fit; nested
  submenus flip to the left of their row instead of running off the right edge.
  Overflowing lists show a scroll cue and keep keyboard focus scrolled into view.
  The canvas context menu moved onto the same shared surface, so it gains
  arrows/Home/End/submenu navigation, Escape/Tab dismissal and focus restoration to
  the canvas, and its nine align/distribute/equal-size commands are grouped in one
  reachable **Arrange** submenu while Properties, Duplicate, Copy, Paste and Delete
  stay direct. See `docs/archive/bugs-menu-viewport-contract.md`.

### Added — presentable default flow

- A document that has connections but no authored flow is presentable immediately:
  the Flows pane and the presentation launcher offer a **Default flow** derived from
  the connections in the same stable topological order the editor already used, with
  labels and parallel links preserved and creation order as the cycle fallback. It is
  virtual: opening, presenting, saving and reloading write nothing into the `.pcd`, and
  the first explicit edit materialises it as one ordinary undoable command. An authored
  flow always wins. This closes the gap behind the default C4 template, where "buys"
  and "charges" existed as links but nothing could present them. See
  `docs/archive/bugs-default-virtual-flow.md`.

### Fixed — connector routes are validated end to end

- A connector is now validated as a whole polyline instead of by its endpoints.
  Three causes were fixed: explicit bends were passed through verbatim, so a
  bend placed inside an entity drew the route through that shape and its label;
  automatic routes never counted their own two endpoint rectangles as obstacles,
  so an anchored route could cut through the entity it pointed at; and candidate
  scoring ignored direction reversals, so a connector that ran out, back and out
  again was not treated as a loop. Each authored leg is now routed around entity
  rectangles while keeping its valid bends (an intentional detour survives), an
  automatic candidate is scored by interior crossings — endpoints included — then
  shared lines with other connectors, then reversals, then length, and a bend
  that lies inside an entity is skipped rather than silently relocated: the file
  keeps the authored `waypoint` line and the connector explains itself in its
  tooltip, accessible description and `data-route-warning`. `allowOverlap` links
  keep their explicit opt-out. See `docs/archive/bugs-route-validation.md`.

### Fixed — entity label centering

- Entity labels are centred on their rendered bounds. The SVG `y` carried a font
  ascent while the stylesheet also centred the em box on it, so every label sat
  4 px too low; `y` is now the centre of its line box and the ascent constant is
  gone. A block too tall for its region (a 32 px datastore) is clamped to the
  region top instead of overflowing into the shape's glyphs. The label region is
  published through the existing `contentBox()` geometry so connector routing and
  auto-fit share one calculation. See `docs/archive/bugs-entity-label-centering.md`.

### Changed — visible default grid

- A profile that has never chosen a canvas grid now shows a subtle dots grid
  with snapping on, instead of an empty canvas. The new default is safe to ship
  because the migration decision is made per field: a stored, valid grid type is
  an explicit choice and is kept verbatim (including `off`), while a missing or
  corrupt field is a missing preference and takes the new default. Snapping stays
  independent of visibility, the last-visible-type memory behind the `G` shortcut
  and the sub-50 % zoom suppression are unchanged, and the grid remains editor
  chrome that never reaches the document, the minimap, presentation mode or an
  export. See `docs/archive/bugs-visible-default-grid.md`.

### Fixed — review pass 2 (docs/FIX-PLAN.md)

- **F-01** Canvas edits no longer rewrite the file as an objects+links
  projection: `applyCanvasState` (engine/model/merge.ts) merges the canvas into
  the parsed document, so flows, views, positions, styles, imports, meta,
  comments, attributes, tags and waypoints survive a drag/rename. The bare
  projection remains only as the unparsable-buffer fallback.
- **F-02** Object/link ids are never reused: `loadState` re-baselines the id
  counter from the loaded file and `addObject`/`commitLink` probe for a free id
  (`uniqueId`), so a new object can no longer duplicate an existing id.
- **F-03** Machine→editor writes are minimal diffs (`codeview/diff.ts`): the
  caret keeps its logical position instead of collapsing to offset 0, and a
  write that only differs in trailing whitespace is skipped entirely.
- **F-04** The code buffer is no longer canonicalised under the caret: an idle
  apply keeps exactly what the user typed, the canonical form goes to the file,
  and Format (`Shift-Alt-f`)/save is the explicit canonicalisation path.
  `divergedFromSaved` compares meaning (canonical print), not bytes.
- **F-05** The printer omits an empty attribute block, so a canvas-origin write
  no longer touches every line (corpus + Go parity fixtures regenerated).
- **F-06** `group` and `note` objects survive a load (they were filtered out of
  the canvas projection and disappeared on the next apply).
- **F-07** `dashed` (object and link) and `bidir` round-trip through the canvas
  merge into the file's `style` block instead of being dropped.
- **F-08** Canvas-origin link semantics no longer mutate: untyped arrows stay
  untyped (no injected `uses`), `a <-> b` stays bidirectional, and the
  properties panel gained an explicit "(untyped)" option.
- **F-09** Repo hygiene: `dist/**` and run screenshots are untracked; e2e captures
  go to `test-results/screenshots/`, curated goldens live in `e2e/goldens/` and are
  refreshed only with `UPDATE_GOLDENS=1`; `scripts/check-repo-clean.sh` gates
  tracked generated content and worktree cleanliness (CI + `verify.sh`).

- **F-28/F-29** Startup and durability defects found while verifying F-01: a
  pre-load canvas snapshot is no longer mistaken for an edit (it could write an
  object-less document over the file), a no-op render request no longer cancels a
  newer pending render, and document content is persisted immediately instead of
  riding the 800 ms autosave debounce (a reload inside that window lost the edit).

- **F-13** (IR v2) Objects carry optional `size <w> <h>` geometry: a known attribute
  in the parser/printer/serializer (TS + Go, corpus and parity fixtures regenerated),
  resize with eight anchors on every kind (min 48×32, grid snap, one undo per drag),
  fit-to-name through an injectable text-measurement port (two-line wrapping,
  grow-only on create/rename/load) and an explicit `Fit` command.

- **F-14** Geometry persists: a drag/resize end commits the moved positions into the
  active view (implicit `Default`, 250 ms debounce) through the sync machine, so the
  canvas, the code view and the file agree; opening/switching only applies stored
  positions. `Auto-layout` is explicit, undoable and persisted; a new `Reset layout`
  drops the view's `position` lines without touching the diagram.

- **F-12** Arrow visual model: link style blocks carry `head`/`tail`/`line`/`width`
  (TS + Go, corpus/parity fixtures cover it); the renderer has one marker per shape
  (`arrow|open|diamond|circle|square|none`) for both ends, line textures and stroke
  width, plus a per-type colour hint via `data-link-type`. Properties panel gained
  head/tail/line/width controls and `Shift+A` cycles the head (undoable).
- **F-30** Machine→editor projections are no longer fed back as user typing (they
  could flip the sync chip to `editing`/`error` after a pure canvas write) and focus
  is re-asserted after a projection.

- **F-31** The offline e2e spec no longer races its own service worker (serial file +
  cache selected by name), removing an intermittent red gate.

- **F-10** Collapsible, resizable shell: every panel (files, shapes, code, properties)
  collapses to a rail — the code rail keeps the sync-state chip — with persisted widths
  (`StoredWorkspace.settings`, schema v2 + migration), drag splitters with clamps and
  `Ctrl/Cmd+B` / `Ctrl/Cmd+J` / `Ctrl/Cmd+Alt+P` shortcuts. The code pane starts
  collapsed below 1440 px, so the canvas gets its width back on small screens.
- **F-32** The stored layout is adopted during render, so the first click after load is
  never overwritten; focus follows a collapsing panel to its rail button.

- **F-11** Properties panel sections: Identity / Metadata / Style / Advanced, collapsible
  with a persisted state; new controls for custom key-value `property` entries, style
  overrides (fill/stroke/text/icon, painted through CSS custom properties on the object
  group) and a link `Bidirectional` toggle; the Advanced section shows id, size and the
  `Fit to name` command.

- **F-15** In-place rename: `F2` or double-click opens an input on the canvas (screen
  space, follows pan/zoom, chip above 200 % zoom), Enter/blur commit as one undoable
  change, Escape cancels; canvas label, properties panel and code line stay in sync.

- **F-17** Illustration registry: six beat illustrations (travel-token, pulse,
  sequential-glow, packet-burst, compare-split, trail-fade) with per-kind defaults and
  a per-flow choice in the flow header; the planner is unchanged.

- **F-18** Flow editing parity: steps drag-reorder, duplicate (deep copy) and carry an
  editable per-step dwell — new `delay <ms>` step attribute (IR `delayMs`, TS + Go,
  parity fixtures, applied by the planner); the step header is sticky with an `unsaved`
  chip and every step offers "play from this step".

- **F-19** Canvas command layer: clipboard copy/paste with fresh-id remapping,
  duplicate, align (six anchors), distribute (x/y) and equal-size — each one undoable
  and reachable from `mod+C/V/D` or a right-click context menu that only offers what
  the selection allows. Link waypoints are now document data the canvas can edit:
  routing passes through them orthogonally and a selected link exposes draggable
  handles that write straight back to the file.

- **F-20** Imports resolved and rendered: `alias.objectId` references are now part of
  the grammar (lexer + parser for link endpoints, flow targets and `attach`, TS + Go
  parity), imported objects render as read-only ghosts (dashed, `imported` badge)
  click-through to their source file, links to them survive canvas writes, and
  missing/cycle/escape problems surface in a banner.

- **F-21** Mermaid interop completed: `sequenceDiagram` import (participants → objects,
  messages → a flow), `classDef`/`class` → tags (colours declared as a drop),
  `linkStyle` → link style, a `C4Context` exporter, and a generated
  `docs/MERMAID-MATRIX.md` asserted against the converters' declared drop catalogues.

- **F-22** Canvas accessibility and the canvas↔code map: scene nodes are focusable
  (`role`/`aria-label`), `Tab`/arrows walk the objects with roving focus (`Enter`
  select, `F2` rename), a selection highlights the matching statement in the code view
  (decoration, no caret stealing) and a caret on a statement selects its object.

### Added — M2 Canvas MVP (PLAN §4)

- Imperative SVG canvas (ADR-0001): viewport pan/zoom (10–400 %, wheel +
  keyboard), grid toggle, fit-to-diagram.
- Diff-patch scene-graph renderer — stable ids, move-only transform swaps,
  selection persistence; C4 shape set (person/system/system_ext/container/
  component/datastore/queue/note/group) styled exclusively via theme tokens.
- Selection: click, shift-multi, rubber band, link hit-testing with slop.
- Drag with 8 px grid snap + alignment guides; anchored group resize.
- Link UX: edge-halo drag → ghost → commit, orthogonal router v1 with
  obstacle detour; link type/label/dashed editing.
- Properties panel: name/description/technology/tags/dashed — every edit an
  undoable ValueChange; undo/redo (mod+z / mod+shift+z) with 100-step stack
  and typing-run coalescing.
- Palette: 9 C4 kinds — click-to-place, pointer drag-drop, 1..9 quick-add.
- S1 e2e (create flow, light/dark screenshots), N1 perf baseline (60 fps
  pan/zoom/drag at 300 objects), vision review round 1 — docs/milestones/M2.md.

### Added — M0 Scaffolding (PLAN §2)

- Canonical GPL-3.0-only LICENSE (replaces pre-M0 placeholder).
- Web build: vite + Preact + TypeScript strict; eslint complexity gates
  (≤12); vitest + v8 coverage with thresholds (core 80%, `ui/*` 60% reported).
- Go shell: `panelcraft serve` (embedded SPA, strict CSP, SPA fallback,
  read-only `/files/*`, dev-mode `--dev-dir`) and `panelcraft version`.
- CI: `ci.yml` stage chain (SPEC §8.5), `pages.yml` + `release.yml` stubs
  (deploy/release engineering land with M7).
- `scripts/verify.sh` multi-stage local gate (`m0` first) and
  `scripts/check-selfcontained.sh` asset-origin scan (N7/N11).
- Playwright scaffold: S7 no-network smoke + light/dark screenshot baselines,
  pixelmatch visual-diff util.
- Docs: STYLE-GUIDE (tokens + vision checklist), ARCHITECTURE skeleton,
  milestone log `docs/milestones/M0.md`.
