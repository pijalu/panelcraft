# PanelCraft — Implementation Review & Enhancement Plan

**Scope:** full pass over `web/src` (20.6k LOC), format engine, workspace layer, flows, e2e + repo hygiene.
**Baseline verified on:** `npm run check` (clean), `tsc -p tsconfig.sw.json` (clean), `npx vitest run` → **53 files / 648 tests green**, worktree dirty on 12 generated files (see §7).

Every claim below was reproduced, not inferred by reading. Reproductions are marked **[repro]** and the
temporary probe files used were deleted afterwards; the exact steps are given so they can be turned into
regression tests.

---

## 1. Verdict

The engine layer (parser/printer/IR/mermaid/anim) is genuinely strong: lossless round-trip, golden corpus,
fuzz, parity tests, NFR budgets. The **product layer is where the gap is**. Three structural problems block
almost every enhancement request in the list:

1. **The canvas is not a projection of the document — it is a lossy rewrite of it.**
   `stateToDoc` (`web/src/workspace/workspace.ts:65-96`) emits only objects + links, and
   `saveCanvas` (`:364-372`) writes that projection over the whole file. Any canvas interaction therefore
   deletes flows, views, positions, styles, imports, comments, waypoints, tags-on-links, `bidir` and
   attributes. This single defect explains "changing a name may remove the entity / the view".
2. **Geometry has no representation in the format.** Sizes are hard-coded per kind
   (`CanvasController.ts:66-91`, `shapes.ts:34`), positions live only in `view` blocks that a canvas edit
   destroys, and "apply layout" overwrites positions with a fresh dagre result
   (`ViewBar.tsx:169-176`). So: nothing the user sizes or places survives.
3. **The code view is rewritten under the user's caret.** `sync.ts:138-145` + `CodeEditor.tsx:36-40`
   dispatch a full-document replace whenever the machine buffer changes; the caret lands at offset 0
   and the text re-canonicalises mid-typing (adds `{ }` blocks, normalises arrows).

Fix those three and roughly half of the requested enhancements become small, local changes.

---

## 2. P0 defects (data loss / correctness)

| ID | Defect | Evidence |
|----|--------|----------|
| D1 | **Any canvas edit deletes every non-canvas construct in the file** (flows, views, positions, style blocks, imports, raw attributes, comments, link waypoints/tags/`bidir`). | **[repro]** Manager round-trip: file with `flow`, `view` + `position`, then `saveCanvas(path, docToState(doc))` → resulting text has objects+links only. Code: `workspace.ts:65-96,364-372`; trigger: `useWorkspace.ts` `onCtrlState` → `manager.saveCanvas`. The e2e suite currently *asserts* the bug (`e2e/s2-code.spec.ts:43-46`: `expect(content).not.toContainText('direction')`). |
| D2 | **New objects reuse existing ids** → duplicate ids in the file, one entity visually lost, links re-pointed to the wrong node. | **[repro]** `loadState([o1,o2])` then `addObject()` returns `o1`; projection prints two `system o1`. Cause: session-scoped counter, never re-baselined — `CanvasController.ts:226` (`o${++this.seq}`), `loadState` (`:293`) leaves `seq` untouched. This is the most likely origin of "changing/adding an entity removes another one". |
| D3 | Renaming in the code view rewrites the whole buffer from the parse result, and the canvas reload assigns **grid positions** to everything (`docToState` grid fallback, `workspace.ts:102-108,143`). Pausing 300 ms mid-edit therefore re-lays-out the diagram and reprints the text. | **[repro]** SyncMachine: type one object line, fire the idle timer → `applied()` → `snapshot().codeText !== typed` and contains `{\n}`. Code: `sync.ts:115-145`, `useCodeSync.ts:70-90`. |
| D4 | **Caret jumps to offset 0** on every machine→editor write (open file, flow edit, view edit, canvas edit). No cursor where the user was typing. | **[repro]** CodeMirror: selection at 12, full-doc `changes` dispatch → `selection.main.head === 0`. Code: `CodeEditor.tsx:38`. |
| D5 | **`group` and `note` objects cannot exist.** The palette offers them (`PALETTE_ORDER`, `CanvasController.ts:79-89`), the printer writes them, but the loader filters them out (`workspace.ts:139`). Draw a boundary → it disappears on the next load/apply. | **[repro]** `docToState('group g1 … note n1 … system s1')` → objects `['s1']`. |
| D6 | **Properties panel controls that never persist:** "Dashed border" (object `dashed`), link "Dashed", and any `bidir` link are dropped by the projection (`stateToDoc` has no `style`/`bidir` mapping). Toggling dashed and reloading silently reverts. | Code: `workspace.ts:65-96` vs `PropertiesPanel.tsx:76-86,120-128`; `bidir: false` hard-coded at `workspace.ts:82`. |
| D7 | **Link semantics mutate on canvas edits:** loaded `a <-> b` becomes `a -uses-> b`; untyped links gain `uses`. Arrow type cannot be chosen in the UI at all. | `workspace.ts:77-83`; `PropertiesPanel.tsx` has type/label/dashed only; renderer has one arrowhead (`scenegraph.ts:141-165,188`). |
| D8 | **Drag positions are never saved, and "apply layout" destroys them.** `applyLayoutToView` is the only writer (`engine/layout/apply.ts:23`), and `ViewBar` calls it with `ctrl.currentPositions()` *after* re-running dagre in auto mode → user layout replaced by computed layout. | `ViewBar.tsx:166-176`. |
| D9 | **`imports` are parsed, validated, exported — but never rendered or resolved** (FR-I1..I4 unimplemented): no ghost objects, no click-through, no cycle surfacing in UI. | `docToState` ignores `doc.imports`; nothing in `web/src/ui` references imports outside the syntax highlighter. |
| D10 | Error state freezes the canvas: parse failure keeps the last doc, so a typo mid-rename shows a stale diagram with no visual cue on the canvas itself. | `sync.ts:157-166`; diagnostics only in the code pane (`CodeEditor.tsx:96-130`). |
| D11 | **No keyboard object navigation** (SPEC N5 / FR-C4 claim it): canvas keymap only pans, zooms, deletes, escapes (`CanvasController.ts:568-608`). Objects are not focusable, no roving selection, no ARIA roles on scene nodes. | `handleActionKey`, `runAction`; `scenegraph` sets no `role`/`tabindex`. |
| D12 | Header ships stale milestone copy: "M3 workspace — autosaved in your browser" in a v1.0 app. | `AppHeader.tsx:34`. |

---

### 2.1 Fix status (all P0 defects closed)

Every row above is fixed in the programme that followed this review. Shas are the
commit that closed the row; each commit carries the regression test.

| ID | Status | Fix | Commit |
|----|--------|-----|--------|
| D1 | **FIXED** | Canvas writes are merge-based (`applyCanvasState`): objects/links are merged by id into the parsed document, so flows/views/positions/styles/imports/waypoints/comments survive. | `f9a0895` (F-01) |
| D2 | **FIXED** | `loadState` re-baselines the id counter and a free-id probe skips taken ids. | `f9a0895` (F-02) |
| D3 | **FIXED** | Apply is caret-aware and no longer canonicalises under the caret; the idle parse applies the user's text verbatim. | `f9a0895` (F-03/F-04) |
| D4 | **FIXED** | Machine→editor writes are minimal prefix/suffix diffs with selection restore. | `f9a0895` (F-03) |
| D5 | **FIXED** | `group`/`note` are rendered, persisted and round-tripped. | `f9a0895`, `9d8fc3f` (F-06) |
| D6 | **FIXED** | `dashed`, `bidir`, style overrides and custom properties round-trip through `stateToDoc`/merge. | `9d8fc3f` (F-07), `b3a761b` (F-11) |
| D7 | **FIXED** | No injected link defaults; `head`/`tail`/`line`/`width` in the style block with per-type colour and panel controls. | `9d8fc3f` (F-08), `01a0417` (F-12) |
| D8 | **FIXED** | Geometry commits on interaction end into the active view; re-layout is explicit and undoable. | `034f5a0` (F-14) |
| D9 | **FIXED** | Imports resolve to read-only ghosts with click-through and cycle errors surfaced. | `9717073` (F-20) |
| D10 | **FIXED** | Error rings on offending objects, `N problems` chip and an "out of date" canvas banner. | `62a373c` (F-23) |
| D11 | **FIXED** | Scene nodes carry roles/labels; Tab/arrow roving focus; canvas↔code mapping. | `948ec2b` (F-22) |
| D12 | **FIXED** | Header copy replaced by the saved/dirty status pill (no milestone text). | `916a22c` (F-25) |

## 3. Requested enhancements — state, gap, proposal

### 3.1 Collapsible Files sidebar / Properties / Code view (items 1-3)

**Today:** five fixed columns — sidebar 200 px, palette 168 px, code pane `clamp(320px,34%,520px)`,
props 232 px (`app.css:83,181,558,857,1285`). On a 1280-wide screen the canvas gets **≈360 px**. Nothing
collapses (`grep -i collapse web/src` → 0 hits).

**Proposal**
- `useUiLayout()` hook owning `{ sidebar: 'open'|'collapsed', code: 'open'|'collapsed'|'overlay',
  props: 'open'|'collapsed', palette: 'open'|'collapsed', widths }`, persisted with the workspace record
  (new `settings` field in `StoredWorkspace`, schema bump + migration).
- Collapse affordances: header chevron on each panel + double-click on the divider; keyboard
  `Ctrl/Cmd+B` (sidebar), `Ctrl/Cmd+J` (code), `Ctrl/Cmd+Alt+P` (properties); `aria-expanded` +
  `aria-controls` on each toggle (axe gate must stay green).
- Draggable splitters with persisted widths, min/max clamps, `prefers-reduced-motion` aware.
- Collapsed code pane leaves a 32 px rail with the sync-state chip — the file-as-source-of-truth
  affordance must never disappear entirely.
- Acceptance: e2e that collapses all three, reloads, and asserts the layout survived + canvas width grew.

### 3.2 Code editing: entity loss, cursor, canonical churn (items 4, 5)

**Today:** see D1, D3, D4. Extra friction: printer always emits `{ }` for objects even with no attributes
(`printer.ts:133-144`), so canvas-origin rewrites touch every line and every echo replaces the doc.

**Proposal (smallest coherent set)**
1. **Doc-preserving canvas writes** (fixes D1/D6/D7 at once). Replace `saveCanvas`'s projection with a merge:
   `applyCanvasState(doc, state)` in `engine/model` — update objects/links by id in place (keeping `style`,
   `attributes`, `tags`, `waypoints`, `bidir`, `comments`, `pos`), append new, drop removed, and leave
   `flows/views/styles/imports/meta` untouched. `saveCanvas` = `printDoc(applyCanvasState(parse(current), state))`.
   Keep `stateToDoc` only as the *fallback* for unparsable files.
2. **Minimal-diff editor sync.** In `CodeEditor`, replace the full-document dispatch with a
   prefix/suffix diff (`{from, to, insert}`) and re-apply the previous selection mapped through the change;
   skip the dispatch entirely when the incoming text differs only by trailing whitespace.
3. **Never canonicalise under the caret.** On idle apply, keep the user's buffer verbatim and print the
   canonical form only into the file (`markSaved`); canonicalise the buffer on Format/Save only.
4. Printer: omit empty `{ }` blocks (grammar already makes them optional, `FILE-FORMAT.md:344`) — shrinks
   diffs and eliminates most echo churn. Requires a corpus regeneration; do it in the same commit as (1).
5. Id sequence: on `loadState`, set `seq = max(numeric suffix of /^o(\d+)$/)` and always probe for a free id.
6. Error state: render the last good doc plus a canvas banner ("Diagram out of date — fix N errors"), so
   the canvas never silently disagrees with the code.
- Acceptance: round-trip test "drag → flow/view survive"; e2e "type in the middle of a line, pause 400 ms,
  caret is still in place"; e2e "add 3 objects to a loaded file → no duplicate ids".

### 3.3 In-place rename on the canvas (item 6)

**Today:** double-click selects the object and moves focus to the properties name field
(`CanvasController.ts:537` → `useWorkspace.ts` `onRenameRequest`). The user's eye leaves the diagram.

**Proposal:** `beginInlineRename(id)` on `F2`/double-click → absolutely positioned `<input>` overlay in
screen coordinates (repositioned on pan/zoom, hidden above 200 % zoom where it becomes a chip), commit on
Enter/blur, cancel on Esc, `aria-label` = "Rename <kind>", routed through the existing `updateObject`
(coalesced undo key `props:<id>`), which also keeps the properties panel in sync (single writer).

### 3.4 Size: fit-to-name, manual resize, persistence (items 7, 8, 9)

**Today:** `DEFAULT_SHAPE` is a constant table; `TEXT_MID` centres a single unwrapped text run at the
shape midpoint (`shapes.ts:34-38`); a long name overflows the box. Resize handles exist only for
`group` (`RESIZE_KINDS`, `CanvasController.ts:91`). Sizes are absent from the IR and the grammar.

**Proposal**
- **Grammar/IR:** objects gain optional `size <w> <h>` (and links keep `waypoint`, add `head`).
  Bump `IR_VERSION` → 2, update `FILE-FORMAT.md`, printer, parser, serialize, Go parity fixtures.
  Interim compatibility: today the parser already round-trips unknown object attrs as `RawAttr`
  (`parser.ts:234`, `printer.ts:143`), so `size` can ship as a *known* attr without a breaking parse change.
- **Fit-to-name:** add a measurement port (`measure(text, font): {w,h}`) implemented with an offscreen
  canvas in the browser and a stub in tests; `autoSize(obj)` = clamp(textW + 2×padding, MIN, MAX) with
  2-line wrapping (`tspan`) and auto height. Applied on create, on rename, and on `Fit` command; explicitly
  *not* applied when the user has resized the object (that flag is the new `size` attr).
- **Resize:** all kinds resizable, 8 handles (corner + edge), min 48×32, snap, live guide lines, one undo
  command per drag, `Shift` = keep aspect. Size writes through `updateObject` → doc → file.
- **Location persistence:** drag end commits the object's position to the active view (`applyLayoutToView`
  for that id only, creating the implicit `"Default"` view with `layout saved` when absent), debounced
  250 ms and undoable. "Auto-layout" becomes an explicit, destructive-but-confirmed command.
- Acceptance: e2e "drag + resize, reload, geometry identical"; unit "rename grows box to fit, ≤ max";
  corpus fixture with `size`/`position` round-trip.

### 3.5 Arrow type (item 10)

**Today:** one `<marker id="pc-arrow">` applied as `marker-end` for every link (`scenegraph.ts:141-165,188`);
`DiagramLink` has no arrow field; `bidir` from the file is dropped on any canvas edit (D7).

**Proposal:** link visual model `{ head: 'arrow'|'open'|'triangle'|'diamond'|'circle'|'none',
tail: same set, line: 'solid'|'dashed'|'dotted', width: 1|2|3 }`.
- Render: `defs` gains one marker per head shape (small, memoised); `marker-start`/`marker-end` chosen from
  the link; dash via `stroke-dasharray`. Typed links also get a **colour hint** derived from type
  (`requests`/`returns`/`publishes`/…) — this is what makes flows readable at a glance.
- Format: `bidir` already covers `<->`; add `head`/`tail`/`line` to the existing link `style` block
  (round-trips today as a style block, so the parser needs only semantic validation).
- UI: properties panel segmented control + `Shift+A` cycle on a selected link; canvas projection must
  carry the fields (falls out of §3.2.1).

### 3.6 Presentation view & flow animation (item 11)

**Today:** flows are functional and well-tested — 8 step types, beat planner, token-travel with trailing
dash, camera glide, dimming, alt chooser, ARIA narration (`engine/flows/plan.ts`, `engine/anim/*`,
`flows/flowController.ts`). What is missing is the *presentation container*: playback happens inside the
editor chrome, advances only via PlayBar buttons (no keyboard, no click-anywhere), no fullscreen, no
timeline scrubber, no exit affordance beyond the bar.

**Proposal — "Present" mode**
- `PresentShell` overlay (`Ctrl/Cmd+E` toggles): hides sidebar/palette/tabs/viewbar/props/code via a
  `.presenting` root class, requests fullscreen (F11 fallback), keeps a minimal transport dock.
- **Click / `Space` / `→` advances**, `←` back, `P` pause, `R` restart, `Esc` exits and restores the
  pre-play viewport (already supported by `FlowRunner`).
- **Per-step illustration registry** (this is the "electron following the arrow" ask):
  `travel-token` (existing), `pulse` (existing), `sequential-glow` (staggered edge lighting for `par`),
  `packet-burst` (particles on `info`), `compare-split` (side-by-side lanes for `alt`),
  `trail-fade` (breadcrumb of visited nodes at `conclusion`). Each is a small `BeatPlayer` implementation;
  the planner stays untouched, so tests stay cheap.
- Presentation chrome: step `3 / 8`, progress dots, flow title, speaker notes (`info` text), reduced-motion
  fallback (crossfade only).
- Optional later: `?present=<file>#<flow>` deep link + autoplay for embedding in docs.

### 3.7 Panels must not re-organise themselves (item 9, second half)

Beyond §3.4: the canvas currently re-lays-out on **every** code-origin apply (`docToState` grid) and on
view switch (`applyViewLayout` runs dagre for auto views). Rules to encode:
- Opening/switching a file never re-positions anything that has a stored position.
- Only two commands may re-layout: "Auto-layout" (with undo + toast) and "Reset layout".
- View switch restores that view's positions *without* recomputing dagre; `layout auto` becomes a
  one-shot command, not a render-time behaviour.

---

## 4. Gap review vs IcePanel (and where to deliberately not compete)

| Capability | IcePanel | PanelCraft today | Recommendation |
|---|---|---|---|
| Architecture model (landscape → containers → components, one model, many diagrams) | core | flat per-file diagrams + parsed-but-unused `imports` | Implement imports (ghost objects, click-through, cycle errors) → cheapest path to "model, not drawing". Then a "level" grouping in the palette. |
| Boundaries / groups / notes | yes | palette entries that vanish on load (D5) | Fix D5 first, then nested groups (format already has `contains`; v1 says flat). |
| Flows / scenarios | yes | **strong** (8 step types, alt/par, goto, narration) | Keep; add present mode (§3.6). No competitor gap here. |
| Perspectives / tag filters | yes | yes (tag chips + fade) | Add saved tag combinations per view. |
| Read-only share link | yes | none (zip/png export only) | Cheap win: `#view=…` URL state + "export as single HTML" (static, no backend, fits N7). |
| Version history / diff / drift | yes | local snapshots (workspace-wide) | Add per-file diff against snapshot (text diff + object-level summary). Drift-from-code sync is out of scope. |
| Comments / review | yes | none | Out of scope for a client-only tool; document as such (already partly). |
| Connector semantics (protocols, direction, head shapes) | yes | type + optional label, one arrowhead | §3.5. |
| Custom icons / icon picker | yes | built-in inline icons, `icon` attr parsed but not rendered | Render `icon` in the shape; add a picker. |
| Auto-layout choice (layered/orthogonal/grid) | yes | dagre only | Keep dagre; add "grid" + "tighten" as cheap alternatives. |
| Export (PNG/SVG/PDF/JSON) | yes | PNG/SVG/`.pcd`/`.mmd`/ZIP | Add PDF via print stylesheet; JSON = IR (exists). |
| Mermaid interop | partial | import flowchart+C4, export flowchart, declared drops | See §5. |
| Keyboard-first editing | partial | weak (D11) | Add roving-focus object nav + command palette (search already indexes). |

**Where IcePanel-level parity is a trap:** collaboration, RBAC, drift detection, ADR hosting. Those need a
backend and violate the product's hard constraint (N7 / D3). Recommend stating them as "not planned" in the
README so the comparison stops reappearing in reviews.

---

## 5. Mermaid gap matrix

| Construct | Import | Export | Note |
|---|---|---|---|
| `flowchart` nodes/edges/subgraphs | yes | yes (subgraphs from groups) | good |
| C4 (`C4Context/Container/Component/Dynamic`, `BiRel`, deployment) | yes | no (flows to flowchart) | export C4 back is a real gap for architecture docs |
| `sequenceDiagram` | no | no | flows ⇄ sequence is the highest-value mermaid addition (SPEC FR-M3 lists it as optional) |
| `stateDiagram`, `classDiagram`, `erDiagram` | no | no | declare unsupported explicitly in docs (currently only "unknown → M200") |
| `classDef` / `linkStyle` / `style` | partial (fill only) | partial | extend once §3.5 lands |
| `click`/`href`, `accTitle`/`accDescr`, `%%{init}%%` | ignored with diagnostics | n/a | fine, but surface the diagnostics in the UI import dialog, not just the buffer |
| Waypoints / manual positions | n/a | dropped (declared) | expected |

Deliverable: a short `docs/MERMAID-MATRIX.md` auto-generated from the converter's drop list so the docs
cannot drift from the code (and a test that the doc table matches `dropped[]`).

---

## 6. Laws of UX audit

Mapping laws → concrete violations found → fix. (Only laws with real findings are listed.)

| Law | Violation found | Fix |
|---|---|---|
| **Jakob's Law** | Split code/canvas with no way to reclaim canvas space; IcePanel/Figma users expect collapsible panels and in-canvas editing. | §3.1, §3.3 |
| **Aesthetic-Usability** | Canvas is the minority of the screen (≈360 px of 1280); five competing columns. | §3.1 + default `code: collapsed` under 1440 px |
| **Miller's / Hick's** | 9 palette items, 9 link types, 8 flow step types, 6 header actions exposed at once. | Group palette by C4 level (context/container/component); move rare link types behind "more"; step-type menu with 4 primary + "more" |
| **Doherty threshold** | 300 ms idle parse *applies mid-typing* (§D3) — the app interrupts the user, the inverse of the law. | Raise idle to 800 ms **or** make apply explicit (Ctrl+Enter), and never apply while the caret is inside a changed line |
| **Visibility of system status** | Monthly-grade: no saved/dirty pill; destructive canvas rewrite silent (D1); error state shows stale canvas (D10); sync chip is 11 px muted text. | Persistent `Saved · 12:04` pill; toast "Flows/views preserved" vs "File rewritten"; canvas-level error banner; make the sync chip a coloured badge |
| **Feedback** | Link creation gives no target preview; undo has no visual acknowledgement. | Hover-valid target highlight (exists as class, not surfaced), 80 ms toast "Undone: delete" |
| **Tesler's law** | The hardest concept in the app — "when is my layout saved?" — is left to the user. | §3.7: geometry saves itself, one explicit re-layout command |
| **Paradox of the active user** | First run = empty `untitled.pcd`. | Template gallery (C4 sample, flow sample, mermaid paste) in the empty state |
| **Fitts's law** | Collapse targets don't exist; palette rows ~28 px; header icons 20 px. | 32 px minimum interactive size; full-row palette buttons (already) + 44 px on touch |
| **Law of common region** | Panels are unseparated columns; properties and deps share a column with no headers. | Section cards with headers inside the right column; visible dividers |
| **Working memory** | Rename requires select → move to panel → find field (D-§3.3); no hover info cards. | Inline rename + hover card (name, technology, description, tags) |
| **Von Restorff** | Diagnostics live only in the code pane; the offending object looks normal. | Mark problem objects on canvas (error ring) + count chip in the header |
| **Peak-End** | Flow ends with the dim removed and nothing else. | Closing card: title, step count, "replay", "export SVG", "share" |
| **Serial position** | Long flow step lists have no sticky anchors. | Sticky flow header with play from step + jump to first/last |
| **Zeigarnik** | Flow/view/step edits have no dirty indicator (they bypass the canvas undo model). | Dirty dots on flow/view rows; unified undo (§8.1) |
| **Law of proximity** | PlayBar overlays the canvas bottom-right, can cover objects. | Docked transport (or auto-hide on idle) |
| **Prägnanz / Uniform connectedness** | All edges look identical (one head, one colour); no boundaries ⇒ no visual containment. | §3.5 types/colour + real groups (§D5) |
| **Postel's law** | Strict parse freezes the canvas on a typo. | Lenient render: last-good doc + explicit "out of date" state (D10) |

---

## 7. Repo hygiene — "no generated content"

Facts:

- **`dist/release/**` is committed: 12 files, 46 MB** — six `*-dryrun-{os}-{arch}` binaries (7.3–8.1 MB each),
  a built Pages bundle, and `SHA256SUMS`. Introduced by `759bce0` ("refresh vision-round-4 goldens +
  release dry-run artifacts"), and **already dirty in the working tree** (binaries differ from HEAD).
- `e2e/__screenshots__/**` (852 KB, 11 PNGs) is committed **and written to by the specs themselves**
  (`s1-create.spec.ts:73`, `s2-code.spec.ts:50`, …) → every e2e run dirtles 5 files (verified).
- `.git` is 61 MB for a ~2k-LOC-excluding-deps project.
- `.gitignore` already covers `node_modules/`, `web/dist/`, `coverage/`, `test-results/`, `playwright-report/`,
  `.goa/` — i.e. the intent exists, the enforcement doesn't.

Plan:

1. `git rm -r --cached dist e2e/__screenshots__`; add `dist/`, `e2e/**/__screenshots__/`, `*.zip`
   (repo-root artifacts) to `.gitignore`.
2. Scripts must write run output to `test-results/screenshots/` (ignored) and only *compare against*
   `e2e/goldens/` (tracked, small, curated). Update `playwright.config.ts` (`outputDir`) and the
   `page.screenshot({path})` calls to use the golden dir only when `UPDATE_GOLDENS=1`.
3. Purge history for the binaries (`git filter-repo --path dist --invert-paths`) — coordinate with the
   team; do it once, before the repo gets more clones.
4. Add a CI guard: `test -z "$(git status --porcelain)"` after e2e (catches "tests write into the repo").
5. `scripts/release.sh` must write to `$PWD/dist` (ignored) and upload via the release workflow only.
6. Sweep for other generated content: `web/dist/` (ignored ✓), `testdata/corpus/*` (authored fixtures ✓),
   `docs/architecture/*.pcd` (authored ✓), `package-lock.json` (keep ✓).
7. Fix the two doc-drift smells found: `AppHeader.tsx:34` stale "M3 workspace" copy, and the
   `e2e/s2-code.spec.ts` assertion that blesses data loss (D1).

Result: repo drops from ~46 MB tracked binaries to text-only, and the worktree stays clean after test runs.

---

## 8. Additional enhancements (found while reviewing, not on the list)

**8.1 Unified undo.** Two independent histories: the canvas `UndoStack` (drag/property/delete) and
CodeMirror's history (code edits); flows/views go through the code path. `Ctrl+Z` does different things
depending on focus. Proposal: one command journal in the workspace with focus-aware routing, and a visible
"history" affordance for the last N entries.

**8.2 Canvas → code affordance map.** Click a shape → highlight its lines in the code pane; click a code
line → flash the object. Cheap (both sides already parse ids) and hugely clarifying for the "single source
of truth" story.

**8.3 Object-level diagnostics.** `validate.ts` already reports P105/P106/P201/P203 — surface them as
canvas rings and a "3 problems" chip; today they are only produced for the CLI.

**8.4 Multi-select properties + alignment tools.** Align left/centre/distribute, equal-size, "tidy
selection" — table stakes once resizing lands.

**8.5 Copy / paste / duplicate (FR-C12), context menus (FR-C10), edge waypoint drag (FR-C8), style
overrides UI (FR-C6: fill/stroke/text/icon).** All specified, all missing; each is small now that §3.2.1
makes the doc the single writer.

**8.6 File-tree and search polish.** Rename already inline in the tree (`FileTree.tsx:245-260`) — mirror it
on the canvas (§3.3). Quick search should also jump to the matching *line* in the code pane.

**8.7 Perf guard for the new echo path.** Adding minimal-diff sync must keep the M7 budgets
(`engine/perf/nfr.test.ts`); add a benchmark with 500 objects whose one name changes.

**8.8 Snapshot diff.** Snapshots exist (`workspace/store/snapshots.ts`); add a diff view (text + object
count deltas) — the cheapest substitute for IcePanel's version history.

**8.9 i18n seams.** N10 claims strings are centralised; they are inline in components. Not urgent, but the
laws-of-UX work will touch every label — doing a `strings.ts` extraction then is cheaper than later.

**8.10 Docs truth pass.** SPEC lists FR-C5/C6/C7/C8/C10/C12, FR-I1..I4, FR-W6 (partially) as v1 scope; the
implementation covers roughly half. Either implement or move them to a "post-1.0" section — a spec that
lies about scope is worse than a short spec.

---

## 9. Suggested sequencing

| Phase | Content | Why first | Acceptance |
|---|---|---|---|
| **P0 (blocking correctness)** | §3.2.1 doc-preserving canvas writes · id sequence/collision · minimal-diff + caret preservation · stop canonicalising the buffer mid-edit · group/note load · dashed/`bidir` round-trip · remove `dist/` from git | Stops data loss; unblocks everything else (sizes, arrows, positions all need the doc to survive a canvas edit) | New unit + e2e: drag → flow/view/positions intact; caret stable across pause; no duplicate ids; repo clean after e2e |
| **P1 (requested UX)** | collapsible/resizable panels (§3.1) · inline rename (§3.3) · `size` in format + fit-to-name + all-kind resize (§3.4) · geometry persistence + explicit re-layout (§3.7) · arrow model + renderer + controls (§3.5) | Directly answers items 1-3, 6-10, 9 | Playwright: reload keeps geometry; resize any kind; arrow persists |
| **P2 (presentation)** | present shell, click/keyboard advance, illustration registry, closing card (§3.6) | Biggest perceived-value delta vs today; no format risk | e2e present mode: click-advance, Esc restores, reduced-motion path |
| **P3 (parity polish)** | imports/ghosts (§D9) · mermaid C4/sequence export · canvas↔code affordance (§8.2) · diagnostics on canvas (§8.3) · align/distribute (§8.4) · copy/paste + context menus (§8.5) · unified undo (§8.1) | Makes it feel like a tool rather than a demo | per-item e2e + corpus additions |
| **P4 (hygiene/docs)** | laws-of-UX pass (§6) · mermaid matrix doc (§5) · spec truth pass (§8.10) · snapshot diff (§8.8) | Prevents regressions of trust | check-docs + axe + visual goldens |

Format changes to land early (they gate P1): `size` attr, link `head/tail/line`, `IR_VERSION` 2,
`FILE-FORMAT.md` + corpus + Go parity fixtures in one commit.

---

## 10. Decisions needed from the product owner

1. **Geometry in the file** — `size`/`position` become first-class (recommended) or stay view-only with
   auto-persist into an implicit `"Default"` view?
2. **Apply semantics while typing** — keep silent idle-apply (raise to 800 ms) or move to explicit
   Ctrl+Enter apply with a live "preview" hint?
3. **Groups/notes** — implement rendering now (P0) or drop them from the palette until P3? (Leaving them
   drawing-then-vanishing is the worst option.)
4. **IcePanel parity** — confirm "no collaboration/comments/RBAC/drift" is a stated non-goal in the README.
5. **Golden screenshots** — commit curated `e2e/goldens/` (recommended) or move visual review entirely to
   CI artifacts?
