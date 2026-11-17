<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: critical assessment of the second bug round

**Scope:** every item the branch `feat/bugs-round-2` claims to have fixed — the
twelve items of [`../BUGS-RESOLUTION-PLAN-ROUND-2.md`](../BUGS-RESOLUTION-PLAN-ROUND-2.md)
and the four of [`../BUGS-RESOLUTION-PLAN-ROUND-3.md`](../BUGS-RESOLUTION-PLAN-ROUND-3.md).
Each claim was re-checked against the code and its regression, and the whole
suite was re-run on the branch head.

Two defects were found and fixed. Everything else held up; the clean results are
listed at the end so the next round knows what was actually inspected.

## 1. Presentation filmstrip e2e was load-dependent

**Observed.** A full run of the browser suite failed one scenario:

```
npx playwright test --workers=4 --reporter=line      # 229 passed, 1 failed
  1) e2e/bug15-spark-beat-timeline.spec.ts:122:3 › one beat timeline: WAAPI filmstrip (light)
     Error: one source border
     expect(received).toBeGreaterThan(expected)
     Expected: > 0.5
     Received:   0
```

It passed alone (`--workers=1` → 2 passed), so the claim in the round-2 archive
("2 passed", "full suite 201 passed") was true for the machine it ran on and
false in general.

**Root cause.** The spec let the beat run for a fixed `MOTION.cameraMs + 80`
before parking the transport, and only then rewound the layer animations with
`Element.getAnimations()`. A finished animation with `fill: none` no longer
affects its element, so Chromium drops it from `getAnimations()`. The rings
start invisible in CSS and rely on their animation to become visible, so once
the source pulse had finished, `seek()` silently skipped it and the sampled
opacity stayed at the invisible base value — exactly the `0` above. The ring
pulse lasts about 450 ms and the fixed wait was about 380 ms, so the outcome
depended on how quickly the pause click landed: a race, not a product defect.

A diagnostic probe run at four workers reproduced it and showed the difference
directly: the failing sample had `source-pulse` with **zero** animations
(`touched: 4` instead of `5`), while every passing sample still had one.

**Fix.** Pause the layer inside the same task that first observes the spark
(`freezeLayer`), so every pulse is frozen before it can finish and stays
rewindable; read the live `playState`/`currentTime` before pausing, so the
existing assertions keep their meaning. The camera glide is applied by its own
clock timer rather than the transport, so the spec now lets that timer land and
then drops the finished glide (`cancelCamera`) instead of hoping a fixed sleep
was long enough. No assertion was relaxed: the sampled opacities, the painted
token box, the travel-direction checks and the parallel-lane count are all
unchanged.

**Validation.** The load that produced the failure now passes repeatably:

```
npx playwright test e2e/bug15-spark-beat-timeline.spec.ts --workers=4 --repeat-each=3
→ 6 passed (11.8s)   # three consecutive runs: 6 passed each time (18/18)
```

Before the fix the same command failed 2 of 6.

## 2. The delay field wrote the settled value twice

**Observed.** The round-3 archive states the delay input "commits one document
edit when the value settles (`change`/blur), not on every `input`". The field
writes on both the quiet period and on blur, and nothing stopped the blur from
repeating a value the timer had already committed. Measured through the pane's
own `onChangeText`:

```
PROBE afterTimer=1 afterTimerAndBlur=2      # type "1500", wait, leave the field
PROBE afterBlur=3   afterBlurAndTimer=3     # type "2500", leave, wait
```

so an edit followed by leaving the field produced two writes, and merely
focusing and leaving the field produced one.

**Impact.** Bounded: the code-sync machine ignores a write whose text equals the
current buffer (`textChanged` echo suppression), so the document, the undo stack
and storage saw no duplicate. The defect is at the pane boundary — the single
"one settled edit is one write" contract the plan promises — and it would become
user-visible the moment that suppression changed or a different consumer
subscribed to `onChangeText`.

**Fix.** The field remembers the value the document already holds, in the
input's own spelling, and refuses to write it again: the quiet period and the
blur can no longer both commit, and leaving an untouched field writes nothing.
`web/src/ui/flows/FlowPane.tsx`, `DelayField`.

**Regression.** Two component tests, both RED before the fix and green after:

```
npx vitest run web/src/ui/flows/FlowPane.test.tsx -t "delay"
× writes the settled delay once, not again when the field is left
  → expected [ …(2) ] to have a length of 1 but got 2
× leaving the delay field untouched writes nothing
  → expected [ Array(1) ] to have a length of +0 but got 1
→ after the fix: 63 passed
```

The round-3 plan also promised a browser probe for this item that was never
written, so `e2e/round3-browser-fixes.spec.ts` gains one: a typed delay reaches
the code view only after the quiet period, and one undo reverts the whole edit
with the field cleared. That test guards the user-visible contract; it does not
discriminate the duplicate write on its own, because the surviving write is
echo-suppressed upstream — the component test is the discriminator.

## 3. The branch left the identifier-clarity gate red

**Observed.** `bash scripts/check-jargon.sh origin/main` — the gate CI runs in
its "docs links + identifier clarity" step — exited 1 with thirteen offending
lines added by the branch:

```
b/docs/FILE-FORMAT.md: +**Dropped (declared, per SPEC FR-M4):** …
b/e2e/p1-geometry.spec.ts: +test('F-14: Reset diagram layout reorganises, …
b/e2e/s5-views.spec.ts: +test('S5: top-level hide tag fades … (FR-V1)', …
b/e2e/s5-views.spec.ts: +test('S5: Reset diagram layout is deterministic …(FR-V3/V4)', …
b/internal/pdl/parser.go: +// stepDelay consumes … (F-18).
b/web/src/engine/anim/illustrations.test.ts: + … // FR-F4 preserved
b/web/src/engine/layout/apply.test.ts: +// writePositions tests (M6-WP3, ADR 0007): …
b/web/src/engine/layout/apply.ts: +// "Apply layout to file" (M6-WP3, FILE-FORMAT §7.2, ADR 0007) …
b/web/src/engine/render/router.ts: +   * Explicit user waypoints (F-19). …
b/web/src/ui/layoutDoc.test.ts: +// document hide/pin mutations, and fade computation (FR-V1).
b/web/src/ui/layoutDoc.test.ts: +describe('fadeSets (FR-V1)', () => {
b/web/src/ui/layoutDoc.ts: + * Fade sets (FR-V1): an element fades …
b/web/src/ui/useWorkspace.ts: + * F-14: persist drag/resize geometry …
```

Each item's own archive lists a green run of the code and test gates, but this
docs step was not part of those lists, so the branch would have failed CI.

**Fix.** The meaning now carries the sentence and the tag is gone: a comment, a
test title or a doc line no longer relies on a reader who has memorised the
plan. For example `test('F-14: Reset diagram layout …')` became `test('Reset
diagram layout reorganises, undo restores and stays one command')`, and
`// FR-F4 preserved` became `// dimmed nodes stay dimmed`. No behaviour, no test
assertion and no spec meaning changed.

**Validation.**

```
bash scripts/check-jargon.sh origin/main
→ OK — no opaque identifier-only references added since origin/main
bash scripts/check-docs.sh → OK — 9 docs, all links resolve, .pcd blocks valid
```

## Checked and found correct

Re-verified on the branch head, not taken on trust:

- Static and unit gates: `npm run check` (TypeScript, service-worker TypeScript,
  ESLint), `staticcheck ./...`, `go vet ./...`, `npx vitest run` — 151 files,
  1638 tests — and `go test -count=1 -race -cover ./...`, all green.
- Documentation and self-containment: `bash scripts/check-docs.sh` (`OK — 9
  docs`), `bash scripts/check-selfcontained.sh` (no external-origin loads).
- Corpus freshness: `node scripts/corpus-accept.mjs` regenerated every fixture
  with 109 tests and left the worktree clean — the committed goldens are current.
- Complexity did not regress: `gocognit -over 15 .` and `gocyclo -over 12 .` on
  the branch report the same pre-existing helpers as `origin/main`, and the new
  Go message-modifier helper removed one warning (`parseMsgStep`) rather than
  adding any.
- TypeScript⇄Go canonical output for the new syntax: hand-written adversarial
  inputs (`advance click delay 500` in the wrong order, a bogus
  `advance sometimes`, a doubled modifier, escapes and braces inside a
  `text "…"` line, unquoted `hide tag`) produce identical diagnostics and
  identical canonical text in both engines.
- `advance` reaches every beat kind (plain, branch, parallel lane) and every
  advance surface leaves a click-driven cycle: the canvas button calls the new
  runner `next()`, while keyboard and transport stepping call `stepTo`, which
  cancels the cycle timer before parking.
- Spark cap: both `beatTimeline` call sites pass the measured connector length,
  so the distance ceiling cannot be bypassed by a caller that forgets it.
- Markdown notes URL policy: `javascript:`, `data:`, other unknown schemes,
  protocol-relative targets, backslash paths, control characters and internal
  spaces are all rejected; uppercase schemes are lower-cased before the check.
- Deep step lists: the selected step's inspector stays on screen for a step deep
  in a 30-step list at a 560 px viewport, because the inspector sits above the
  step list's own scroll container. No scroll-back is needed and no defect was
  filed.
- Tests were not weakened to reach green: the assertions removed in the diff
  belong to the deleted named-view feature and to the replaced token/badge
  plumbing, and each replacement is at least as strict (token role and keyframe
  end opacity, `beatTimeline`-derived durations, badge geometry per digit count).
