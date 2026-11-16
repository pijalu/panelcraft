<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed item: built-in and project-defined portable icons

Source: `bugs.md`, queued item 15. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §11.
Format decision: `docs/adr/0006-document-scoped-icons.md`. Asset record:
`docs/ICONS.md`.

## Observed behaviour

An object could select one of eight built-in icons (`cloud`, `database`, `gear`,
`lock`, `mail`, `user`, `chart`, `code`) through `icon name` or
`style { icon … }`. There was no way to give a diagram its own glyph, no handle
namespace to reference one by, and the properties panel accepted a bare string
in a text box — a name that drew nothing was accepted silently.

For a tool whose whole promise is "the `.pcd` is the diagram", that is the wrong
shape: a team's own logo or an internal glyph exists in every one of their
diagrams, and mailing a file (or rendering it with the CLI) has to reproduce what
the author saw.

## What the format does now

```
pcd 1.0

icon brand {
  label "Company mark"
  media "image/svg+xml"
  data "PHN2ZyB4bWxucz0i…"
}

system shop "Webshop" {
  icon brand
}
```

A document-scoped declaration with an explicit media type and a canonical Base64
payload, referenced by the existing `icon name` property. The grammar (FILE-FORMAT
§3.1) fixes the rules that needed deciding:

- **Handles** are PDL identifiers, and the **built-in namespace is reserved**
  (`P207`): `icon cloud` cannot mean one picture in one file and another picture
  in the next. Duplicates inside a file are `P206`.
- **Payload syntax** is `E114` (not canonical Base64) and `E115` (a media type
  this version cannot draw). Both abort the file: a declaration that cannot be
  decoded would re-print as something the app refuses to open.
- **Limits** are `P208` — 64 KiB decoded per icon, 256 KiB and 64 declarations per
  document.
- **Safety** is `P209`: the SVG passes an element/attribute allowlist (no
  `<script>`, event handlers, `<foreignObject>`, `<style>`, embedded `<image>`,
  external `href`, `url()`/`@import`/`javascript:`). Anything else is reported,
  never drawn.
- **Resolution** is one namespace: built-ins plus this file's declarations.
  An unresolvable name is `P210` (warning) and the object draws without an icon —
  no silent substitution, and the auto-fit layout reserves no band for a glyph
  that will not appear.
- **Printing** is deterministic: `label`, `media`, `data` in that order, payload
  untouched (it is already canonical), declarations after imports and before
  objects. `parse → print → parse` is byte-stable and Go produces the same IR.

## Implementation

`web/src/engine/format/iconSvg.ts` — the shared rule table: canonical-Base64
check, media-type allowlist, limits, and a **lexical** SVG classifier over the
tag/attribute grammar. Lexical rather than DOM-based because the same verdict has
to be reachable from the Go CLI without a new dependency (ADR-0004); the tables
are the same, and one fixture keeps them honest.

`web/src/engine/model/icons.ts`, `web/src/engine/render/icons.ts`,
`web/assets/icons/*.svg` — the built-in set grew from 8 to 43 vendor-neutral
technical glyphs across compute, storage, network, security, clients, platform,
ops, data and concept categories, each an original in-repo work (GPL-3.0-only).
The registry carries the picker label, category and search keywords; the drawn
module carries the path geometry; a sync test fails if the two (or the `.svg`
sources) ever disagree, and another asserts the TypeScript and Go name sets match.

`web/src/engine/model/iconOps.ts` — add/replace/rename/remove as pure `Doc → Doc`
transitions with usage counting. Rename rewrites `obj.icon`, `obj.style.icon` and
top-level `style … { icon … }` together; remove reports usages and clears them
only on explicit confirmation.

`web/src/workspace/iconIngest.ts` — the import/paste path: parse, drop everything
outside the allowlist, re-serialize from the surviving nodes, re-check, and only
then store canonical Base64. Reconstruction (not text filtering) means hostile
content inside an attribute value cannot be re-read as markup.

`web/src/engine/render/iconAssets.ts`, `shapes.ts`, `measure.ts` — a drawable
project icon becomes an `<image>` whose `href` is a `data:` URI of its own bytes:
local, never fetched, and rendered by the browser in static mode. The icon keeps
the shared top-centre band, so label geometry from the earlier centring work is
unchanged and a project icon reserves exactly the same space as a built-in.

`web/src/ui/IconPicker.tsx`, `PropertiesPanel.tsx`, `App.tsx`,
`CanvasController.ts` — a searchable picker (built-ins by label/category/keyword
plus this file's icons with previews, and an honest "cannot be drawn" marker when
a stored payload fails the check), and a manager dialog for add/import/paste/
replace/rename/remove. Every icon edit is committed through one document write and
pushed as a single `DocChange` history entry, so undoing a rename restores all of
its references in one step.

`internal/ir/ir.go`, `internal/ir/svg.go`, `internal/ir/icons.go`,
`internal/pdl/{parser,printer,validation,diagnostics}.go` — the Go mirror: IR v9,
the same code table, the same messages, the same allowlist.

## Mermaid export

Icons were already a declared drop for built-ins; the drop now also triggers when
the document declares icons of its own or uses `style { icon … }`, so a custom
icon is reported lost rather than vanishing quietly (SPEC FR-M4).

## Verification

- `npm run check` — `tsc --noEmit` clean, eslint complexity ≤12.
- `npm test` — 1442 tests green across 127 files (87.96% lines, coverage gate on
  `engine/**` and `workspace/**` satisfied). New suites: `iconOps.test.ts` (namespace rules, atomic rename,
  usage-checked removal, dropped empty style blocks), `iconIngest.test.ts`
  (scripts, handlers, external refs, `foreignObject`, `<style>`, CSS URLs and
  spans removed; fragment links and gradients kept; not-SVG/empty/unclosed
  refused; idempotent re-ingest), `iconAssets.test.ts` (asset resolution, unsafe
  payload refused, `<image>` data URI, no fetch, auto-fit parity with a built-in),
  `iconParity.test.ts` (the shared fixture), `IconPicker.test.tsx` (search by
  keyword/handle, pick/clear, built-in vs file icons, add sanitizes a pasted
  payload, unsafe paste refused, rename in one commit, remove asks then clears,
  unused icon removes without asking), `icons.test.ts` (asset ↔ module ↔ registry
  sync).
- `node scripts/corpus-accept.mjs` regenerated the corpus; `go test ./...` replays
  it byte for byte, including three new seeds (`icons-project`,
  `sem-icon-unsafe`, `sem-icon-collision`) and `testdata/icon-cases.json` for the
  classifier.
- `bash scripts/check-docs.sh` — links resolve and every ```pcd fence parses.
- `npx playwright test` — 196 tests green in three shards, including the new
  `item15-project-icons.spec.ts` (a declared icon draws from the file's own bytes
  with no network, the picker searches by meaning, renaming a handle rewrites
  every reference in one undo step, unsafe pasted markup is refused with a
  reason). Screenshots reviewed for the canvas, the picker and the manager.

## Defects found in review (fixed here)

- **A picked icon did not repaint the canvas.** The controller kept a copy of the
  payload on the object, so after choosing a different icon the code view said
  `icon queue` while the canvas still drew the old project glyph; and the scene's
  structural key ignored the icon, so a rename took the move-only patch path.
  The payload is now resolved by the object's *current* name from a per-document
  registry, and the key includes the icon name plus a content hash
  (`CanvasController.icons.test.ts`).
- **The shell republished icon payloads on every render.** `iconAssetsOf` builds a
  fresh Map, so the publish effect re-ran, repainted, re-rendered and looped — the
  App-level tests hung instead of failing. The payload map is now memoised on the
  parsed document and publishing equal content is a no-op
  (`sameIconAssets`, covered in both suites).
- **Two built-in glyphs read wrong at canvas size.** `user` rendered as a bare
  crescent (malformed arc) and `queue` as three dots in the upper corner; both are
  redrawn to fill the 24-box and verified at 22 px, the size the canvas draws.
- The properties panel showed `(none)` while an icon *was* drawn, because it read
  only the style override; it now shows what is rendered and writes to the
  object's own `icon` field, clearing a stale override in the same patch.
- The native file input in the manager was truncated to `N…en`; it is a styled
  label over a hidden input now.

## Known limits (recorded, not hidden)

- Only `image/svg+xml` is accepted. Raster payloads were considered and deferred:
  they need a decoder on both sides and would grow the parity surface for little
  gain over vector sources (ADR-0006).
- The allowlist refuses `<filter>`, `<pattern>`, `<marker>` and animation: an icon
  is a static mark, and those are the constructs that carry the active-content
  risk. A real-world asset that needs them is simplified by the ingest path, which
  drops them, or refused with a diagnostic.
- A payload that fails the check is drawn as nothing, with the reason on a
  validation diagnostic and in the picker. It is not replaced by a placeholder
  glyph: a wrong picture is worse than an absent one.
- Project icons keep their authored colours (they are the author's asset); the
  built-in set follows `currentColor` and therefore the theme.
