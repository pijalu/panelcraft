# Closed item: decomposition picker, complete embedded export and embedded editing

**Bug entry removed:** “Decomposition picker, complete embedded export and
embedded editing” in `bugs.md`.

## What was wrong

The decomposition target was a free-text path. `.pcd` export downloaded only the
root file, and `source { … }` embedded program text rather than a child diagram.
There was no document identity for a child inside a root file, so an embedded
child could not use the ordinary canvas/code/properties/flow editor or share the
root's single writer.

## Decisions

- IR v12 makes the decomposition target discriminated: `{ kind: 'linked', path }`
  or `{ kind: 'embedded', path, doc }`. A linked path keeps the legacy PDL spelling
  (`drilldown "path.pcd"`); the embedded form adds a recursive document block.
  The two are never an optional path/document pair.
- A logical path is workspace-relative POSIX, resolved from the declaring
  document's logical path. Embedded nesting is limited to 8 levels, 64 children
  and 256 KiB of nested document text. Invalid shapes, levels, duplicate owners,
  cycles and unreadable descendants get distinct diagnostics (`P213`, `P214`,
  `P219`, `P220`, `P218`, `P222`).
- An embedded child's identity is its root file plus the owner/path chain
  (`DocumentRef`). It is projected into the explorer from the parsed root; no
  fake VFS file is created. One edit rewrites the nested document in the root and
  prints one canonical root write.
- Export owns graph traversal in a pure `WorkspaceReader` planner. The dialog
  only calls the planner and downloads a successful plan; a changed root
  invalidates the captured choice.

## Red evidence before the fix

- `npx vitest run web/src/engine/format/embedded.test.ts` — **5 failed**: the
  parser did not know `drilldown embedded`, the printer could not round-trip a
  nested document and the IR had no discriminant.
- `go test ./internal/pdl -run TestEmbeddedDecomposition -count=1` — **build
  failed**: `*ir.Drilldown has no field or method Kind/Doc`, proving Go parity was
  missing too.
- `npx vitest run web/src/workspace/embed.test.ts` — **failed**: `Cannot find
  module './embed'`; `npx vitest run web/src/workspace/documents.test.ts` —
  **failed**: `Cannot find module './documents'`.
- `npx playwright test e2e/embedded-decomposition.spec.ts` — first run **2
  failed**: the properties control was still an input and the derived explorer
  row did not exist. Later runs caught an unsafe modal theme click and a
  fixture path that resolved to `containers/components/api.pcd`; both were fixed
  in the test/planner path, not by weakening assertions.

Representative all-or-nothing diagnostic observed while correcting the export
fixture:

```text
P212: decomposition child not found: "containers/components/api.pcd" (complete export needs every child file)
```

No partial file was downloaded when that diagnostic appeared.

## Green evidence after the fix

- `npm run check` — exit 0 (tsc, service-worker tsc, eslint and complexity gates).
- `npx vitest run` — **1559 passed** in 144 files.
- `npm test` — **1551 passed** in 142 files with coverage thresholds green
  (`src/workspace/embed.ts` 80.43% statements, `documents.ts` 79.45%; package
  gate is ≥80% where enforced).
- `go test ./...` — all packages ok; `go vet ./...`, `staticcheck ./...`,
  `gocyclo -over 15 cmd internal web && echo OK` — clean, `CYCLO_OK`.
- `node scripts/corpus-accept.mjs` — **101 passed**; fixtures regenerated with
  `CORPUS_FIXTURE=1 npx vitest run web/src/engine/format/parity.test.ts
  web/src/engine/model/model.test.ts`; `go test ./internal/corpus` ok (TS⇄Go
  parity including `decomposition-embedded` and `sem-embedded`).
- `npm run build` — static bundle built offline from the committed lockfile.
- `npx playwright test e2e/embedded-decomposition.spec.ts` — **2 passed**;
  `npx playwright test e2e/item16-c4-drilldown.spec.ts
  e2e/embedded-decomposition.spec.ts` — **5 passed** (no drill-down regression).
- `npm run e2e -- --reporter=line` — **210 passed**, including S7's
  external-request-blocked runtime proof and the new export/re-import journey.
- `bash scripts/check-docs.sh` — OK; `bash scripts/check-repo-clean.sh` — OK.

## Export plan example

For the seeded `root.pcd → containers/shop.pcd → components/api.pcd` graph the
download text contains, in deterministic depth-first order:

```text
drilldown embedded "containers/shop.pcd" {
  ...
  drilldown embedded "components/api.pcd" {
    ...
  }
}
```

The downloaded file was imported into a fresh workspace with no child files and
the derived tree showed both embedded descendants.

## Screenshot review (Laws of UX / style guide)

Captured by the new e2e spec into `test-results/screenshots/`:

- `embedded-export-choice-light.png`, `embedded-export-choice-dark.png`
- `embedded-tree-child-light.png`, `embedded-tree-child-dark.png`

Reviewed against `docs/STYLE-GUIDE.md`: the export dialog is centred, uses the
same surface/button/radius tokens in both themes, keeps the safe “Keep linked”
choice focused, and explains both options in text. The tree rows use the existing
spacing and selected-row treatment; the active root and active embedded child are
both marked, and the embedded child is additionally distinguished by its nested
presentation and disclosure control. Axe (`wcag2a`, `wcag2aa`) reported zero
violations for the re-imported workspace. One defect found and fixed during the
review: the disclosure button was nested inside the label button, producing
axe's `nested-interactive` violation; it is now a sibling with its own
accessible name. No external assets or network calls were added.
