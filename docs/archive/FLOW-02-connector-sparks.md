# FLOW-02: configurable connector sparks

**Completed:** 2026-11-14

**Scope:** a connector can carry playback intensity — spark count and speed — without changing
flow timing, step dwell or validation. Missing values reproduce the old behaviour exactly.

## Format

- Link style blocks accept two optional keys:
  - `sparks <int>` — 1..8; non-integers and out-of-range values are syntax errors.
  - `speed <num>` — 0.25..4; `1` is the historical default speed.
- Both are printed only when present, in canonical order after `width`. Duplicate keys use the
  existing duplicate-attribute diagnostic.
- IR version is **7** with `StyleBlock.sparks`/`StyleBlock.speed`; TypeScript and Go parse,
  print, serialize and merge them consistently. The canvas state carries the same two fields
  (including the `mergeCanvasDoc` path, which is what makes a properties edit reach the file).
- New corpus seed `testdata/corpus/connector-sparks/` (dense one-way link, a second
  link and a flow); corpus, parity and IR fixtures were regenerated with the
  repository generators, never hand-edited.
- Mermaid export already declares "style beyond fill" as dropped, which covers these keys; no
  new drop entry was needed.

## Playback behaviour

- `BeatLink` now carries `sparks`, `speed` and `bidir` from the resolved document link.
- The animator clamps defensively (1..8, 0.25..4), computes `durationMs = tokenMs / speed`,
  draws one token per spark and staggers them deterministically by `durationMs * i / count`.
- One-way links keep the trailing dash and fade the token out at the far end; multi-spark links
  drop the dash so the line does not smear.
- Bidirectional links ping-pong: the keyframes run out and back, the animation repeats until
  the beat ends (`iterations: Infinity` on the WAAPI port), and `flip` selects the initial
  direction.
- Reduced motion is now evaluated per beat (`prefers-reduced-motion` is read at beat time, not
  only at mount), so a live media-query change takes effect and shows static emphasis with no
  tokens.
- `stop()`, the next beat, exit and file switch all clear the animation layer, so no orphan
  tokens survive.

## Executed plan and debugging record

1. **RED, animation:** `sparks.test.ts` failed on defaults, staggering, speed scaling, clamping,
   ping-pong, flip, reduced motion and cleanup; implemented the `AnimOpts.iterations` port,
   `BeatLink` fields and the new `travel`/`spark` pair.
2. **Ping-pong endpoint:** the reverse slice skipped the start point (last frame was 4.17, not 0);
   fixed to `forward.slice(0, -1).reverse()`.
3. **RED, format:** `format/sparks.test.ts` failed on parsing, printing, serialization,
   workspace round-trip, bounds and duplicates; the parser/printer/serializer/merge/workspace
   paths were added on both sides (Go `ir.StyleBlock` + parser + printer).
4. **Complexity:** `docToState`'s link mapper grew past the limit; extracted `canvasLinkOf` and
   `canvasLinkStyle` with a `definedOnly` merge instead of an exception.
5. **Missing bridge field:** the E2E showed the properties edit accepted 4/2 but the file stayed
   unchanged — `merge.ts` did not copy the new style keys, so the canvas→document merge dropped
   them. Added `sparks`/`speed` to `CanvasLinkLike` and `withStyleKey`.
6. **Reduced motion:** emulating reduced motion mid-session had no effect because the animator
   captured the media query at mount; it is now read per beat.
7. **E2E adjustments:** the fixture needs the properties panel open; code-text assertions moved
   to a single reopened-panel check (the code panel is collapsed for canvas width); playback
   starts from the card (`step-play-N`) rather than the flow-level button; and the post-reload
   assertions read the file instead of clicking routes whose saved view is session-only.

## Focused and common validation

- `npx vitest run web/src/engine/anim/sparks.test.ts web/src/engine/format/sparks.test.ts` —
  **11 tests passed**; related `engine.test.ts`/`plan.test.ts` — 40 tests passed together.
- `npx playwright test e2e/flow02-sparks.spec.ts` — **2 tests passed** (light, dark).
- `npm test`, `npm run check`, `npm run build`, `npx playwright test` — passed (full suites).
- `go test ./...`, `go vet ./...`, `staticcheck ./...`, complexity gates — passed.
- `bash scripts/check-docs.sh`, `check-selfcontained.sh web/dist`, `git diff --check` — passed.

## Accessibility and visual review

- axe WCAG 2.1 A/AA is clean during playback in both themes; the new fields are labelled
  inputs with native bounds.
- Reviewed `test-results/screenshots/flow02-{inspector,sparks-oneway,sparks-pingpong,
  reduced-motion}-{light,dark}` (8 captures).
- Both themes: sparks are visible against the connector stroke, the ping-pong beat keeps both
  endpoints highlighted, the inspector shows `Spark count`/`Spark speed` with their current
  values, and the reduced-motion frame keeps static emphasis with no moving tokens.

## Deliberate limitations

- Speed scales spark motion only; step dwell and auto-advance stay untouched by design.
- The trailing dash is only drawn for a single spark (it would smear the whole link otherwise).
- Counts and speeds are clamped defensively at render time even though the parser rejects
  out-of-range documents, so a hand-edited IR cannot freeze playback.
