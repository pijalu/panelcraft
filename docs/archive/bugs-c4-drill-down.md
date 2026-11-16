<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed item: genuine C4 drill-down and embedded source

Source: `bugs.md`, queued item 16. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §12.
Grammar and diagnostics: `docs/FILE-FORMAT.md` §3.2, §3.3, §10 (codes
`P211`–`P218`, `E116`). Product requirements: `docs/SPEC.md` §4.11 (FR-D1…FR-D6).

## Observed behaviour

Two "same file" mechanisms existed and neither expressed decomposition:

- **Imports** (`import alias as "./x.pcd"`) put another file's objects on the
  canvas as read-only *ghosts* — dashed border, "imported" badge, click-through to
  the source file. Reuse, not ownership.
- **Flow `goto`** jumped between flows, possibly across files. Navigation inside a
  story, not a diagram.

So a `system` could not open its container diagram, a `container` could not open
its component diagram, and no object could carry the snippet that explains it
(signature, query, payload). Calling either existing mechanism "drill-down" would
have been a rename, not the feature: ghosts duplicate the parent's objects inside a
diagram, and `goto` has no parent/child identity at all.

## What the format does now

Two object attributes, both authored **on the parent only**:

```
pcd 1.0

system shop "Webshop" {
  drilldown "../containers/shop.pcd" view containers
  source {
    language "go"
    text "func Charge(total Money) error {"
    text "  return h.psp.Authorize(total)"
    text "}"
  }
}
```

- **`drilldown "<path>" [view <id>]`** — a workspace-relative POSIX path to a
  `.pcd` file plus an optional view id in that file. The child never declares a
  backlink, so each edge has exactly one author and the two ends cannot disagree.
- **`source { language "…" text "…" … }`** — one `text` line per source line, in
  document order. Blank lines, quotes and literal tabs survive print → parse
  unchanged (`\t` is not a PDL escape, so indentation is content).

Decisions the item asked to settle, and what landed:

| Question | Ruling |
|---|---|
| Allowed C4 transitions | `system`/`system_ext` → child `level container`; `container` → `level component` or `level deployment`. A child that declares **no** `level` is accepted (the file makes no claim); a mismatching one is `P214`. |
| Kinds that cannot decompose | `person`, `datastore`, `queue`, `note`, `group` → `P215`. A group is a boundary and a note an annotation; neither is a C4 element. |
| One parent per child | At most one object per document claims a target (`P211`); the workspace pass behind the UI also reports a child claimed by a *different* file. |
| Missing / non-PDL / escaping targets | `P212` warning (relation and diagram stay usable), `P213` error for a non-`.pcd`, absolute, backslash or workspace-escaping path. A target that does not parse is `P212` at the UI, which refuses to navigate. |
| Cycles | `P216` from the document walk; the UI refuses to re-enter a file already in the trail and says so instead of opening it. |
| Unknown view id | `P218`. |
| Embedded source limits | `P217`: 64 KiB / 4096 lines per object, 256 KiB per document. Nothing is truncated or dropped silently. |
| Editing / undo | Both are ordinary document lines: setting, clearing or editing one is a single undoable command, and the trail re-resolves from the file after every edit, so undo/redo cannot leave breadcrumbs describing a relation that is gone. |
| Rename / move / delete | Renaming or moving a target rewrites every referring `drilldown` path in the same step (only that quoted path on that line; the rest of each file stays byte-identical). Deleting a target leaves the relation authored and reports `P212`, which the properties panel offers to re-point. |
| Export semantics | The relation draws no edge, so SVG/PNG and the CLI renderer are unaffected and an unsaved child never appears in a parent export. Mermaid has no decomposition concept: `drilldown` and `source` are named in the exporter's declared drop list (`docs/MERMAID-MATRIX.md`), and source is never drawn on the canvas. |
| Unsaved child edits | A drill-down is a normal file open: the existing diverged-code prompt governs the buffer, so a child with unapplied code asks before it is discarded — no second, parallel unsaved-changes rule. |

## Implementation

- **Format + IR (v10)**: `drilldown`/`source` on `Obj`, canonical print order after
  `size`/`z` and before the object's `style` block; `E116` rejects an empty source
  block (the printer would drop it and round-trip would break).
- **Parity**: the TypeScript engine (`engine/format`, `engine/model`) and the Go
  port (`internal/pdl`, `internal/ir`) landed together — parser, printer,
  validator, serializer and the shared `testdata/pdl-cases.json` fixture. Corpus
  seeds `c4-drilldown` and `sem-decomposition` plus regenerated goldens keep both
  engines byte-equal.
- **Engine rules**: `engine/model/hierarchy.ts` (TS) and `internal/pdl/hierarchy.go`
  (Go) share the path rules, the level table, the chain walk and the source limits;
  file reads are injected (`ImportSource.read` / `ReadSource.Read`), so validation
  stays IO-free and the CLI uses the filesystem.
- **Navigation**: `ui/drillTrail.ts` (pure trail/breadcrumb logic),
  `ui/useDrilldown.ts` (trail state, target resolution, the two document commits,
  the source-dialog state), `ui/hierarchyAudit.ts` (workspace-wide findings),
  `ui/DrillBar.tsx` (breadcrumbs, parent-context caption, findings, refusal notice).
  The subordinate diagram is drawn with a dashed parent boundary around the canvas
  area plus "Opened from Webshop · shop.pcd" — visually distinct from the dashed
  read-only ghosts *inside* a diagram.
- **Authoring and viewing**: the properties panel gained a *Decomposition* section
  (open the child diagram, set/clear path + view id) and an *Embedded source* action;
  `ui/SourceViewer.tsx` shows the text in a `<pre>`, edits it in a textarea, reports
  the limits and never executes or fetches anything.
- **Reference maintenance**: `workspace/rewriteRefs.ts` rewrites referring
  `drilldown` paths on rename/move, wired into `WorkspaceManager.renamePath` /
  `movePath`.

## Coexistence (the distinction the item insisted on)

| Mechanism | Owns | Renders as |
|---|---|---|
| `import` | another file's objects, reused read-only | dashed ghost objects with an "imported" badge |
| flow `goto` | a jump between flows | playback navigation with a return breadcrumb |
| `drilldown` | a subordinate diagram | no edge at all; breadcrumb trail + parent boundary |

None is presented as a substitute for another, and none of the three is drawn as a
link.

## Evidence (commands run, actual results)

```
$ npx vitest run
 Test Files  134 passed (134)
      Tests  1500 passed (1500)

$ npm test            # coverage thresholds
 Test Files  132 passed (132)
      Tests  1492 passed (1492)      # perf files excluded by config

$ npm run check
 tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .   → clean

$ go vet ./... && staticcheck ./...                      → VET_OK / STATIC_OK
$ gocyclo -over 15 cmd internal web                      → (no output)
$ go test -count=1 -race -cover ./...
 ok  cmd/panelcraft 3.120s   ok internal/corpus  ok internal/ir 84.0%
 ok  internal/pdl 76.0%      ok internal/server 91.8%

$ npm run test:perf
 Test Files  2 passed (2)      Tests  8 passed (8)

$ npm run build && npx playwright test
 199 passed (1.3m)        # includes e2e/item16-c4-drilldown.spec.ts (3 scenarios)

$ bash scripts/check-docs.sh
 check-docs: OK — 9 docs, all links resolve, .pcd blocks valid

$ bash scripts/check-selfcontained.sh web/dist
 check-selfcontained: OK — no external-origin resource loads in web/dist
```

Browser scenarios (`e2e/item16-c4-drilldown.spec.ts`):

1. **system → containers → components and back** — the trail shows
   `Back to shop.pcd › Webshop`, the canvas carries `data-parent="Webshop"`, the
   child renders its own objects, a second drill adds *Checkout API*, and clicking
   the root crumb truncates the trail instead of appending to it.
2. **embedded source** — the viewer shows `export function charge(…)`, editing and
   saving writes `const answer = 42;` and `"<script>alert(1)</script>"` into the
   document as text, no `<script>` element exists in the dialog and the canvas never
   draws the source.
3. **missing target** — the drill refuses, keeps the current diagram and reports
   `"…/containers/shop.pcd" is not in this workspace yet — create it first`, with no
   breadcrumb trail created.

Screenshots (light + dark, reviewed against `docs/STYLE-GUIDE.md`):
`test-results/screenshots/item16-drilldown-containers.png`,
`…-containers-dark.png`, `item16-source-viewer.png`. Review outcome: the breadcrumb
row and parent caption are legible in both themes, the dashed boundary is clearly
distinct from the ghost styling, the properties section keeps label/control
alignment, and the source dialog's `<pre>` scrolls inside its own box at narrow
widths. No clipping, contrast or focus-order defects were filed.

## Residual risks and limits

- A drill-down chain is followed 32 levels deep for cycle detection; a longer
  (pathological) chain simply stops being inspected rather than recursing forever.
- The workspace-wide duplicate-parent rule is computed on demand from the current
  workspace (all files parsed); on a very large workspace this cost is visible when
  the properties panel renders. Acceptable at current scale, and the per-file rules
  the CLI enforces are unaffected.
- Embedded source is text only: there is no syntax highlighting and no language
  validation (the label is free-form by design). Very long single lines scroll
  horizontally inside the viewer.
- A child diagram opened directly (not via the trail) starts a fresh trail — a
  reload cannot restore the ancestors, because the trail is session state and
  nothing backlink-shaped is written into the files. That is deliberate: a stored
  backlink could disagree with the parent.
