# Closed items — browser assessment round 3

**Bug entries removed:** the four sections “Selected flow step shows no
properties until the user scrolls”, “Spark count is an at-most spacing rule,
not an exact burst”, “Flow playback cannot choose click-driven or end-driven
advance”, and “Flow Steps delay input feels sluggish” in `bugs.md`.

## What was missing

A complete browser pass over the branch's fixes started with
`npx playwright test --workers=4 --reporter=line` — 227 chromium tests passed.
A Chrome DevTools session then seeded the presentation-metadata fixture and
found that clicking a step highlighted its card while the inspector stayed
below the fold, so the selected step's properties were not visible. The user
also reported that spark count behaved like an exact burst rather than an
at-most spacing rule, that flow playback had no click-driven versus
end-driven choice, and that delay edits felt sluggish. A Playwright probe of
twelve delay edits measured ~1.56 s with zero IndexedDB writes, locating the
cost in the synchronous edit path rather than autosave.

## Decisions

- Kept one inline inspector and one selection store. The inspector now sits
  directly under the flow metadata, before the step list, so a selected step's
  fields are on screen without moving the list under the user's pointer. The
  global Properties panel is unchanged.
- The delay input owns a local draft and commits one document edit after a
  120 ms quiet period or on blur. Autosave already debounces workspace churn
  and flushes content once written, so no extra periodic save timer was added.
- The authored spark number is a maximum. The pure beat timeline now accepts
  the measured connector length, caps the token count by a 28-unit spacing
  rule, and derives the start stagger from that distance. No two tokens start
  together; a bidirectional link still alternates endpoints and visibly
  travels between elements.
- Added an optional per-step `advance click | advance end` attribute. `end`
  remains the default; `click` replays the current beat until the presentation
  click advances. The change is atomic across TS and Go parser/printer/IR,
  format docs, parity fixtures and the corpus goldens. No new dependency,
  network call, remote asset or persisted UI-only state was added.

## RED evidence before the fixes

Command: `npx vitest run web/src/ui/flows/FlowPane.test.tsx
web/src/engine/anim/timeline.test.ts web/src/engine/format/flowAdvance.test.ts
web/src/engine/flows/plan.test.ts web/src/ui/flows/useFlowPlayer.test.tsx
--reporter=dot`

Result: **5 files failed, 7 tests failed, 118 passed (125)**. Failures covered
the missing inspector wrapper, per-keystroke delay writes, distance-capped
spark timing, the absent advance attribute and the missing cycling player path.

## GREEN evidence after the fixes

- `npm run check` — exit 0 (`tsc --noEmit`, service-worker `tsc`, `eslint .`).
- `npm test` — exit 0, **149 files, 1630 tests passed**; corpus and TS⇄Go parity
  fixtures regenerated with `CORPUS_FIXTURE=1 npx vitest run
  web/src/engine/format/parity.test.ts` and `node scripts/corpus-accept.mjs`.
- `npm run build` — exit 0; production bundle built from the changed source.
- `npx playwright test e2e/round3-browser-fixes.spec.ts --workers=2
  --reporter=line` — **3 passed**, covering inspector visibility in light and
  dark and a click-driven beat that stays on its step through two dwells and
  advances on the next click.
- `npx playwright test --workers=4 --reporter=line` — **230 passed**, including
  the complete flow-authoring, presentation-transport, spark-filmstrip,
  accessibility, offline and no-network browser suites.
- `go vet ./...` and `staticcheck ./...` — clean.
- `gocognit -over 15 .` and `gocyclo -over 12 .` — only pre-existing warnings
  in `node_modules/flatted`, parser/test helpers unrelated to these edits.
  The new Go message-modifier helper was extracted after `parseMsgStep`
  briefly exceeded the threshold, so the change adds no new warning.
- `go test ./...` — all packages ok, including corpus parity.
- `bash scripts/check-docs.sh` and `bash scripts/check-selfcontained.sh` — OK.
  `bash scripts/check-repo-clean.sh` was run after the commit.

## Screenshot evidence and vision review

Captured by `e2e/round3-browser-fixes.spec.ts` into `test-results/screenshots/`:

- `round3-inspector-light.png`, `round3-inspector-dark.png`
- `round3-click-advance.png`

Reviewed against the style guide's alignment, contrast and empty-state
checklist with the mental-model, proximity and visibility lenses. The selected
step's fields now appear above the list in both themes; the inspector no longer
covers step cards, and the step's own card remains visible and highlighted.
The first attempt used `scrollIntoView` on selection and broke step drag
reorder in Chromium because the list moved under the pointer; the final
captures show the fixed ordering with the list intact. A second attempt used a
sticky inspector overlay, which intercepted clicks on later steps; that was
also replaced before the final run. The click-driven capture shows the
presentation progressing only after the explicit advance click. Axe WCAG 2.1
AA reported no violations in the new browser checks. No external assets appear.

---
