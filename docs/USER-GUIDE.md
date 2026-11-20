# PanelCraft — user guide

PanelCraft is local-first. Static hosting stores your workspace in the browser and sends
no workspace data anywhere. You can explicitly choose a local folder in a supporting
browser, or run the local Go server with real-file storage. Those modes write only on
your device; the server uses a loopback-only, same-origin connection.
Screenshots reference the light application theme; the dark theme mirrors every feature.
Choose **View → Application theme → System / Light / Dark**. System follows live OS changes;
Light and Dark override it. The choice is stored with the active workspace's settings and is
applied before the app paints on reload. It is independent of a document's `theme` directive
and the CLI's `--theme` option.

## 1. Workspace basics

- The left tree holds `.pcd` files; the toolbar creates files, imports `.pcd`
  / mermaid (`.mmd`/`.mermaid`) or a workspace `.zip`, and exports.
- Hovering a row reveals **duplicate / rename / delete**; right-click the row (or
  press `Shift+F10` on it) for the same actions in a menu. A very long name wraps
  to two lines with an ellipsis instead of hiding those buttons — the tooltip and
  the tab carry the full name.
- Tabs across the top switch open files; the dot marks unsaved changes.
- **Static hosting stores everything in your browser** (IndexedDB) — use *Export ZIP*
  regularly for backups (the app reminds you) and *Snapshots* for named restore points
  (restore goes through the full migration chain).
- *Clear data…* wipes the active workspace after typed confirmation — it cannot be undone.
  With server or directory storage, this deletes real workspace files, not browser data.

### Choosing where files live

**Browser storage (default).** Hosted PanelCraft and `panelcraft serve` without `-local`
use IndexedDB. They restore the workspace after reload and make no workspace API requests.
The Files panel adds no storage label for this default.

**A folder chosen directly in the browser.** In a supporting browser on a secure context,
choose **Application menu → File & data → Open local folder…**, then approve the directory
picker and permission prompt. The current workspace is saved before switching; cancelling
or a failed folder load leaves it unchanged. The Files panel shows `Local folder: NAME`.
Edits are written to the selected folder without a server or network request. Directory
access lasts for this session: after reload, choose **Open local folder…** again. Browsers
without directory-picker support do not show the command and continue to use IndexedDB.

**A folder served by the local CLI.** Start
`panelcraft serve -local DIR -storage-type filesystem --open`. The app loads `DIR` as the
active workspace and the Files panel shows server storage. Changes reconcile ordinary
UTF-8 files in that folder. Open tabs, workspace name and UI settings live in
`.panelcraft/workspace.json`. `.git`, PanelCraft metadata, the reserved ZIP manifest,
binary files and non-regular files are not shown as documents. The writable server listens
on loopback only and is intended for one local user, not network sharing.

Use `-depth 0` for root files only, `-depth 1` to include one directory level, and so on.
Omit it or use `-depth -1` for unlimited depth. Hidden and out-of-depth content is preserved.
An external edit is protected by revision checks: PanelCraft reports a conflict and keeps
your unsaved editor text rather than overwriting the newer file. Download a copy before
reloading if you need to compare or recover that text.

Private mode always uses memory. Leaving private mode restores the storage you used before
entering it; it does not silently copy work between browser, server and directory storage.

## 2. Editing a diagram

### Canvas
- **Palette** (left): grouped by C4 level (Context/Container/Component, plus
  Structure for group/note). Click a kind — or press `1`–`9` — then click the
  canvas; dragging a palette row onto the canvas also places it.
- **Grid**: a fresh profile shows a subtle dots grid with snapping on. *Application
  menu → View* offers **Grid: off / dots / lines** and a separate **Snap to grid**
  checkbox. The two are independent workspace preferences (the grid is editor
  chrome: it is never written into a `.pcd` view and never appears in an SVG/PNG export).
  A grid choice you make yourself is remembered and is never replaced by the default
  when the app is upgraded; below 50% zoom the pattern is hidden so it cannot turn into
  a tint, and zooming back in restores it. `G` toggles visibility and brings back the
  last visible type.
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
  resizing and reloads. Intermediate waypoints remain freely draggable. On an
  orthogonal route the whole path is planned at once: a bend inside a shape or one
  that makes the connector run out and back is skipped, with the reason shown on
  the connector and in its accessible description; an intentional detour that goes
  around without reversing or crossing anything is still honoured. A single
  authored bend is always that intentional detour unless it lies inside a shape;
  reversal simplification starts when two or more bends are authored. The
  `waypoint` lines in the code view never change because of this. Straight and
  curved routes keep every waypoint verbatim. Labels
  automatically try nearby positions to avoid objects, other routes, other labels and
  the edge of the drawing; they wrap to a readable box on their own backing, paint above
  the shapes, and show a leader when they had to move away from their route. The whole
  label stays available to screen readers and on hover even when it wraps.
- **Reshape**: a selected link exposes three kinds of handle. Drag a **channel** chip (the
  small square on a slidable run) to slide that orthogonal segment sideways — both ends of
  the run move together and the semantic endpoints stay pinned to their entities. Drag a
  **bend** circle to move one corner freely. Double-click a channel chip to add a bend under
  the pointer. Snapping lines the channel up with entity corners, side midpoints and centres
  within a few pixels, then with the grid; hold **Alt** while dragging to suspend snapping.
  A focused bend nudge-moves with the arrow keys (one grid step, one unit with **Shift**) and
  is deleted with **Delete**/**Backspace**; **Escape** cancels the gesture in flight. Each
  committed gesture is one undo step. Properties → **Endpoints** sets **Start**/**End** to
  **Auto**, **Top**, **Right**, **Bottom** or **Left** plus a side-relative percentage (stored
  as `anchor from` / `anchor to`); **Reset bends** drops the waypoints and **Reset route**
  returns the link to fully automatic routing.
- **Sparks**: a link can carry **Max sparks** (1–8) and **Spark speed** (0.25–4×) for
  flow playback, saved as `sparks n` / `speed n` inside its style block. Several sparks
  stagger along the path; a bidirectional (`<->`) link ping-pongs until the step ends,
  while a one-way link completes once. Speed changes only the spark motion, never the
  step delay, and reduced-motion playback shows static emphasis instead.
- **Pan / zoom**: drag with the secondary (right) or middle mouse button, or
  Space-drag; wheel/trackpad pans and Ctrl/Cmd+wheel zooms. A secondary-button
  drag does not open the context menu, while a stationary right-click still does.
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
  disabled for larger selections), **Duplicate**, **Copy**, **Paste** and **Delete**
  are direct entries, followed by the **Arrange** group. Arrange holds the alignment
  commands — **Align left**, **Align centre (horizontal)**, **Align right**, **Align top**,
  **Align middle (vertical)**, **Align bottom** — plus **Distribute horizontally**,
  **Distribute vertically** and **Equal size**; the group stays reachable and its entries
  explain themselves when the selection is too small. Arrow keys, Home/End and Enter work
  in the menu exactly as in the application menu, and closing returns focus to the canvas
  without changing the selection. There are no stacking commands in the menu: layering is
  the **Stacking order** field in properties → Advanced.
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
- **Named views**: store per-view hide rules *and* saved positions. Creating a
  view snapshots the current arrangement; switching restores stored positions
  without recomputing layout, and objects without stored positions stay put.
  *apply layout* explicitly runs dagre and commits positions to the active view.
  Pin objects to opt them out of re-layout.
- **Dependencies panel**: select an object to see incoming/outgoing links and
  focus it (everything else fades).

### C4 drill-down, embedded children and embedded source

A C4 element can own the diagram that explains it — a system opens its containers,
a container opens its components. In the **Decomposition** section of Properties,
choose a known workspace `.pcd` file from the picker, or select an already embedded
child. An unresolved legacy value stays visible and explained; **Clear
decomposition** remains a separate action.

```
system shop "Webshop" {
  drilldown embedded "containers/shop.pcd" {
    pcd 1.0
    title "Containers"
    level container
    container api "API" {
      drilldown "components/api.pcd"
    }
  }
}
```

- A **linked** target (`drilldown "../containers/shop.pcd"`) is a workspace-relative
  POSIX path resolved from the declaring file. An **embedded** target carries the
  child's whole document and keeps that logical path as its identity. The IR v12
  value is discriminated, so these are never ambiguous optional fields.
- **Opening a child**: select the element and press **Open … diagram**. A linked
  child opens as its own tab with breadcrumbs and a dashed parent boundary. An
  embedded child opens in place — its editor is the same canvas/code/properties/flow
  editor, but the identity is the root file plus the nested path, not a fake file.
  Embedded children also appear as expandable, italic rows under their owning root
  in the workspace tree. Their edits save once into the root and undo in one step.
- Changing an embedded child to a linked file or deleting it asks for confirmation;
  one undo restores it. Permitted transitions are the C4 zoom levels
  (`system`/`system_ext` → `level container`, `container` → `level component` or
  `level deployment`). A child with no `level` line is fine; `person`, `datastore`,
  `queue`, `note` and `group` cannot decompose.
- **Exporting**: **File → Export current .pcd** asks **Keep linked decomposition**
  versus **Embed all decomposition** only when a linked child is reachable.
  Keeping linked paths requires the child files. Embedding all includes every
  transitively reachable child; a missing, unparsable, invalid, cyclic or unreadable
  descendant fails the whole export with diagnostics instead of silently producing
  a partial "complete" file. Nothing is downloaded until you choose.
- **Embedded source** stays local text: **View source** / **Add source** opens a
  viewer that shows it (never executes or fetches it) and lets you edit it as one
  undoable change. It is separate from an embedded child diagram. Limits: 64 KiB
  or 4096 lines per element, 256 KiB per file.
- Imports (read-only ghosts *inside* a diagram), flow `goto` (jump between flows)
  and drill-down (open a subordinate diagram) are three different things; only the
  drill-down draws no edge. Renaming or moving a linked child rewrites referring
  paths; deleting it keeps the line and reports it so you can re-point it.

### Search
- `Ctrl/Cmd+P` — fuzzy search over files and objects; Enter jumps (opens the
  file, reveals the object), Esc closes from anywhere.

## 3. Flows (step-by-step stories)

1. **Find Flows** in the left rail — the labelled *flow steps* entry is present from the first
   load, so you never have to know a menu path. Open it from the rail (or **View → Flow Steps**);
   it docks, floats, collapses and closes like any other panel.
2. **Create a flow** — or present the current diagram. Every non-empty document shows
   **Default flow**, alongside any custom flows. Connections become message steps in
   topological source order (creation order breaks ties), and objects not represented by a
   connection become process steps, so a link-free diagram is covered too. The presentation
   launcher offers Default marked *from the elements*. Opening, presenting, saving and
   reloading do not write it into the `.pcd`. Its first edit creates and selects an independent
   **Custom flow** in one undoable command; Default remains beside it and follows later element
   changes. **New flow** snapshots the current elements without removing or changing the
   drawing. Only an empty document has no Default and keeps the short explanation plus
   **New flow**. Fill in **Flow name** and **Flow purpose** — the purpose is printed
   as the flow's `description`, so it travels with the file instead of living in the UI.
   For longer walkthrough text use **Flow notes (Markdown)**: headings, bold, italic, inline
   code, bullet/numbered lists and links. The notes are saved as source text in the file.
   Tick **Show during presentation** to show them alongside the running flow; both the
   text and the tick survive reload.
3. **Pick a step to edit it.** Flow Steps lists the flow: each row is numbered and shows the
   step type, a readable title and the shapes it moves between (never raw ids). Selecting a row
   moves that step's properties into the **Properties** panel — kind and description, then
   **Camera**, then **Playback** (delay, advance), then the connector animation the step's link
   shares with the rest of the flow, then the advanced fields (flip, connector reference, hide
   connection). The list itself stays a list: play from a row, duplicate it, drag it (or
   `Alt+↑`/`Alt+↓`) to reorder. Message labels come from their connector and process
   descriptions from their object unless the step has its own override; edit the value to
   customise only this flow, or clear it to inherit again. Selecting a step clears the canvas
   selection, and pressing the diagram clears the step — one panel, one subject.
4. **Add steps**: **Add message**, **Add process**, **Add note** and the advanced entry for
   `alt`, `par` and `goto`. A message's endpoints are chosen from the diagram's own shapes in the
   step's Properties (never typed ids), and a message's × hides that connection from this flow
   without changing the canvas. **Hidden connections** lists those links and **Show** appends a
   step for the original connection again. A step that points at a shape the file does not
   define shows the problem on its row *and* in its Properties; repair it and the warning
   disappears. Every edit is a normal file edit, so undo/redo and the code view stay in step,
   including from flow controls while the Code panel is collapsed.
5. **Introduction and Conclusion** are offered for every flow and are only written once you type
   into them — leave them empty and the flow has neither. Selecting the flow row itself (not a
   step) shows the flow's own properties: title, purpose, Markdown notes, the presentation
   toggle and illustration style, and the exports.
6. **Play** with a row's ▶ (from that step), the flow's ▶, or **Present** beside the edited
   flow: the transport steps through the plan — the active step's elements highlight, the
   previous step's participants fade lightly, and the rest
   dim; the narration line is an ARIA live region
   (screen readers announce every step). `prefers-reduced-motion` plays without
   transition animation. Each step may carry `delay <ms>`; the flow's
   illustration style (token, pulse, glow, burst, split, trail) is chosen per
   flow in the flow's own Properties. When a flow ends, a closing card offers replay,
   `Export SVG` and close.
7. **Present**: **Present** in the header (or the application menu) opens the
   launcher — every flow in the active file with its purpose, step count and
   estimated length. Picking one starts playback and enters the chrome-free
   shell: click or press Space/→ to advance, ← to go back, `P` pauses, `R`
   restarts, `Esc` exits and restores the previous chrome and viewport. The step's
   **Description** appears under the narration line (an ARIA live region), so a
   walkthrough can be read without the editor. Flow notes, when enabled, appear in a
   labelled side panel: a non-modal aside that does not take focus, refits the camera to
   the space it leaves, and stacks above the canvas on narrow screens. Raw HTML is shown as
   text; images and unsafe links are never rendered as active content.
   The camera frames each step by itself: an introduction or conclusion shows the
   whole diagram, a message shows both participants together with the connector
   and its label, a process step shows its shape, and a parallel step shows all
   lanes at once. A chooser, a note and a `goto` keep the current view. To override
   one step, select it and use the inspector's **Camera** field — **Automatic**
   (the default framing), **Hold** (keep the previous view) or **Use current
   view**, which records the canvas point in the middle of the screen and the
   current zoom (then **Zoom** and **Transition (ms)**, 0–300, refine it).
8. **Export a sequence**: select a flow, then choose `.seq` beside *Steps*.
  The download (`.seq.mmd`) is a Mermaid `sequenceDiagram` with participants,
  messages, alternatives, parallel lanes and notes. `goto` navigation, per-step
  delays and notes in a flow with no participants cannot be represented and are
  reported by the converter's `dropped[]` result; sequence import still warns on
  block syntax.
9. **Export documentation**: `.md` beside *Steps* downloads the selected flow as
  a Markdown outline; **All flows (.md)** under the flow list downloads every flow
  in one document. The outline is generated from the parsed file, not from
  playback, so it lists each step in order with its nesting, the readable names
  *and* the stable ids, every description, the dwell, the camera behaviour
  (automatic/hold/focus with its zoom and transition) and any `goto` target.
   Flow notes keep their supported Markdown structure; their headings nest under
   each flow heading. Raw HTML stays escaped text and unsafe URLs are dropped. A
  shape the diagram does not define stays in the outline marked *(not in this
  diagram)* instead of disappearing. Both downloads are offline, name themselves
  after the file plus the flow, and never touch the document, the selection or
  playback.

## 4. Import / export

| Action | How | Notes |
|---|---|---|
| Export single file | toolbar → *Export* | `.pcd` (canonical), `.mmd` (flowchart), `.svg` (sanitized), `.png` (2×) |
| Export selected flow | *Flows* → select flow → `.seq` | Mermaid `sequenceDiagram` saved as `.seq.mmd`; one flow per download |
| Export flow documentation | *Flows* → select flow → `.md`, or **All flows (.md)** | Markdown outline of the parsed document: steps, names + ids, descriptions, dwell, camera; one file per flow or one for all |
| Import mermaid | toolbar → *Import* | best-effort converter; result lands in the code view for review |
| Workspace round-trip | *Export ZIP* / *Import ZIP* | includes all files; snapshots stay local |
| SVG safety | automatic | exported SVG is sanitized (no scripts/event handlers/foreign objects) — SPEC N6 |

## 5. Offline

The service worker caches the app shell on first load. Afterwards the static app
boots with the network cut; the IndexedDB workspace is unaffected. Direct folder access
still needs browser permission. A server-backed workspace needs its local PanelCraft
server and is not replaced by a cached API response. When an update has been cached,
the app surfaces it on the next reload.

## 6. CLI reference

`panelcraft <command> [flags]` — the same binary serves the web app and
validates/converts `.pcd` files. Exit codes: `0` ok, `1` error-severity
findings / parse failure, `2` usage error.

### `panelcraft serve [--addr 127.0.0.1:8080] [--open] [--dev-dir DIR] [DIR]`
Serves the embedded app at `/`. Without `-local`, the workspace stays in IndexedDB.
The positional `DIR` is exposed read-only under `/files/` (no listing, traversal-guarded)
as a convenience for demo assets; it is not workspace persistence. `--dev-dir DIR` serves
a development web bundle instead of the embedded one.

To edit real workspace files instead, use:

```
panelcraft serve -local DIR [-storage-type filesystem|filestorage] [-depth N] [--open]
```

`-storage-type filesystem` is the default and `filestorage` is an alias. Depth is unlimited
when omitted or `-1`; `0` means root files only. `-local` cannot be combined with the
read-only positional `DIR`. Writable mode rejects non-loopback listen
addresses; the default is `127.0.0.1:8080`. All workspace API traffic is same-origin,
non-cached and excluded from the service worker. There is no authentication or multi-user
support, so do not expose this mode as a network service. `-storage-type git` and remote
Git/GitHub operations are not implemented.

Strict CSP headers; no telemetry and no third-party runtime requests.

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
Renders the document through headless Chrome. Flags: `--width 1920`,
`--theme dark|light`, and `--chrome /path/to/chrome`. Output
uses a deterministic 16:9 canvas; position-free/auto layout uses compound dagre
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

## 8. Agent workflow (PDL first)

PDL is the normative interface for tools and agents: the same text the app edits is
what the [Go CLI](../cmd/panelcraft) validates, converts and renders, and the shared
`testdata/corpus` fixtures are the TypeScript ⇄ Go contract. Prefer editing `.pcd`
directly over driving the UI, and prefer `panelcraft validate` over reading the
canvas.

1. Read the grammar in [docs/FILE-FORMAT.md](FILE-FORMAT.md) — it is normative for
every construct used below; Markdown pictures elsewhere are never normative.
2. Write or patch the `.pcd` file. Flows live in the file, so a walkthrough is
   reviewable in a diff: `flow "…" as id { … }` with `intro`, messages, `process`,
   `alt`, `par`, `info`, `conclusion` and `goto` steps, each optionally carrying
   `delay <ms>` and `presentation { description / camera / duration }`.
3. Validate and round-trip before shipping: `panelcraft validate PATH` (exit `1`
   only for error-severity findings) and `panelcraft convert PATH -o /tmp/x.pcd`
   for the canonical form.
4. Ask for the `.md` flow documentation instead of re-deriving a flow's order
   from the canvas, and compare against
   [docs/MERMAID-MATRIX.md](MERMAID-MATRIX.md) before promising a Mermaid round
   trip — Mermaid export is lossy by design and every drop is declared.

A complete, valid example (the same shape the app writes):

```pcd
pcd 1.0
title "Checkout"

person shopper "Shopper"
system shop "Shop"

shopper -> shop : "places order"

flow "Order arrives" as order {
  description "How one order reaches the shop"
  intro "Shopper checks out" delay 800
  shopper -> shop : "places order" presentation {
    description "the order leaves the browser"
    camera hold
  }
  process shop "accepts" presentation {
    camera focus (420, 180) zoom 1.5
  }
  alt "stock?" {
    "yes" { process shop "reserves" }
    "no" { info "back-order path not covered here" }
  }
  conclusion "Order accepted"
}
```

`panelcraft validate` on that block is the check that the example still matches the
shipped grammar.
