# Archived bugs — UX-08 WP14/WP15 review (2026-11-15)

Found while critically reviewing the shipped UX-08 work (Markdown flow
documentation, flow editor cards, Steps header) and executed as the fix plan
recorded in `bugs.md`. Every item was reproduced first (RED), fixed, then
validated with the commands quoted below.

## BUG-01 — Process step cards hid the step text and printed the shape twice

**Cause.** `stepTitle()` and `stepSummary()` in `web/src/ui/flows/FlowPane.tsx`
both returned `nameOf(names, step.target)` for `process`, so
`process c "settles"` rendered as `API "core"` above `API "core"` and the
authored text never appeared in the editor.

**Fix.** Title is `step.text ?? nameOf(target)`; the summary keeps the shape
name, mirroring message cards. Cards now expose `step-title-<n>`.

**Evidence.** RED: `npx vitest run web/src/ui/flows/FlowPane.test.tsx -t "process text"`
→ `TestingLibraryElementError: Unable to find an element by: [data-testid="step-title-0"]`.
Green: 39/39 in that file, 155 e2e, and the light/dark screenshots now read
"settles" over "API core".

## BUG-02 — Formatter could be made to inject headings and list items

**Cause.** Text, labels, descriptions and titles were escaped but never
line-normalised, so a `Doc` carrying `line one\n# heading injection\n1. list injection`
produced a real heading and a fake numbered item.

**Reachability.** Not reachable from `.pcd`: `scanString` rejects raw newlines and
unknown escapes. Reachable from importers and hand-built documents, so this was
hardening with a real failure mode (structure corruption of a document meant for
review).

**Fix.** `prose()` collapses whitespace runs to one space before escaping and is
applied to every user string. Goldens stayed byte-identical.

## BUG-03 — A blank flow title rendered an empty heading

**Cause.** `titleOf()` used `flow.title ?? flow.id`, so `flow "" as f` produced
`"# \n"`. **Fix.** A title that is blank after trimming is treated as absent; the
id, then `Flow <n>`, is used instead.

## BUG-04 — `goto` with an empty file part printed a dangling `#`

**Cause.** `gotoText()` prefixed `#` whenever `file !== undefined`; `parseGoto`
accepts `goto "#local"`, whose file part is `''`, so the outline showed
`**Go to** — #local`. **Fix.** Only a non-empty file is prefixed.

## BUG-05 — Unresolved references printed their token twice

**Cause.** `ref()` fell back to the id as the display name *and* printed the id in
backticks: `ghost `ghost` (not in this diagram)`.
**Fix.** An unresolved id prints as `` `ghost` (not in this diagram) `` — the id
once plus the marker. The existing test was tightened to the new shape (same
information, no duplicate token; a format refinement, not a weakened assertion).

**Evidence for BUG-02…05.** RED:
`npx vitest run web/src/engine/format/flowMarkdown.test.ts` failed on all four
(`expected '# Line one\n# injected heading…' not to match /^# injected/m`,
`expected '#    \n\n1. **Info** — one\n' to be '# blank…'`,
`expected … to contain '2. **Go to** — local'`,
`expected … to contain '`ghost` (not in this diagram) → …'`).
Green: 14/14 in that file with both goldens unchanged, 689 tests in
`web/src/ui web/src/engine/format`, 1304 in the full suite, `npm run check` clean.

## BUG-06 — Steps header wrapped, orphaning its label above the action row

**Cause.** Three actions plus the `STEPS` label needed 226 px inside a 222 px row
(230 px head, 4 px padding, 4 px label margins each side, 8 px gap), so the header
was 70 px tall and the last button was cut off in the narrow panel. Compacting the
buttons alone left it at 57.5 px; the extra width came from a stray `{' '}`
inside the two export buttons (an extra inline-flex item) and the long
`.seq.mmd` label. Flexbox breaks lines on hypothetical sizes, so allowing the
label to shrink could not prevent the wrap.

**Fix.** Compact action buttons (11 px, `inline-flex`, `nowrap`), the stray space
removed, and the sequence action labelled `.seq` (the download is still
`.seq.mmd`, and `docs/USER-GUIDE.md` says so). The e2e measures the header
(`≤30 px`) in both themes instead of relying on visual inspection.

**Evidence.** RED: `Error: steps header wraps (70px tall)`, later `(57.5px tall)`.
Green: 4/4 in `e2e/ux08-flow-documentation.spec.ts`; screenshots
`ux08-documentation-actions-{light,dark}.png` re-shot and reviewed — label and
three actions share one row, nothing clipped, readable in both themes.

## BUG-07 — A truncated flow name had no tooltip

**Cause.** The list button truncated long titles with no `title` attribute.
**Fix.** `title={f.title ?? f.id}`.
**Evidence.** RED: `expected null to be 'Main'`. Green: `npx vitest run
web/src/ui/flows/FlowPane.test.tsx` 39/39.

## Gate evidence after all fixes

- `npm run check` — silent (tsc ×2 + eslint).
- `npx vitest run` — 119 files / 1304 tests passed.
- `npm run build` — ✓ built.
- `npx playwright test` — 155 passed (1.1 m).
- `go vet ./...`, `staticcheck ./...` — clean.
- `gocognit -over 15 cmd internal web` / `gocyclo -over 12 cmd internal web` —
  report pre-existing offenders only (17–20 in `internal/pdl` Mermaid converters
  and `_test.go` files); no Go file was touched by these fixes, and the CI gate
  (`gocyclo -over 15`) stays green.
- `go test -count=1 -race -cover ./...` — ok (ir 85.7 %, server 91.8 %, pdl 72.8 %,
  cmd 65.5 %; `internal/render` and `web` are exercised by e2e only).
- `bash scripts/check-docs.sh` — OK.
