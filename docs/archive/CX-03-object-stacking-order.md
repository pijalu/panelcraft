# CX-03: automatic and explicit object stacking order

**Completed:** 2026-11-14

**Scope:** a persisted per-object stacking order with Auto as the default, stable document-order ties, and one projection shared by paint order, hit-testing, the mini-map, exports and the CLI.

## Implemented behaviour

- Objects accept an optional integer `z`. Absent means **Auto**, which is treated as
  effective `z 0` while keeping document order.
- The projection is a stable sort on `(z ?? 0, document index)`. An all-Auto document
  returns the original array object, so existing behaviour is byte-identical: negative
  values sink below Auto objects, positive values rise above them, and equal values keep
  document order, including ties between explicit and Auto objects.
- Only the render/hit-test/mini-map projection is sorted. Document arrays stay in
  document order, so printing, formatting and diffs remain stable.
- Links keep their own lower layer; `z` is object-only. Groups follow the same rule, and
  their boundary rectangle moves with them without rewriting containment.
- Hit-testing walks the reversed stacked projection, so the top painted object is the
  selected one, including for negative values.
- The mini-map uses the same projection for both its overview drawing and its
  index-to-object mapping, so navigation targets the object actually drawn there.
- Canvas, mini-map, SVG export, PNG export and `panelcraft render` use the same committed
  order.
- Properties → Advanced → **Stacking order** takes a whole number or a blank field. A
  blank field clears the value back to Auto, non-integers are ignored instead of being
  coerced, and every accepted change is a normal undoable controller edit that survives
  code edits, canvas edits, reload, import and export.
- Mermaid export declares `object stacking order` as dropped data.

## Format and compatibility

- PDL object blocks accept `z <int>`. Non-integers outside the safe integer range are a
  syntax error, duplicate `z` is a duplicate-attribute error.
- IR version is **6** with optional `Obj.z`. TypeScript and Go parse, print, serialize and
  merge the field consistently, and explicit `z 0` survives round-trips while Auto is
  never printed.
- New corpus seed: `testdata/corpus/stacking-order/` (Auto, explicit zero, negative,
  positive, a positive tie, a stacked group, a flow reference and a saved view with
  overlapping positions). Canonical, IR, diagnostics and export goldens were regenerated
  with the repository generators, never hand-edited; `testdata/pdl-cases.json` and
  `testdata/ir-fixture.json` were regenerated the same way.

## Executed plan and debugging record

1. **RED, model/render:** new `stacking.test.ts`, `scenegraph.test.ts`, `hit-test.test.ts`
   and `CanvasController.test.ts` cases failed because there was no stacking module, the
   renderer used document order, and `z` reached the IR only as a raw attribute. Added the
   stable projection and wired render, hit-test and mini-map to it.
2. **RED, format:** `format/stacking.test.ts` failed on IR version 5, missing printer
   output and the workspace round-trip. Added the typed field, parser/printer support,
   duplicate detection, serializer, merge and workspace projections in both languages.
3. **RED, UI:** the properties test failed because no control existed. Added the
   accessible number field; the test then failed only on its own `getAttribute('value')`
   assumption, because Preact drives the controlled property — the assertion now reads the
   real observable (`input.value`) plus placeholder and step.
4. **Lint complexity:** the printer's object-attribute helper reached complexity 13. Split
   explicit geometry (`size`/`z`) into `geometryLines`; no lint exception was added.
5. **Corpus regeneration:** regenerating the TS goldens moved every fixture to IR v6, and
   the Go parity fixture (`testdata/pdl-cases.json`) had to be regenerated from the TS
   reference as documented, which restored `go test ./...`.
6. **E2E journey fixes (all test-side except where noted):** the view selector had to be
   set to the saved view before overlapping positions exist; selection was asserted
   through the identity field because `prop-id` lives in the collapsed Advanced section;
   `z` was edited on the selected object (a deliberate click on a point only the negative
   object covers); paint order after reload needed a polled assertion because the first
   frame renders before the code-sync pass; clearing `z 9` correctly returns the object to
   Auto at document order rather than to its previous `-2`, and the expectation was fixed.
   The SVG assertion now matches object groups only, because the selection overlay repeats
   `data-id` on its resize handles.

## Focused and common validation

Executed from the repository root after the final implementation and documentation changes:

- `npx vitest run web/src/engine/render/stacking.test.ts web/src/engine/format/stacking.test.ts web/src/engine/render/scenegraph.test.ts web/src/engine/render/hit-test.test.ts web/src/ui/CanvasController.test.ts web/src/ui/PropertiesPanel.test.tsx` — **6 files, 106 tests passed**.
- `npm run check` — TypeScript and ESLint passed.
- `npm test` — **97 files, 1019 tests passed**; coverage thresholds passed.
- `npm run build` — production bundle rebuilt before E2E and CLI rendering.
- `npx playwright test e2e/cx03-stacking.spec.ts` — **2 tests passed** (light and dark journeys).
- `go test ./...` — all packages passed, including the TS⇄Go parity replay over IR v6.
- `go vet ./...`, `staticcheck ./...`, `gocognit -over 15 .`, `gocyclo -over 12 .`, `gocyclo -over 15 cmd internal web` — see the final gate list in the commit; the mandatory complexity gate passed.
- `bash scripts/check-docs.sh` — links and PCD fences valid.
- `bash scripts/check-selfcontained.sh web/dist` — passed; no external runtime assets.
- `git diff --check` — passed.

## Real CLI inspection

Built the actual binary with `go build -o /tmp/panelcraft ./cmd/panelcraft`, then:

- `/tmp/panelcraft validate testdata/corpus/stacking-order` — `2 files checked, 0 errors, 0 warnings, 0 infos`.
- `/tmp/panelcraft convert testdata/corpus/stacking-order/canonical.pcd -o /tmp/stack2.pcd` — output identical to the canonical seed (round-trip preserves Auto omission, `z 0` and negative values).
- `/tmp/panelcraft render testdata/corpus/stacking-order/canonical.pcd --out /tmp/stack.svg` — object ids appear in exactly the expected order: `back`, `auto`, `zero`, `tray`, `front`, `tie`.
- `/tmp/panelcraft render ... --view Stack --out /tmp/stack-view.png --theme dark` — 1200×687 PNG, visually inspected: `Back` (z -2) at the bottom, `Auto` and `Zero` (Auto/0) next, the `Tray` boundary above them (z 1), then `Front` and the later document-order tie `Tie` (z 4) on top.

## Accessibility and visual review

- Playwright journeys run axe WCAG 2.1 A/AA scans on the stacked canvas in both themes and
  attach the shell's accessibility tree; no violations were reported.
- Reviewed `test-results/screenshots/cx03-stacking-{auto-negative-positive-tied,explicit-edited,restored-auto}-{light,dark}.png` (6 captures) plus the CLI dark PNG.
- In both themes the stacked frames stay legible: labels of covered objects are visibly
  clipped by the object above, the top object keeps a clear contrast edge, the properties
  **Stacking order** field shows its current value with the `Auto` placeholder visible when
  cleared, and the mini-map matches the canvas order.
- No remaining contrast, clipping, overflow or empty-state defect was found.

## Deliberate limitations

- Selection of a fully covered object remains impossible by direct click (that is the point
  of stacking); it is reachable from the canvas `Tab` order and the file.
- `z` has no context-menu commands. The user guide's existing "bring to front" wording and
  the missing commands are tracked separately by DOC-01.
- A link whose endpoint is a `group` makes auto-layout crash (`Cannot set properties of
  undefined (setting 'rank')`). This predates CX-03 — it reproduces with every `z` removed —
  and is recorded as a new backlog item rather than fixed here.
