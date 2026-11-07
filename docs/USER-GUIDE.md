# PanelCraft — user guide

Everything happens in your browser; nothing is sent anywhere (SPEC FR-S1).
Screenshots reference the light theme; the dark theme (`prefers-color-scheme`)
mirrors every feature.

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
- **Select**: click; Shift-click adds to the selection. Drag moves (snaps to
  the grid). **Rename** in place with `F2` or double-click; Enter commits,
  Escape cancels.
- **Resize**: select anything and drag one of the eight handles; the box stays
  on the grid and never gets smaller than 48×32. An explicit size is saved as
  `size <w> <h>`; "Fit to name" (properties → Advanced) recomputes it.
- **Connect**: drag from an edge halo (or right-click → connect) to a target.
  A link's type/label/arrowheads/line/width live in the properties panel;
  `Shift+A` cycles the head shape. Drag a child link's midpoint to add a
  waypoint, and drag waypoints to move them.
- **Hover** an object to see its name, technology, description and tags.
- **Keyboard**: arrows move the selection, Tab/Shift+Tab move focus between
  objects, Delete removes, Escape deselects or closes the active overlay.
- **Context menu** (right-click): copy/paste/duplicate, delete, align,
  distribute, equalise size, bring to front.
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

1. Open the *Flows* side tab and add a flow (`flow "Happy path" as happy { … }`
   in code, or via the pane).
2. Each step targets an object/link with optional focus rules; reorder steps
   by drag.
3. **Play**: the docked transport steps through the plan — the active step's
   elements highlight, the rest dim; the narration line is an ARIA live region
   (screen readers announce every step). `prefers-reduced-motion` plays without
   transition animation. Each step may carry `delay <ms>`; the flow's
   illustration style (token, pulse, glow, burst, split, trail) is chosen per
   flow in the Flows pane. When a flow ends, a closing card offers replay,
   `Export SVG` and close.
4. **Present**: `⛶` enters the chrome-free shell — click or press Space/→ to
   advance, ← to go back, `P` pauses, `R` restarts, `Esc` exits and restores the
   previous chrome and viewport.

## 4. Import / export

| Action | How | Notes |
|---|---|---|
| Export single file | toolbar → *Export* | `.pcd` (canonical), `.mmd` (flowchart), `.svg` (sanitized), `.png` (2×) |
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

### `panelcraft convert [--out DIR] PATH...`
Parses and writes canonical IR JSON (`<name>.ir.json`); parse failures exit
`1`. TS and Go converters are byte-parity-tested against the same goldens
(CI gate).

### `panelcraft version`
Prints `panelcraft <semver> (<os>/<arch>)` — release builds stamp the version
at link time.

## 7. File format

Normative grammar: [docs/FILE-FORMAT.md](FILE-FORMAT.md). A `.pcd` file is
UTF-8 text: header (`pcd 1.0`, title, level, direction), objects with kind/id/
name/attributes, links (`a -> b : "label"`), flows, views, styles. Comments
start with `#`.
