# Files panel — names, template start, rail edge and header chrome

**Status:** fixed and verified.

Four tracked Files-panel defects were closed together: they share one surface
(the Files panel and the panel-header chrome), and three of them are only
correct when the fourth is — a header that owns the collapse chevron and the
storage explanation also changes where the collapsed rail sits.

## 1. Blank names were reachable, and a template could land on a phantom buffer

### Observed

- **+ file** accepted a name that was only whitespace. `commitCreate()` passed the
  raw input to `createFileAt()`, so `createFileAt('   ')` succeeded: the tree
  showed a row with no readable name and the tab strip showed a tab whose label
  was empty (only the ✕).
- Clicking a gallery template with no open file did nothing useful. After closing
  the last tab the gallery appeared, but the code buffer still belonged to the
  *closed* file, so the click raised "Unsaved code changes — The editor buffer of
  untitled.pcd differs from the saved file" and the template text never reached a
  file. The status pill read **Unsaved** while the tab strip showed no open files.
- Closing the untouched welcome file of a fresh workspace raised the same prompt.
  Measured cause: an empty file's canonical text was taken to be `''` while the
  canvas projection of an empty document is `pcd 1.0`, so the buffer and the saved
  text were compared unequal although they describe the same document.

### Expected

A file or folder name is trimmed and rejected when empty, and the editor stays
open and says why. Starting from a template with no open file creates the file the
template belongs in, and no divergence is ever reported against a file that is not
open (or not edited).

### Cause

- `validateName()` (`web/src/workspace/fs.ts`) checked length, `.`/`..`, backslash
  and control characters but not whitespace, so a blank name was a legal file name.
- The gallery wrote through `machine.textChanged(text)`, and the machine's apply
  port persisted only when `manager.activePath !== null`. With no file open the
  text had nowhere to go.
- `canon()` treated a blank text as literally `''`; the machine's own
  `canonOfBuffer()` did the same, so "empty file" and "empty document" never
  compared equal.

### What changed

- `web/src/workspace/fs.ts`: a name must equal its own trim — apply to every
  create, rename, move and import, not just to the create row.
- `web/src/ui/FileTree.tsx`: the create row trims what was typed, refuses a blank
  name with a visible, announced reason (`Enter a name first.`), keeps the row
  open, and clears the message as soon as the name changes. Rename trims too and
  keeps the old name for a blank one. The create-row state moved into
  `useCreateRow` to keep the component inside the length gate.
- `web/src/ui/App.tsx`: choosing a starting point with no open file creates
  `diagram.pcd` (or `diagram-2.pcd`, …) with the template text, opens it, and
  records the answer for that path so the gallery does not ask again.
- `web/src/ui/codeview/sync.ts`: `canonText()` is now the single canonicalisation
  rule (printer output; the magic line for a blank document), used by the machine's
  divergence check and by `useCodeSync`'s saved-text bookkeeping.

## 2. A collapsed rail sat between open panels

### Observed

With the left dock holding Files (open), Flow Steps (collapsed) and Shapes (open),
the collapsed rail rendered *between* Files and Shapes (measured: Files 0–200,
splitter 200–206, rail group 206–242, Shapes 242–410). The stale curated capture
`e2e/goldens/p6-minimap-light.png` showed the same mix-up.

### Expected

The rail group is the outermost element of its dock — before every open panel in a
left dock (and in the horizontal bottom dock, which reads left-to-right from the
same edge), after all of them in a right dock — for every open/collapsed
combination and both themes.

### Cause

`dockedPanels()` rendered the shared rail group at the position of the *first
collapsed panel in dock order*, so any open panel before it in the order pushed the
group inward.

### What changed

`web/src/ui/App.tsx`: the dock now renders open hosts in order plus one rail group
placed at the dock's outer edge — computed, not derived from panel order.

## 3. Storage explanation and create actions are quiet icons

### Observed

The storage explanation was a standing three-line paragraph at the top of the Files
panel and the create actions were full-width **+ file** / **+ folder** text
buttons, so the panel read as documentation and pushed the file list down.

### Expected

The explanation moves behind an information icon next to the panel title
(keyboard reachable, exposed as a tooltip *and* an accessible description, so it
is still available without hovering); the create actions become icon buttons with
tooltips and accessible names at a 32 px target; the panel keeps a visible storage
label, and nothing is announced only on hover.

### What changed

- `web/src/ui/PanelChrome.tsx`: `InfoHint` — a named button whose
  `aria-describedby` carries the explanation, `title` for the native tooltip, and a
  visual tooltip that opens on hover **and** on focus, placed to the side away from
  the panel body so it never covers the content being asked about.
- `web/src/ui/WorkspacePanels.tsx`: `storageExplanation(kind)` is the single wording
  per backend; the panel header renders it through `InfoHint` for the Files panel.
  The `.storage-hint` paragraph is gone from `StorageActions`.
- `web/src/ui/FileTree.tsx` + `web/src/ui/icons.tsx`: `+ file` / `+ folder` became
  `FilePlusIcon` / `FolderPlusIcon` buttons with names and tooltips; the tree
  starts at the file list.

## 4. The collapse chevron belongs next to the panel title

### Observed

The `<` collapse control rendered on a second row at the right edge of the panel
body (measured: collapse button left 166–198 while the panel starts at 1), while the
title row was owned by the shared host header. Every panel needed an extra row just
to hold the chevron, and the control sat far from the title it collapses.

### Expected

The chevron sits in the shared header row immediately next to the panel title
(title, then chevron), keeps the same accessible name and the same focus behaviour
after collapse (`focusRail`), and panel bodies start with their content — including
for floating panels, which still collapse to their rail.

### What changed

`web/src/ui/WorkspacePanels.tsx` renders `CollapseButton` in `.panel-host-header`
right after the title (before the ⋮ actions menu, which is pushed to the trailing
edge); the per-panel `.panel-head` rows were removed from Files, Flow Steps, Shapes,
Code and Properties, and the chevron points outward for right-docked panels.

## Test approach

- Unit: name rules (`web/src/workspace/fs.test.ts`), create-row refusal and
  whitespace trimming, blank rename, template-with-no-file
  (`web/src/ui/App.test.tsx`), canonical blank document (`useCodeSync.test.tsx`),
  header geometry + info-trigger description (`WorkspacePanels.test.tsx`,
  `storageUi.test.tsx`), dock rail order per dock (`App.test.tsx`).
- Browser: `e2e/bugs-files-panel.spec.ts` — blank name refused with a reason,
  template start with no file, rail edges for mixed docks (light + dark), header
  chevron position, focus after collapse, info trigger name/description/tooltip,
  icon-button names, sizes and tooltips (light + dark).

## Verification evidence

- RED first: `npx vitest run web/src/workspace/fs.test.ts` failed the new trim
  cases; `npx vitest run web/src/ui/useCodeSync.test.tsx` failed the blank-document
  divergence case; the Playwright spec failed on the blank name, on the template
  start (a `diverged-dialog` appeared after closing the last tab) and on the rail
  edges before the fixes.
- GREEN: `npx vitest run web/src` — 1836 passed.
- `npm run check` (tsc ×2 + eslint) clean, including the shell complexity/length
  gates (the create row was extracted to `useCreateRow` for that).
- `npm run build` completed before every browser run.
- `npx playwright test` — 280 passed, including the new six scenarios.
- `npx playwright test e2e/storage-browser.spec.ts e2e/ux02-workspace.spec.ts
  e2e/present-hash-anchor.spec.ts` re-ran green after the specs that read the old
  `.storage-hint` paragraph were pointed at the info trigger's description. One
  presentation-hash scenario failed once in the 280-test parallel run and passed in
  isolation and in the following full run; it does not touch the Files panel.
- `bash scripts/check-docs.sh`, `bash scripts/check-jargon.sh HEAD~1`,
  `bash scripts/check-repo-clean.sh` — see the commit of this change.
- Go side untouched; `go vet ./...`, `staticcheck ./...`, `gocyclo -over 15 cmd
  internal web` and `go test ./...` remain green.

## Screenshot review

Reviewed after the final browser run, both themes:

- `test-results/screenshots/bugs-files-panel-header-light.png` / `-dark.png`:
  Files header reads title → chevron → info icon → ⋮ at the trailing edge; the
  storage label stays visible; two icon create buttons sit above the file list; no
  standing paragraph. Contrast and hit areas are consistent with the style guide.
- `test-results/screenshots/bugs-files-panel-info-light.png` / `-dark.png`: the
  explanation opens beside the icon, readable against the panel in both themes,
  clear of the title, the chevron and the panel's first rows.
- `test-results/screenshots/bugs-files-rail-edge-light.png` / `-dark.png`: the
  mixed left dock (Files open, Flow Steps collapsed, Shapes open) shows the rail at
  the dock's left edge, and the mixed right dock (Properties open, Code collapsed)
  shows its rail at the right edge.
- `test-results/screenshots/bugs-files-blank-name-refused.png`: the create row
  stays open with `Enter a name first.` under it; no nameless row or tab.
- `test-results/screenshots/bugs-files-template-no-file.png`: `diagram.pcd` is the
  active tab with the template on the canvas and no dialog.
- Refreshed curated captures `e2e/goldens/p6-minimap-*.png` and
  `e2e/goldens/p6-routing-*.png` were re-shot with `UPDATE_GOLDENS=1` and reviewed:
  they previously showed the old body chevron row, the text create buttons and the
  mid-dock rail — the three defects closed here.
