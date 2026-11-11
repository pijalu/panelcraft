# PanelCraft — Fix Plan (execution contract)

Companion to [REVIEW-enhancements.md](REVIEW-enhancements.md). That document says *what is wrong and why*;
this one is the ordered, testable work list. **Every task below must end with a regression test that fails
without the fix.**

## 0. Working rules (non-negotiable)

1. **Issue intake rule.** Any problem discovered while fixing something — from any source (test flake,
   stale doc, wrong assumption in the review, a bug in adjacent code, a broken screenshot) — is **in scope
   and must be fixed** in the same programme. Register it as a new `F-xx` row here with severity, owner
   phase, and a test. The programme is complete only when **no row is open**.
2. **No test may encode a defect.** `e2e/s2-code.spec.ts` currently asserts that canvas edits drop
   `direction`. Any test that blesses a bug is rewritten in the same commit that fixes the bug.
3. **Never weaken a gate** (`npm run check`, coverage thresholds, axe, corpus parity, self-containment) to
   make a change land.
4. **Format changes are atomic:** `IR_VERSION` bump + `FILE-FORMAT.md` + parser + printer + corpus +
   Go parity fixtures + serialize in one commit.
5. **Each commit:** one task ID, its test, and a one-line `CHANGELOG.md` entry.

Verification for every task: `npm run check && npx vitest run` green, plus the task's own e2e/visual proof.
Programme-level gate: `bash scripts/verify.sh m7` green with a clean `git status` afterwards.

---

## Phase P0 — Correctness (blocks everything else)

### F-01 Document-preserving canvas writes — **critical**
*Problem:* `saveCanvas` writes a projection (`workspace.ts:65-96,364-372`) that silently deletes flows,
views, positions, style blocks, imports, comments, waypoints, link tags, `bidir`, raw attributes (review §2 D1).
*Change:* add `applyCanvasState(doc, state): Doc` in `engine/model` that merges by id (update in place, keep
untouched fields, append new, drop removed, leave `flows/views/styles/imports/meta` alone) and make
`saveCanvas` = `printDoc(applyCanvasState(parseCache(currentText), state))`. Keep `stateToDoc` as the
fallback when the current text does not parse.
*Tests:* unit — flow + view + style + import + waypoint + `bidir` survive a simulated drag/rename;
e2e — paste a file with a flow, drag a node, assert the flow block is still in the code pane and in IDB.
*Depends on:* none.

**Done.** `applyCanvasState(doc, state)` in `engine/model/merge.ts` merges objects/links
by id into the parsed document (update in place, append new, drop removed, and leave
`flows`/`views`/`styles`/`imports`/`meta` untouched); `manager.saveCanvas` is
`printDoc(applyCanvasState(parse(text), state))` with `stateToDoc` kept as the fallback
when the current text does not parse. Tests: `engine/model/merge.test.ts`
(`applyCanvasState` incl. flow/view/import/waypoint/`bidir` survival + structure),
`workspace/workspace.test.ts` "canvas writes merge into the document", e2e
`p0-regressions.spec.ts`. Commit `f9a0895`.

### F-02 Stable id allocation — **critical**
*Problem:* session counter reuses ids of a loaded file (`CanvasController.ts:226`, `loadState` at `:293`);
duplicate ids appear in the file and one entity is visually lost (review §2 D2).
*Change:* `loadState` re-baselines `seq` from `max(/^o(\d+)$/)`; `addObject` probes for a free id; add a
`uniqueId(existing)` helper. Also regenerate ids on paste/duplicate (needed by F-19).
*Tests:* unit — load `o1,o2`, add → `o3`; 20 sequential adds are unique; e2e — add 3 objects to a loaded
file, file has 5 unique ids.

**Done.** `loadState` re-baselines the object counter from the ids it just loaded and
`addObject` probes for a free id (`uniqueId`), so a loaded file never has its ids
reused; paste/duplicate re-allocate ids too. Tests: `CanvasController.ids.test.ts`
("stable id allocation"), e2e `p0-regressions.spec.ts` (add to a loaded file, file has
unique ids). Commit `f9a0895`.

### F-03 Caret-preserving editor sync
*Problem:* full-document dispatch on every machine→editor write; caret lands at offset 0 (review §2 D4,
repro: selection 12 → 0). `CodeEditor.tsx:38`.
*Change:* prefix/suffix minimal-diff dispatch; restore `selection` (and `scrollIntoView` only if the caret
left the viewport); skip dispatch when only trailing whitespace differs. Add `caret-color`/focus assertions
to the CM theme tests.
*Tests:* unit — dispatch keeps caret at its logical position; e2e — click mid-line, wait >400 ms, caret is
still on the same line/column (assert via `window.getSelection()`).

**Done.** Machine→editor writes are prefix/suffix minimal diffs with selection restore
and a skip when the change is empty; `scrollIntoView` only fires when the mapped
selection leaves the viewport. Tests: `codeview/diff.test.ts` (`minimalChange`),
`codeview/CodeEditor.caret.test.tsx` "caret preservation on machine writes", e2e
`p0-regressions.spec.ts` (caret stays on its line across a canvas edit). Commit `f9a0895`.

### F-04 Stop canonicalising the buffer under the caret
*Problem:* `applied()` replaces the user's text with the canonical print (`sync.ts:138-145`), adding `{ }`
blocks mid-typing and re-flowing the doc while the user types (review §2 D3).
*Change:* keep the user's buffer verbatim on idle apply; write the canonical form to the file only
(`markSaved`), canonicalise the buffer on Format/Save. Reconcile `state`/`divergedFromSaved` accordingly.
*Tests:* unit — type one line, fire idle timer, buffer equals what the user typed; file content canonical;
e2e — pause 600 ms mid-rename in code view, canvas does not re-layout (transform attributes unchanged).

**Done.** The idle apply keeps the user's buffer verbatim; canonical text is what gets
*written to the file*, and Format/Save canonicalise the buffer explicitly. Tests:
`codeview/CodeEditor.caret.test.tsx` "no canonicalisation under the caret", e2e
`p0-regressions.spec.ts` (pause mid-edit, transforms unchanged). Commit `f9a0895`.

### F-05 Printer: no empty attribute blocks
*Problem:* every object prints `{ }` even with no attributes (`printer.ts:133-144`), so any canvas write
touches every line and echo diffs are maximal.
*Change:* emit the block only when it has content; grammar already allows omission (`FILE-FORMAT.md:344`).
*Tests:* printer golden + corpus regeneration (`npm run corpus:accept`) + `format(format(x)) == format(x)`.

**Done.** The printer emits an attribute block only when it has content, so a canvas
write no longer touches every line. Tests: `format/printer.test.ts` "omits the
attribute block when an object has no attributes" + "idempotence + IR-stability fuzz
(50 seeds)", corpus + TS⇄Go parity fixtures regenerated. Commit `f9a0895`.

### F-06 `group` / `note` objects must survive a load
*Problem:* palette offers them, loader filters them out (`workspace.ts:139`) — draw a boundary, it disappears.
*Change:* render `group` (boundary rect, resizable, contains-children drag) and `note`; stop filtering;
auto-size groups to their contained objects; `note` uses `attach` when anchors land (F-20).
*Tests:* unit — `docToState` keeps both kinds; e2e — drop a Group, reload, still there with same size.

**Done.** `group` and `note` survive `docToState`, render (boundary rect / note card)
and round-trip; the loader no longer filters them. Tests:
`workspace/workspace.test.ts` "keeps group and note objects", `engine/render/scenegraph.test.ts`
cases, e2e `p1-size.spec.ts`/`p0-regressions.spec.ts`. Commits `f9a0895`,
`9d8fc3f`.

### F-07 Persist what the properties panel shows
*Problem:* object `dashed`, link `dashed`, link `bidir`, and any style/waypoints set in code are dropped by
the canvas projection (review §2 D6/D7).
*Change:* covered structurally by F-01; additionally map `dashed`/`bidir` in the merge so the panel control
and the file stay in sync, and add the missing fields to `DiagramLink`/`DiagramObject`.
*Tests:* unit round-trip for each field; e2e — toggle "Dashed border", reload, checkbox still checked and
the border still dashed.

**Done.** `dashed`, `bidir`, style overrides and custom properties round-trip through
`stateToDoc` + merge, so the panel control and the file stay in sync (and clear again
when the canvas unsets them). Tests: `engine/model/merge.test.ts` "folds canvas dashed
into the style block and clears it again", `ui/PropertiesPanel.test.tsx`, e2e
`p1-properties.spec.ts`. Commits `9d8fc3f`, `b3a761b`.

### F-08 Canvas-origin link semantics must not mutate
*Problem:* `bidir: false` and `type ?? 'uses'` are injected on every canvas write (`workspace.ts:77-83`), so
`a <-> b` becomes `a -uses-> b`.
*Change:* remove the defaults from the projection; carry type/head/tail/line/dashed from the doc.
*Tests:* unit — load `<->`, drag a node, link stays `<->` with the original type; e2e assertion updated.

**Done.** The projection no longer injects `type ?? 'uses'` or `bidir: false`; untyped
arrows stay untyped and `<->` stays bidirectional, with type/head/tail/line carried
from the document. Tests: `engine/model/merge.test.ts` "does not invent a link type
for an untyped arrow" + "keeps a bidirectional link bidirectional", e2e
`p1-properties.spec.ts` / `p3-links.spec.ts`. Commit `9d8fc3f`.

### F-30 Machine writes must not masquerade as user typing (found in F-12 verification)
*Problem:* every machine→editor projection was fed back through `textChanged`, so the
machine armed an idle parse for text the user never typed — a stale pose could flip the
chip to `editing` (and, from there, to `error`) after a pure canvas write. A projection
could also leave CodeMirror believing it had lost focus, silently disabling its keymap.
*Change:* programmatic dispatches are flagged (`projecting`) and skipped in the
update-listener; focus is re-asserted when the editor was the focused element.
*Tests:* `codeview/CodeEditor.caret.test.tsx` "machine writes are not user edits"
(a canvas render reaches the buffer while the sync state stays `clean`).

**Done.** Programmatic dispatches are flagged (`projecting`) and skipped in the
editor's update listener, and focus is re-asserted when the editor was focused, so a
canvas write can no longer arm an idle parse or disable CodeMirror's keymap. Tests:
`codeview/CodeEditor.caret.test.tsx` "machine writes are not user edits" (a canvas
render reaches the buffer while the sync chip stays clean). Commits `01a0417`,
`79e1cc4`.

### F-31 Offline spec raced its own service worker (found in F-12 gate run)
*Problem:* `e2e/m7-offline.spec.ts` runs two tests against the same origin; with
`fullyParallel` they install/claim the SW concurrently and `caches.keys()[0]` could be
an empty cache created by the sibling test — an intermittent red gate.
*Change:* the file is `serial` and the app cache is selected by name (not index), with
the cache name in the assertion message. No retries, no weakened assertion.
*Tests:* the spec itself, run twice in a full-suite pass.

**Done.** `e2e/m7-offline.spec.ts` is `serial` and selects the app cache by name (not
by index) with the name in the assertion message — no retries, no weakened assertion.
Verified by running the full e2e suite repeatedly. Commit `01a0417`.

### F-32 Adopting the stored layout overwrote the first click (found in F-10 verification)
*Problem:* `useUiLayout` adopted the persisted layout in an effect, i.e. *after* the
shell painted. A click landing in that window (the first thing a returning user does)
was applied to the default layout and then silently reset; focus could also be left
inside a panel that was being replaced, which disabled the shell shortcuts.
*Change:* the layout is adopted during render (conditional setState) so the first
painting already shows the stored layout; collapsing/expanding moves focus to the
rail's button, so shortcuts keep firing.
*Tests:* `ui/uiLayout.test.ts` (pure adopt maths), e2e `p1-shell.spec.ts`
(collapse → reload → expand, keyboard shortcut round-trip).

**Done.** `useUiLayout` adopts the persisted layout during render (conditional
setState), so the first paint already shows it; collapse/expand moves focus to the
rail button so shortcuts keep firing. Tests: `ui/uiLayout.test.ts` (pure adopt maths),
e2e `p1-shell.spec.ts` (collapse → reload → expand, keyboard round trip). Commit
`79e1cc4`.

### F-33 Panel shortcuts died once focus was inside a panel (found in F-23 gate run)
*Problem:* `Ctrl/Cmd+Alt+P` was gated by the "is this a text field" guard, and
collapsing the properties panel hands focus to an input inside it (a colour swatch).
The user pressed the documented shortcut twice and nothing happened.
*Change:* the guard now only applies to shortcut combinations that can be typed, so
`Ctrl/Cmd+Alt+P` fires from anywhere; the focus move to the rail still happens for
pointer toggles.
*Tests:* e2e `p1-shell.spec.ts` (three-way shortcut round trip).

**Done.** The text-entry guard now applies only to shortcut combinations that can be
typed, so `Ctrl/Cmd+Alt+P` fires from anywhere; pointer toggles still hand focus to the
rail. Tests: e2e `p1-shell.spec.ts` (three-way shortcut round trip, including a second
press that starts with focus inside a panel). Commit `62a373c`.

### F-34 A broken statement was attributed to the wrong object (found in F-23 verification)
*Problem:* the parser reports `expected arrow, got 'datastore'` at **column 1 of the
following line**, and a failed parse returns no objects, so the "which object is
broken" mapping either pointed at an innocent object or at nothing.
*Change:* a col-1 diagnostic is attributed to the previous statement, and
`objectAtLine` falls back to reading `kind id` off the raw line when the parse fails.
*Tests:* `format/spans.test.ts` (recovery fallback), e2e `p3-diagnostics.spec.ts`.

**Done.** A col-1 diagnostic is attributed to the previous statement and
`objectAtLine` falls back to reading `kind id` off the raw line when the parse fails,
so a broken attribute rings the object it belongs to. Tests:
`format/spans.test.ts` (raw-line recovery), e2e `p3-diagnostics.spec.ts` (ring on the
broken statement only). Commit `62a373c`.

### F-09 Repo hygiene: no generated content
*Problem:* `dist/release/**` (12 files, 46 MB of dry-run binaries + built pages) and
`e2e/__screenshots__/**` are tracked, and the specs write into the tracked directory — every e2e run leaves
a dirty worktree (review §7).
*Change:* `git rm -r --cached dist`; add `dist/`, `e2e/**/__screenshots__/` to `.gitignore`; write run
screenshots to `test-results/` (`playwright.config.ts` `outputDir`); keep curated goldens in
`e2e/goldens/` written only when `UPDATE_GOLDENS=1`; add a CI step asserting `git status --porcelain` is
empty after e2e; document the optional history purge in `agents.md`.
*Tests:* `npm run check` + `npm run e2e` then `git status --porcelain` empty; `git ls-files dist` empty.

---

**Done.** `dist/` and run screenshots are untracked and ignored, e2e writes to
`test-results/` with curated goldens only under `UPDATE_GOLDENS=1`, and
`scripts/check-repo-clean.sh` (wired into the m7 gate) fails on tracked generated
content or a dirty worktree. Verified: `git ls-files dist` is empty and
`bash scripts/verify.sh m7` leaves `git status --porcelain` empty. Commit `9d8fc3f`.

### F-28 Startup snapshot must not be read as a canvas edit — **critical** (found in F-01 verification)
*Problem:* the canvas emits a snapshot (empty) from its constructor and again before
  its file load; `useCodeSync`'s bridge treated it as a genuine canvas edit, merged the
  empty state into the document and the 150 ms code re-render — plus `saveCanvas` —
  wrote an object-less document over the file. Separately, a *no-op* render request
  (`printDoc(doc) === buffer`) cancelled a newer pending render, so the last real
  change could be discarded and the code view stayed stale. Repro: seed a file with
  objects, reload, read the code pane → `pcd 1.0` only.
*Change:* `CanvasController.isHydrated()` (set by `loadState`); the bridge and
`onCtrlState` ignore pre-load snapshots; the bridge reads the controller's live
  snapshot instead of the possibly-stale prop; `renderFrom` no longer cancels a
  pending render for a no-op request.
*Tests:* `useCodeSync.test.tsx` (hydrated/live-state double), `sync.test.ts`
  "a no-op canvas change does not cancel a newer pending render", e2e
`p0-regressions.spec.ts` (reload keeps the document).

**Done.** The canvas reports hydration (`isHydrated()`), and the code-sync bridge
ignores snapshots taken before the first load, so an empty startup pose can never be
merged over the file; a no-op render request no longer cancels a newer pending render.
Tests: `codeview/sync.test.ts` "a no-op canvas change does not cancel a newer pending
render", `workspace/workspace.test.ts` startup cases, e2e `p0-regressions.spec.ts`
(seed → reload → code pane still lists the objects). Commit `f9a0895`.

### F-29 Content must survive a reload inside the autosave window — **critical** (found in F-01 verification)
*Problem:* `Autosaver` debounces 800 ms (FR-S1) and `beforeunload` cannot await an
  IndexedDB write, so a reload/close shortly after an edit lost it — the restored
  workspace was the previous record (and, combined with F-28, sometimes an empty one).
*Change:* document *content* writes (`saveCanvas`, `saveText`) persist immediately
  (`Autosaver.flush()`); UI churn (tab order, focus) keeps the debounce.
*Tests:* `workspace.test.ts` "content durability (F-29)" (store holds the new text
  with no explicit flush), e2e reload assertions in `p0-regressions.spec.ts`.

**Done.** Document content writes (`saveCanvas`, `saveText`) flush the autosaver
immediately so a reload inside the 800 ms window keeps the edit; UI churn (tab order,
settings) keeps the debounce. Tests: `workspace/workspace.test.ts` "content durability
(F-29)" (store holds the new text with no explicit flush), e2e reload assertions in
`p0-regressions.spec.ts`. Commit `9d8fc3f`.

## Phase P1 — Requested UX (all depend on P0)

### F-10 Collapsible, resizable shell — *items 1-3*
Panels: sidebar / palette / code / properties each get `open|collapsed`; splitters with persisted widths;
`Ctrl/Cmd+B` sidebar, `Ctrl/Cmd+J` code, `Ctrl/Cmd+Alt+P` properties; collapsed code leaves a rail with the
sync-state chip; default `code: collapsed` under 1440 px. Persist in `StoredWorkspace.settings` (schema bump
+ migration in `store/port.ts` + `store/idb.ts`).
*Tests:* component — toggles flip `aria-expanded`, layout state persists; e2e — collapse all, reload, canvas
width ≥ 900 px at 1280; axe stays green.

**Done.** `ui/uiLayout.ts` is the pure model (panels, widths with clamps, F-11 section
state, defaults incl. code-collapsed < 1440 px); `ui/useUiLayout.ts` owns persistence
(`StoredWorkspace.settings`, schema v2 + migration) and the shortcuts (`Ctrl/Cmd+B`,
`Ctrl/Cmd+J`, `Ctrl/Cmd+Alt+P`); `ui/PanelChrome.tsx` provides the header chevron, the
rail (the code rail keeps the sync chip) and the drag splitter; `ui/ShellSlots.tsx`
keeps App small. Widths are CSS variables written from the layout, so the canvas gets
its space back. Tests: `ui/uiLayout.test.ts`, `store/port.test.ts` + `store/idb.test.ts`
(v1 → v2 migration), e2e `p1-shell.spec.ts` (collapse all → reload → canvas ≥ 900 px at
1280 px, shortcuts, splitter clamp + persistence).

### F-11 Properties panel sections — *item 2*
Split into collapsible sections (Identity / Metadata / Style / Advanced) with per-section persistence; add
the missing controls from the spec: custom key-value properties, style overrides (fill/stroke/text/icon),
link direction/head/line (F-12), size (F-13).
*Tests:* component — section collapse + every control round-trips through the doc.

**Done.** The panel is split into `Identity / Metadata / Style / Advanced` sections
whose expanded state lives in the persisted layout (`uiLayout.sections`, F-10), with a
new custom key-value editor (add/edit/remove → `property` lines), style override
controls (fill/stroke/text/icon → the object `style` block), a link `Bidirectional`
toggle (F-07/F-08 surfaced) and the size/id read-out plus `Fit`. Object style overrides
reach the renderer as CSS custom properties on the object group
(`--pc-shape-fill/-stroke`, `--pc-label-fill`) so theme tokens remain the default.
Tests: `ui/PropertiesPanel.test.tsx` (sections, every control patch, link bidir/head),
`workspace.test.ts` (properties/style round-trip + clearing an override),
e2e `p1-properties.spec.ts` (section state survives reload, custom property + fill
reach the file, reload repaints the override).

### F-12 Arrow type model — *item 10*
Link visual model `{head, tail, line, width}` + per-type colour hint; renderer gains one marker per head
shape; format carries `head/tail/line` inside the existing link `style` block; UI segmented control and
`Shift+A` cycle.
*Tests:* unit — marker selection per link, style block round-trip; e2e — set "diamond tail", reload, assert
`marker-start` and the code line; visual screenshot (light+dark) of 5 link styles.

**Done.** Link style blocks carry `head`/`tail`/`line`/`width` (IR v2, FILE-FORMAT §4,
TS + Go parser/printer/serializer, corpus + parity fixtures cover the new syntax). The
renderer defines one marker per shape (`arrow|open|diamond|circle|square|none`) for head
and tail, applies line texture/width, and exposes `data-link-type` for a per-type colour
hint (new `--pc-info`/`--pc-warn` tokens, light + dark). The properties panel has head/
tail/line/width controls and `Shift+A` cycles the head (undoable). Tests:
`engine/format/linkStyle.test.ts`, `engine/render/markers.test.ts`,
`ui/CanvasController.test.ts` (cycle + marker render), e2e `p1-links.spec.ts`
(persist → reload → markers, colour hint, five styles light+dark screenshots).

### F-13 Size: format, fit-to-name, manual resize — *items 7, 8*
`size <w> <h>` object attribute (known attr, `IR_VERSION` 2); measurement port for text; `autoSize` on
create/rename with 2-line wrapping; 8-handle resize for all kinds (min 48×32, snap, one undo per drag);
`Fit` command; explicit size disables auto-fit.
*Tests:* unit — text measurement stub, auto-grow, wrap, clamp; e2e — resize a container, reload, same size;
screenshot before/after of a long name (proves no overflow).

**Done.** `size` is a known object attribute (IR v2, FILE-FORMAT §3 + EBNF, TS + Go
parser/printer/serializer, corpus + parity fixtures regenerated). Measurement is a
port (`engine/render/measure.ts`: canvas implementation in the browser, deterministic
stub in tests) with two-line wrapping; `engine/render/resize.ts` implements all eight
anchors (min 48×32, grid snap, one undo per drag) and every kind shows them. Fit runs
on create, on rename (grow-only) and on load for objects without explicit size; the
`Fit` command (properties panel) records explicit geometry. Tests:
`engine/render/measure.test.ts`, `engine/render/resize.test.ts`,
`engine/format/size.test.ts`, `workspace.test.ts` (size round-trip), e2e
`p1-size.spec.ts` (resize → reload, eight handles on person/note, long-name fit with
real `getBBox` overflow assertions, light+dark screenshots).

### F-14 Geometry persistence + explicit re-layout — *item 9*
Drag/resize end commits positions to the active view (implicit `"Default"` with `layout saved` when absent),
debounced 250 ms, undoable; opening/switching never re-positions; only `Auto-layout` (confirmed + undo) and
`Reset layout` reorganise.
*Tests:* unit — commit path writes `position` lines only for moved ids; e2e — drag 3 nodes, reload, identical
transforms; `Auto-layout` changes them and undo restores.

**Done.** `CanvasController` gained an `onGeometry` hook fired at drag/resize end
with only the ids that moved; the consumer (`useCanvasController`) debounces 250 ms
and merges them into the active view through `applyLayoutToView`, routing the result
through the sync machine (`CodeSyncHandle.commitDoc`) so the code view and the file
agree immediately. Opening/switching files only *applies* stored positions.
`Auto-layout` runs through `applyLayoutCommand` (one undo entry, persisted via the
hook) and a new `Reset layout` button drops the active view's `position` lines. Tests:
`engine/layout/apply.test.ts` (moved-ids-only commit), e2e `p1-geometry.spec.ts`
(drag → reload → identical transforms → reload again; file switch keeps geometry;
auto-layout differs, undo restores, reset keeps the diagram).

### F-15 In-place rename — *item 6*
`F2` / double-click opens an overlay input positioned in screen space (repositioned on pan/zoom, chip above
200 % zoom), Enter commits, Esc cancels, `aria-label="Rename <kind>"`, routed through `updateObject`
(coalesced undo), properties panel mirrors it live.
*Tests:* component — Enter/Esc/blur paths; e2e — rename on canvas, assert canvas label + properties field +
code line all agree.

**Done.** `F2` / double-click open `ui/InlineRename.tsx`: a fixed-position input
seeded with the current label, placed from the object's canvas rect × viewport so it
follows pan/zoom, switching to a compact chip at ≥ 200 % zoom. Enter/blur commit
through `updateObject` (one coalesced undo entry), Escape cancels — including the
unmount-blur that used to commit the discarded text; the properties panel mirrors the
change because both write the same state. Tests: `ui/InlineRename.test.tsx`
(seed/focus/aria-label, Enter, Escape, blur, no-op labels, chip presentation,
Escape-then-blur regression), e2e `p1-rename.spec.ts` (double-click rename with canvas
label + properties + code agreeing, undo, F2 + Escape, light/dark screenshots).

---

## Phase P2 — Presentation & animation

### F-16 Present shell — *item 11*
Fullscreen presentation container that hides editor chrome (`.presenting`), minimal transport dock,
click/`Space`/`→` advance, `←` back, `P` pause, `R` restart, `Esc` exits and restores the pre-play viewport;
step counter, progress dots, speaker notes, reduced-motion path.
*Tests:* e2e — start flow, click canvas to advance, counter increments, Esc restores viewport + chrome;
screenshot of presenting mode; `prefers-reduced-motion` path.

**Done.** `ui/present.ts` (state + key model), `ui/usePresentation.ts` (enter/auto-exit),
`ui/PresentDock.tsx` (docked transport, step counter, progress dots, notes) and
`usePresentKeys` (Space/→/←/P/R/Esc); the shell hides editor chrome via
`.presenting` while presenting and `exit()` restores the pre-play viewport and chrome.
Reduced motion is honoured through the camera/animator deps. Tests: `ui/present.test.ts`,
e2e `p2-present.spec.ts` (click + keyboard advance, Esc restores viewport/chrome,
reduced-motion path, screenshots).

### F-17 Illustration registry
`BeatPlayer` implementations: `travel-token` (existing), `pulse` (existing), `sequential-glow` (par lanes),
`packet-burst` (info), `compare-split` (alt), `trail-fade` (conclusion); per-flow choice in the flow header,
planner untouched.
*Tests:* unit per player (keyframe/DOM end-state), e2e video-frame assertion on one player + screenshots.

**Done.** `engine/anim/illustrations.ts` is the registry: six styles
(`travel-token`, `pulse`, `sequential-glow`, `packet-burst`, `compare-split`,
`trail-fade`) with a per-beat-kind default and a resolver that degrades gracefully
when a beat has nothing to travel. `FlowAnimator.setIllustration` draws them (token +
dash, dash only, staggered glow — which keeps FR-F4 concurrent lane travel — a six-dot
burst, and a divider between alternatives); the flow header offers `auto` or an
explicit style and the planner is untouched. Tests:
`engine/anim/illustrations.test.ts` (registry, fallbacks, DOM end-state per style,
stop() cleanup), e2e `p2-illustrations.spec.ts` (auto token vs explicit trail-fade,
light + dark screenshots).

### F-18 Flow editing parity
Drag-reorder steps (exists as `moveStep`, wire the UI), duplicate step, per-step delay editing, dirty
indicators, sticky flow header with "play from step".
*Tests:* component + e2e reorder persists in code.

**Done.** Steps drag-reorder (HTML5 DnD, same-parent only, wired to `moveStep`),
duplicate is a deep copy inserted after the original (`duplicateStep`), and each leaf
step carries an editable dwell — a new *format* attribute `delay <ms>` (FILE-FORMAT
step grammar, IR `delayMs`, TS + Go parser/printer/serializer, parity fixtures, planner
applies it per step). The step header is sticky and shows an `unsaved` chip while the
buffer diverges, and every row has "play from this step". Tests:
`ui/flows/flowDoc.test.ts` (duplicate), `engine/format/stepDelay.test.ts` (round-trip,
IR, negative rejection, clearing, planner override), e2e `p2-flowedit.spec.ts`
(duplicate, delay edit, drag-reorder reflected in the file, play-from-step).

---

## Phase P3 — Parity, fidelity, discoverability

### F-19 Clipboard, context menus, waypoints, alignment — *spec items missing today*
Copy/paste/duplicate with cross-file id remap (needs F-02); canvas/object/edge context menus; waypoint
dragging with orthogonal re-route; align/distribute/equal-size on multi-selection.
*Tests:* unit for the command layer; e2e for each entry point.

**Done.** `ui/canvasCommands.ts` is the pure command layer: clipboard copy/paste with
fresh-id remapping (links remapped, dangling links dropped), align (6 edges/centres),
distribute (x/y) and equal-size; every command is one undoable entry
(`CanvasController` exposes them plus `mod+C/V/D`, which stay out of the code editor).
A right-click context menu (`ui/ContextMenu.tsx` + `CanvasMenu`) offers exactly the
commands the current selection allows. Waypoints are document data: the router passes
through them with orthogonal elbows (`routeOrtho` waypoint path, obstacles skipped by
design), a selected link shows draggable handles, the drag re-routes live and writes
back through the merge — and waypoints are part of the canvas fingerprint so the code
view follows. Tests: `ui/canvasCommands.test.ts`, `engine/render/waypoints.test.ts`,
`CanvasController.test.ts` (clipboard uniqueness/undo, align/equal-size, waypoint drag
+ undo), `workspace.test.ts` (waypoint round-trip), e2e `p3-commands.spec.ts` and
`p3-waypoints.spec.ts`.

### F-20 Imports rendered as ghosts
Resolve `imports`, render ghost objects (dashed, badge), click-through to source file, cycle + missing-file
errors surfaced in the UI, read-only enforcement.
*Tests:* unit resolution + cycle detection; e2e two-file workspace.

**Done.** `engine/model/imports.ts` resolves `alias.objectId` ghosts (path normalisation
+ workspace-escape rejection, missing/cycle/unparseable/nested reporting). Dotted refs
are now part of the grammar (lexer `.`, `refId` for link endpoints, flow msg/process
targets and `attach`) with TS⇄Go parity covered by a new fixture — before this, the
format's own FR-I2 reference form could not be parsed. The canvas renders ghosts
read-only (dashed + `imported` badge, `ui/ghostLayout.ts` places them below the
document), a click opens the source file, and links to ghosts survive canvas writes
because `docToState`/`applyCanvasState` accept qualified endpoints and
`recomputeRoutes` resolves ghost anchors. Import problems surface in a banner.
Tests: `engine/model/imports.test.ts`, `ui/ghostLayout.test.ts`, parity fixture
`import-qualified-refs`, e2e `p3-imports.spec.ts` (ghosts + click-through + missing
banner, light screenshot).

### F-21 Mermaid interop completion
`sequenceDiagram` import → flows (FR-M3), C4 export, `classDef`/`linkStyle` mapping, and a generated
`docs/MERMAID-MATRIX.md` that is asserted against the exporter's `dropped[]` list.
*Tests:* corpus fixtures both directions + a doc/code parity test.

**Done.** `sequenceDiagram` imports to objects + a flow of `msg` steps (response arrows
stay dashed, unsupported blocks warn M200); `classDef`/`class` map to tags with colours
declared as an M100 info drop (applying them broke the export→import round trip);
`linkStyle <n>` maps onto the import-ordered link (stroke/dash); `docToC4` exports a
`C4Context` with its own declared drop catalogue. `docs/MERMAID-MATRIX.md` is
generated from the converters' catalogues and a test regenerates/compares it
(`MERMAID_MATRIX=1`), so a new capability or drop cannot land undocumented. Corpus and
parity fixtures regenerated. Tests: `sequenceImport.test.ts`,
`mermaidMatrix.test.ts` (doc parity + "maximal document only reports catalogue
entries" + C4 mapping), updated `mermaid.test.ts`.

### F-22 Canvas accessibility + canvas↔code map
Roving-focus object navigation (`Tab` into canvas, `←→↑↓` between objects, `Enter` select, `F2` rename),
ARIA roles/labels on scene nodes, `aria-live` narration already present; click object → highlight its code
lines and vice versa.
*Tests:* e2e keyboard-only pass (axe + focus order), screenshot of code highlight.

**Done.** Scene nodes carry `role="button"`, `tabindex="-1"` and an
`"<kind> <name>"` label; `Tab`/`Shift+Tab` walk the objects in order and the arrow
keys pick the nearest object in that direction (controller roving focus, `Enter`
selects, `F2` renames). The canvas↔code map is two-way: a single-object selection
highlights the entity's statement lines in the code view with a decoration
(`codeview/highlight.ts` — no caret stealing, no focus loss), and putting the caret on
a statement selects that object. Statement spans come from `format/spans.ts`
(brace-aware block scanning). Tests: `format/spans.test.ts`,
`CanvasController.test.ts` (roles/labels, Tab roving, arrow navigation, F2),
e2e `p3-a11y-map.spec.ts` (keyboard pass, canvas→code highlight, code→canvas
selection, screenshot).

### F-23 Diagnostics on canvas + error-state UX
Error ring on offending objects, "N problems" header chip, last-good render with an "out of date" canvas
banner instead of a frozen silent canvas.
*Tests:* component + e2e typing an error mid-rename.

**Done.** `ui/useCanvasDiagnostics.ts` maps parser diagnostics to objects
(`Ctrl.setErrors` rings them via `pc-error`; the render loop re-applies the rings after
every rebuild) and `ShellBanners` renders the stale banner + an `N problems` count.
The mapping needed two fixes: a statement broken mid-attribute is reported at
column 1 of the *following* line, so a col-1 diagnostic is attributed to the previous
statement (`ringTargets`); and `objectAtLine` falls back to reading `kind id` off the
raw line because a failed parse returns no objects. Tests: `format/spans.test.ts`,
e2e `p3-diagnostics.spec.ts` (ring on the broken statement only, banner, recovery).

### F-24 Unified undo
One journal: canvas commands, code edits, flow/view edits with focus-aware `Ctrl/Cmd+Z` routing and a
history affordance for the last N entries.
*Tests:* unit ordering/coalescing; e2e undo across all three surfaces.

**Done.** `ui/historyFeed.ts` is the shared journal (`HistoryFeed` with
coalescing `mergeKey`, cap 40, `undoSurface` routing rule) and `ui/useHistory.ts`
feeds it: canvas commands arrive through a new `UndoStack.setObserver` hook (one row
per push, coalesced runs fold into one), code edits through the machine's
`editing` transition (one row per typing burst). `ui/HistoryMenu.tsx` (opened from
the header's `⟲ History`) lists the last 12 rows with surface badges and offers
Undo/Redo routed to whatever owns the top action — `Ctrl/Cmd+Z` keeps its
focus-based routing. `CanvasController` gained `undoCommand`/`redoCommand` and
depth getters; the editor installs `ui/codePorts.ts` so the shell can undo code
without reaching into CodeMirror. Tests: `ui/historyFeed.test.ts`,
e2e `p3-history.spec.ts` (drag + code edit → one journal → undo/redo across
surfaces, screenshot).

---

## Phase P4 — Laws-of-UX pass & docs truth

### F-25 UX laws pass
Implement the audit table in `REVIEW-enhancements.md` §6: saved/dirty pill, template gallery empty state,
palette grouped by C4 level, progressive link-type menu, feedback toasts, problem chips, closing card,
sticky flow headers, hover info cards, docked transport, 32 px minimum hit targets.
*Tests:* component tests per affordance + screenshot set light/dark per state.

**Done.** `ui/StatusPill.tsx` (Saved · HH:MM / Unsaved + problem chip, fed by
`WorkspaceManager.lastSavedAt`), `ui/EmptyState.tsx` (three template cards, mounted in
the canvas column), `ui/paletteGroups.ts` (C4 grouping, quick-add keys unchanged),
progressive link-type picker (four verbs + "More types"), `ui/hoverInfo.ts` +
`ui/HoverCard.tsx` (name/technology/description/tags on canvas hover, `trackHover` in
the controller), undo/redo toasts through the history hook, closing card on `ended`
(replay / export SVG / close, backed by a new `player.exportSvg` port), docked
transport and 32 px minimum hit targets in CSS.

**Done (continued).** Derived fixes found while verifying:
- **F-35** the template gallery was mounted at shell level, so its `position:absolute`
  overlay covered the whole window and swallowed clicks on the code editor; it now
  lives inside `.canvas-col` (which gained `position:relative`) with
  `pointer-events:none` outside its cards.
- **F-36** all three templates and the spec doc I wrote were *not parsable* (labels are
  `: "text"`, the attribute is `tag` not `tags`, flows are `flow "Name" as id`). Fixed,
  and `uxLaws.test.tsx` now parses every template so they cannot drift again.

*Tests:* `ui/uxLaws.test.tsx` (8 cases: grouping, pill clock/labels/problems, hover
detail + card, template parsability), e2e `p4-uxlaws.spec.ts` (gallery insert, palette
groups + 32 px targets, pill/hover/problem chip, screenshot set
`f25-clean-light/dirty-dark/error-light`, closing card).

### F-26 Docs truth pass
Update `SPEC.md` (either implemented or moved to a post-1.0 section: FR-C5/C6/C7/C8/C10/C12, FR-I*),
`USER-GUIDE.md` (panels, rename, size, present mode), `AppHeader` copy (drop "M3 workspace"), `CHANGELOG.md`,
`agents.md` (new gates: corpus regeneration steps, e2e golden policy).
*Tests:* `scripts/check-docs.sh` (links + `.pcd` fences) + a manual diff of FR list vs code grep.

**Done.** `SPEC.md` gained §12.1 "v1.0 status": FR-C5/C6/C7/C8/C9/C10/C12 and
FR-I1…I3 recorded as implemented, with curved/straight routing, mini-map, cross-file
inlining and per-step illustrations moved to the post-v1 list. `USER-GUIDE.md`
documents the grouped palette, inline rename, eight-handle resize/`size`, waypoints,
hover card, saved/dirty pill, error state, templates, history affordance, present mode
and the flow closing card. The header's "M3 workspace" copy is gone (replaced by the
status pill, F-25). `agents.md` lists the docs/corpus/hygiene gates and the stale-dist
pitfall; `CHANGELOG.md` carries a line per task. Test: `scripts/check-docs.sh`
(links + every ```pcd fence parses) is part of the m7 gate. Commit `e62a3ce`.

### F-27 Performance guard for the new sync path
Benchmark 500 objects with a single rename; assert ≤ the M7 budget in `engine/perf/nfr.test.ts`; confirm no
regression from minimal-diff sync and merge-based saves.
*Tests:* the benchmark itself plus the existing N1–N3 gates.

**Done.** `N4` in `engine/perf/nfr.test.ts`: a 500-object document, one object
renamed, then merge → print → re-parse → `docToState` → minimal diff, with the
per-stage timings logged. Measured **3.0 ms total** (merge 1.1 / print 0.6 /
parse 0.8 / state 0.3 / diff 0.3) against a 150 ms budget, so the merge-based save
and the minimal-diff sync added no measurable cost. The gate also asserts the rename
survives the round trip and that the diff is local (`insert < baseText/20`), i.e. the
editor is not asked to replace the document for a one-line change. Diffing is done
canonical-vs-canonical: measuring against the raw synthetic source would only
measure printer normalisation, which no user interaction produces.

---

## Phase P5 — Spec-completion review

Baseline review: `npm run check`, 865 Vitest tests, coverage thresholds, Go tests/vet,
staticcheck/gocyclo, docs/hygiene, self-containment and all 67 Playwright specs passed.
The passing UI suite did not exercise SPEC S6; direct CLI probes reproduced the gaps below.

### F-37 Headless render CLI — **critical**
*Problem:* `panelcraft render` exits 2 with “not implemented yet”, although SPEC FR-X and S6
require PNG/SVG output through headless Chrome.
*Change:* add an isolated browser render entry point and an `internal/render` chromedp adapter;
support `--out`, `--width`, `--theme`, `--view`, `--chrome`, actionable startup/parse/view errors.
*Tests:* browser render unit tests plus real-Chrome Go integration tests for SVG and PNG; CLI
usage/IO/error-path table; S6 documentation and verification gate.

**Done.** `web/src/cliRender.ts` renders through the real canvas controller without mounting the
workspace; `internal/render` drives an ephemeral loopback server through chromedp. Verified by
`go test ./cmd/panelcraft -run 'TestRender' -count=1` (real Chrome SVG, 640 px PNG, C4 conversion
integration, validation/error paths) and `npx vitest run web/src/cliRender.test.ts`. `render_cli`
is an m7 verification stage.

### F-38 Convert command contract — **critical**
*Problem:* `convert` writes `.pcd` input to IR JSON instead of converting Mermaid input to
canonical `.pcd`; the documented `-o out.pcd` form is not accepted after the input path.
*Change:* support `.mmd`/`.mermaid`/`.txt` → canonical PDL and `.pcd` canonicalisation, `-o`
in either position, diagnostics without silent drops, and no output on fatal input.
*Tests:* Go table tests for flowchart/C4 conversion, canonical output, flag order, output paths,
parse failures and usage/IO exit codes.

**Done.** Go Mermaid converters emit canonical PDL for flowchart/C4/sequence input; `.pcd` input
canonicalises, `-o` works on either side of the input, and fatal parses leave no output. Verified
by `go test ./cmd/panelcraft -run 'TestConvert' -count=1` and `go test ./...`.

### F-39 Flow camera edge containment
*Problem:* final vision review recorded actors clipping at canvas borders during playback.
*Change:* contain fitted actor bounds within the usable viewport without changing zoom limits;
subtract the embedded SVG's page origin before inverting the viewport.
*Tests:* pure SVG-origin mapping regressions, existing camera target tests, and S3 active-actor
containment assertions plus visual proof.

**Done.** `screenRectToCanvas` removes the SVG origin before viewport inversion. The flow rect
provider now inverts the world's actual screen CTM, so bounds measured during a WAAPI camera glide
use the same transform as the rendered actors. The two pure mapping regressions failed before the
origin fix and pass with the existing camera suite. S3 checks both message beats for active-actor
containment; the beat-6 regression failed under full parallel load before the CTM fix and the full
67-spec run now passes. Light/dark captures were reviewed. Conclusion retains Web/DB focus; dim Ada
is intentionally outside that active set.

### F-40 Dependencies panel context
*Problem:* the panel names the selected object but not its owning file (M6/M7 carried defect).
*Change:* pass the active workspace path into the panel heading.
*Tests:* component heading test and existing properties/dependencies e2e coverage.

**Done.** The heading is `dependencies · <active path> · <selected object>`. The component regression
failed before `filePath` was threaded through App/ShellSlots and passes in the targeted Vitest run.

### F-41 Headless C4 auto-layout quality (found in F-37 visual review)
*Problem:* a real C4 conversion rendered, but grid fallback overlapped relationship labels and detached
boundary layout. Successful file output alone was not a usable diagram.
*Change:* run the existing dagre layout engine ephemerally for position-free auto views, then fit and render
those positions without changing the source document. Compound boundaries reserve their members'
geometry; group rectangles are routing containers, not solid obstacles.
*Tests:* CLI browser regression for position-free C4 input; conversion → real-Chrome render integration;
light/dark visual review of a C4 shop diagram.

**Done.** Position-free views use compound dagre geometry, including ephemeral boundary sizes; the
source is not mutated. RED evidence: grid layout kept API at `y=40`, flat dagre left the boundary
outside its member, and a containing boundary forced a three-elbow detour. Regressions now pass in
`dagre.test.ts`, `CanvasController.test.ts`, and `cliRender.test.ts`. Real-Chrome C4 conversion→SVG
passes in `TestRenderChromeMermaidC4`; `/tmp/panelcraft-design-review/shop-final-light.png` and
`shop-final-dark.png` were reviewed with members contained, the external provider outside, and full
relationship labels visible. Follow-up regressions disable CSS transition frames during export,
reserve rank space for labels, and centre labels across short Z-route channels.

---

## Sequencing & dependencies

```
P0: F-01 → F-02 → F-03 → F-04 → F-05 → F-06 → F-07 → F-08 → F-09
P1: F-13(format first) → F-14 → F-12 → F-10 → F-11 → F-15
P2: F-16 → F-17 → F-18
P3: F-19 → F-20 → F-21 → F-22 → F-23 → F-24
P4: F-25 → F-26 → F-27
```
Rationale: F-01/F-02 unblock every geometry/task; F-13's `size` attribute must land before F-14 commits
positions; F-12 wants the same merge path; P2 has no format risk and can ship independently if needed.

## Definition of done (programme)

1. Every `F-xx` row closed with its test, and no open issue rows in this file.
2. `npm run check`, `npx vitest run` (coverage thresholds), `npm run e2e`, `bash scripts/verify.sh m7` all
   green; `git status --porcelain` empty after a full e2e run.
3. `git ls-files dist` empty; no generated artefact tracked anywhere.
4. Visual evidence captured for F-12, F-13, F-15, F-16, F-17, F-22 (light + dark screenshots) and stored
   per F-09's policy.
5. `REVIEW-enhancements.md` §2 defects marked FIXED with the commit shas; SPEC/USER-GUIDE/CHANGELOG updated.

---

## Programme closure (measured, not asserted)

Every task row above is closed. The programme gate was run end to end:

| Gate | Result |
|------|--------|
| `npm run check` (tsc + eslint, complexity/size gates) | clean |
| `npx vitest run` | **865 tests / 77 files passing** |
| `npm test` (coverage thresholds) | pass — `web/src/engine/**` and `web/src/workspace/**` gated at 80 % lines/functions/statements, 60 % branches |
| `npx playwright test` | **67 specs passing** (run after `npm run build`; the preview server serves the existing `dist`) |
| `go test ./...`, `go vet`, `staticcheck`, `gocyclo -over 15` | green (m7 stages) |
| `bash scripts/verify.sh m7` | **ALL STAGES GREEN** |
| `bash scripts/check-repo-clean.sh` + `git status --porcelain` | clean; `git ls-files dist` empty |
| `bash scripts/check-docs.sh` | OK — links resolve, every ```pcd fence parses |
| `docs/REVIEW-enhancements.md` §2.1 | D1–D12 marked FIXED with the closing commit sha |
| `docs/SPEC.md` §12.1 | implemented vs post-v1 requirements recorded |
| `docs/CHANGELOG.md` | one entry per task ID (P0 → P4) |

Issues discovered *during* the programme were fixed in-programme and registered as
F-28…F-36 (F-28 startup pose written as a canvas edit, F-29 durability inside the
autosave window, F-30 projections masquerading as typing, F-31 offline spec racing
its service worker, F-32 layout adoption overwriting the first click, F-33 panel
shortcut dying inside a text field, F-34 diagnostics attributed to the wrong object,
F-35 gallery overlay swallowing editor clicks, F-36 unparsable templates). Each has
its own Done note and regression test above.
