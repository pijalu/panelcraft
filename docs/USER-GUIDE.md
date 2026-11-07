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
- **Palette** (left): click a kind (person, system, system_ext, container,
  component, datastore, queue, group, note), click the canvas to drop it.
- **Select**: click; Shift-click adds to the selection. Drag moves (snaps to
  the grid unless a view pins a position).
- **Connect**: click a source object, then a target — the link gets the
  default type; edit label/type in the properties panel (right).
- **Keyboard**: arrows move the selection, Delete removes, Escape deselects
  or closes the active overlay.
- **Undo/redo**: Ctrl/Cmd+Z / Shift-Ctrl/Cmd+Z (canvas and code share the
  history via the sync bridge).

### Code view (source of truth)
- The pane under the canvas always shows the canonical `.pcd` text; every
  canvas edit lands there, and every code edit re-patches the canvas
  (debounced; diverged states resolve through a guided dialog, M4).
- `Shift-Alt-F` formats the buffer.

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
3. **Play**: the play bar steps through the plan — the active step's elements
   highlight, the rest dim; the narration line is an ARIA live region
   (screen readers announce every step). `prefers-reduced-motion` plays
   without transition animation.

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
