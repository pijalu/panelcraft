# PanelCraft — user guide

Everything happens in your browser; nothing is sent anywhere (SPEC FR-S1).
Screenshots reference the light application theme; the dark theme mirrors every feature.
Choose **View → Application theme → System / Light / Dark**. System follows live OS changes;
Light and Dark override it. The choice is stored with browser-local workspace settings and is
applied before the app paints on reload. It is independent of a document's `theme` directive
and the CLI's `--theme` option.

## 1. Workspace basics

- The left tree holds `.pcd` files; the toolbar creates files, imports `.pcd`
  / mermaid (`.mmd`/`.mermaid`) or a workspace `.zip`, and exports.
- Tabs across the top switch open files; the dot marks unsaved changes.
- **Everything is stored in your browser** (IndexedDB) — use *Export ZIP*
  regularly for backups (the app reminds you; SPEC FR-S2) and *Snapshots*
  for named restore points (restore goes through the full migration chain).
- *Clear data…* wipes the local workspace — it cannot be undone.

## 2. Editing a diagram

### Canvas
- **Palette** (left): grouped by C4 level (Context/Container/Component, plus
  Structure for group/note). Click a kind — or press `1`–`9` — then click the
  canvas; dragging a palette row onto the canvas also places it.
- **Grid**: *Application menu → View* offers **Grid: off / dots / lines** and a separate
  **Snap to grid** checkbox. The two are independent browser-local preferences (the grid is
  editor chrome: it is never written into a `.pcd` view and never appears in an SVG/PNG export).
  `G` toggles visibility and brings back the last visible type.
- **Select**: click; Shift-click adds to the selection. Drag moves (snaps to
  the grid). **Rename** an object in place with `F2` or double-click; Enter commits,
  Escape cancels.
- **Inspect a link**: a connector has no name to edit in place, so double-clicking its
  line — or pressing `Enter` while it is the only selected link — selects it, opens
  **Properties** and puts the cursor in its **Label** field (right-click → **Properties**
  does the same). A closed or collapsed Properties panel comes back first, and the
  request never runs while you are typing in a field or the code editor.
- **Resize**: select anything and drag one of the eight handles; the box stays
  on the grid and never gets smaller than 48×32. While you drag, a badge beside the
  handle shows the live `W × H` (and every other selected object keeps a badge with its
  own unchanged size — only the object you grabbed changes); a multi-selection therefore
  offers a handle set per selected object. Within 4 canvas units of another
  visible object's width or height, the nearest matching dimension snaps into place
  and a red bracket labels `W = …` or `H = …`. Corner handles can match both dimensions.
  These cues also describe the match to assistive technology and disappear on commit
  or Escape without entering document data. An explicit size is saved as `size <w> <h>`;
  "Fit to name" (properties → Advanced) recomputes it.
- **Connect**: drag from an edge halo (or right-click → connect) to a target.
  A link's type/label/arrowheads/line/route/width live in the properties panel. Head, tail,
  line texture, route and typical weights are **preview tiles** (inline SVG + text label):
  click one or use the arrow keys inside the radio group, and the selected tile shows a check
  mark and weight rather than colour alone; any other width is typed in the **Width** field.
  `Shift+A` cycles the head shape. Route defaults to orthogonal routing that avoids
  solid objects and earlier connectors where possible. Enable **Allow overlap** on
  one link to permit crossings instead; dense or fully blocked diagrams can still
  have unavoidable intersections. The mini-map uses the same routed geometry;
  straight draws direct segments and curved draws Bézier geometry. Both retain explicit
  waypoints. Drag a child link's midpoint to add a waypoint. Select a link to reveal its
  hollow start handle, filled destination handle,
  and any waypoint handles. Drag either endpoint around its entity, including onto a
  corner: pointers inside or beyond the object clamp to the nearest perimeter point,
  so the connector cannot detach. Endpoint positions are stored as normalized
  `anchor from` / `anchor to` values and retain their side-relative position after
  resizing and reloads. Intermediate waypoints remain freely draggable and always
  override automatic avoidance, including when **Allow overlap** is off. Labels
  automatically try nearby positions to avoid objects, other routes, and
  other labels; a text halo keeps the least-bad fallback readable in dense diagrams.
- **Sparks**: a link can carry **Spark count** (1–8) and **Spark speed** (0.25–4×) for
  flow playback, saved as `sparks n` / `speed n` inside its style block. Several sparks
  stagger along the path; a bidirectional (`<->`) link ping-pongs until the step ends,
  while a one-way link completes once. Speed changes only the spark motion, never the
  step delay, and reduced-motion playback shows static emphasis instead.
- **Pan / zoom**: Space-drag or wheel/trackpad pans; Ctrl/Cmd+wheel zooms.
  The bottom-right **mini-map** shows the topology and current viewport. Click it
  to center that location; with it focused, arrow keys pan and Home fits the
  diagram. It follows flow-camera movement, hides during presentation and on
  narrow screens (≤640px), and uses the active light/dark theme.
- **Hover** an object to see its name, technology, description and tags.
- **Keyboard**: arrows move the selection, Tab/Shift+Tab move focus between
  objects, Delete removes, Escape deselects or closes the active overlay.
- **Stacking order**: objects paint and hit-test in document order by default.
  Properties → Advanced → **Stacking order** takes a whole number, or stays blank
  for **Auto**: negative values sink below Auto objects, positive values rise above
  them, equal values keep document order, and clearing the field returns the object
  to Auto. The change is undoable and saved as `z <n>`. Links always paint below
  objects, and the mini-map, SVG/PNG exports and `panelcraft render` use the same
  order.
- **Context menu** (right-click): **Properties** (a single selected object or link;
  disabled for larger selections), **Duplicate**, **Copy**, **Paste**, **Delete**,
  **Align left**, **Align centre (horizontal)**, **Align right**, **Align top**,
  **Align middle (vertical)**, **Align bottom**, **Distribute horizontally**,
  **Distribute vertically**, and **Equal size** (the last three need two or three
  selected objects and stay listed but disabled otherwise). There are no stacking
  commands in the menu: layering is the **Stacking order** field in properties →
  Advanced.
- **History**: Ctrl/Cmd+Z / Shift-Ctrl/Cmd+Z act on the surface that has focus;
  the header's `⟲ History` lists the last actions across canvas and code with
  routed Undo/Redo.

### Saved state
- The header pill says `Saved · HH:MM` or `Unsaved`, and shows a problem chip
  while the buffer has parse errors. With errors the canvas keeps the last good
  render, rings the offending object and shows an "out of date" banner instead of
  freezing silently.

### Empty file
- A new file offers three templates (C4 context, flow, mermaid starter); picking
  one inserts real `.pcd` text you can keep editing.

### Code view (source of truth)
- The pane under the canvas always shows the canonical `.pcd` text; every
  canvas edit lands there, and every code edit re-patches the canvas
  (debounced; diverged states resolve through a guided dialog, M4).
- `Shift-Alt-F` formats the buffer.
- Clicking an object highlights its statement here (no caret stealing); putting
  the caret on a statement selects that object on the canvas.
- Mermaid: paste a `flowchart`/`graph`/`sequenceDiagram` block to convert it;
  `docs/MERMAID-MATRIX.md` records exactly what imports and what is dropped.

### Views & tags (M6)
- **Tags** (`tag core` lines): toggle via the chips above the canvas — hidden
  tags fade their objects (both endpoints must fade for a link to fade).
- **Named views**: store per-view hide rules *and* saved positions; switch
  from the view bar; *apply layout* runs dagre and commits positions to the
  active view. Pin objects to opt them out of re-layout.
- **Dependencies panel**: select an object to see incoming/outgoing links and
  focus it (everything else fades).

### Search
- `Ctrl/Cmd+P` — fuzzy search over files and objects; Enter jumps (opens the
  file, reveals the object), Esc closes from anywhere.

## 3. Flows (step-by-step stories)

1. Open **View → Flow Steps** (there is no permanent Flows tab): the panel docks, floats,
   collapses and closes like any other, and it is absent until you ask for it.
2. Add a flow (`flow "Happy path" as happy { … }` in code, or **+ flow** in the panel) and
   add steps. Each step is a card with its kind, title and actor/link summary; reorder with
   drag or the ↑/↓ buttons, and nested `alt`/`par` editing lives in the same card inspector.
3. **Target from the canvas** instead of typing ids: select an object and press **From
   selection** / **To selection** / **Target selection**, or select a connector and press
   **Use connector**. A message step is only ever seeded from an existing link — with no link
   in the document the panel says so instead of inventing one. Selecting a card highlights
   its participants on the canvas and fades the rest.
4. **Play**: the docked transport steps through the plan — the active step's
   elements highlight, the previous step's participants fade lightly, and the rest
   dim; the narration line is an ARIA live region
   (screen readers announce every step). `prefers-reduced-motion` plays without
   transition animation. Each step may carry `delay <ms>`; the flow's
   illustration style (token, pulse, glow, burst, split, trail) is chosen per
   flow in the Flow Steps panel. When a flow ends, a closing card offers replay,
   `Export SVG` and close.
5. **Present**: `⛶` enters the chrome-free shell — click or press Space/→ to
   advance, ← to go back, `P` pauses, `R` restarts, `Esc` exits and restores the
   previous chrome and viewport.
6. **Export a sequence**: select a flow, then choose `.seq.mmd` beside *Steps*.
  The download is a Mermaid `sequenceDiagram` with participants, messages,
  alternatives, parallel lanes and notes. `goto` navigation, per-step delays and
  notes in a flow with no participants cannot be represented and are reported by
  the converter's `dropped[]` result; sequence import still warns on block syntax.

## 4. Import / export

| Action | How | Notes |
|---|---|---|
| Export single file | toolbar → *Export* | `.pcd` (canonical), `.mmd` (flowchart), `.svg` (sanitized), `.png` (2×) |
| Export selected flow | *Flows* → select flow → `.seq.mmd` | Mermaid `sequenceDiagram`; one flow per download |
| Import mermaid | toolbar → *Import* | best-effort converter; result lands in the code view for review |
| Workspace round-trip | *Export ZIP* / *Import ZIP* | includes all files; snapshots stay local |
| SVG safety | automatic | exported SVG is sanitized (no scripts/event handlers/foreign objects) — SPEC N6 |

## 5. Offline

The service worker caches the app shell on first load. Afterwards the app
boots with the network cut; your workspace (IndexedDB) is unaffected. When an
update has been cached, the app surfaces it on the next reload.

## 6. CLI reference

`panelcraft <command> [flags]` — the same binary serves the web app and
validates/converts `.pcd` files. Exit codes: `0` ok, `1` error-severity
findings / parse failure, `2` usage error.

### `panelcraft serve [--addr :8080] [--open] [--dev-dir DIR] [DIR]`
Serves the embedded app at `/`; `DIR` (or `--dev-dir`) is exposed read-only
under `/files/` (no listing, traversal-guarded). Strict CSP headers; no
telemetry, no runtime network.

### `panelcraft validate [--json] PATH...`
Validates `.pcd` files (file or directory, globbed `*.pcd`, sorted).
`--json` emits the machine-readable report. Imports are resolved within the
workspace: cycle ⇒ `P102` (warning), escape ⇒ `P103` (error), missing ⇒
`P200` (warning). Exit `1` only for error-severity findings.

### `panelcraft convert [--out FILE.pcd|DIR] INPUT`
Converts Mermaid flowchart/graph, C4 (Context/Container/Component/Dynamic and the
supported deployment subset), or sequence input (`.mmd`/`.mermaid`/`.txt`) to
canonical `.pcd`. A `.pcd` input is canonicalised instead. `-o`/`--out` works
before or after the input; without it, Mermaid writes a sibling `.pcd` and PDL
is formatted in place. Unsupported constructs produce named diagnostics rather
than silent drops. Fatal input errors write no output.

### `panelcraft render INPUT.pcd --out OUTPUT.png|svg [flags]`
Renders the selected view through headless Chrome. Flags: `--width 1920`,
`--theme dark|light`, `--view NAME`, and `--chrome /path/to/chrome`. Output
uses a deterministic 16:9 canvas; position-free/auto views use compound dagre
layout so C4 boundaries contain their members. The renderer is isolated from
IndexedDB, service workers, workspace storage, and external network access.
Chrome startup, parse, view, and output errors are actionable; `--chrome` (or
`PANELCRAFT_CHROME` for tests) selects a non-default browser.

### `panelcraft version`
Prints `panelcraft <semver> (<os>/<arch>)` — release builds stamp the version
at link time.

## 7. File format

Normative grammar: [docs/FILE-FORMAT.md](FILE-FORMAT.md). A `.pcd` file is
UTF-8 text: header (`pcd 1.0`, title, level, direction), objects with kind/id/
name/attributes, links (`a -> b : "label"`), flows, views, styles. Comments
start with `#`.
