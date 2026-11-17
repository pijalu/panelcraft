# Fix plan — browser assessment round 3

Status: closed. All four items were fixed, validated in Chromium and archived
in [docs/archive/bugs-browser-assessment-round-3.md](archive/bugs-browser-assessment-round-3.md).

Assessment evidence: `npx playwright test --workers=4 --reporter=line` — 227
browser tests passed on the branch before this round. A Chrome DevTools session
against the built app then reproduced the four gaps logged in `bugs.md`. A
Playwright probe of twelve Flow Steps delay edits measured ~1.56 s and zero
IndexedDB writes, so the sluggishness is in the synchronous edit path rather
than autosave.

## 1. Selected flow step shows no properties until the user scrolls

**Fix.** Keep the single inline inspector. Give it a stable test id, expose a
small callback from `FlowEditor`, and scroll the inspector into view inside the
Flow Steps panel after a step selection commits. No global Properties-panel
selection and no second inspector.

**Test approach.** Component test spies on `scrollIntoView` after `step-N` is
clicked and asserts the inspector is the target; browser test asserts the
inspector's bounding box is inside the panel viewport immediately after a click
with a long step list, in light/dark and at a narrow viewport.

**Validation.** Focused FlowPane vitest + browser spec, axe scan, light/dark and
narrow captures, full `npm run check` and `npm test`.

## 2. Spark count is an at-most spacing rule

**Fix.** Pass the measured connector path length into the pure beat timeline.
Derive how many tokens can be separated along that distance, cap the requested
count at that maximum, and derive the stagger from the spacing distance so no
two tokens start together. Handle a bidirectional link by alternating endpoints
as today; the browser filmstrip must sample both legs and several concurrent
tokens. Rename the inspector label to say the value is a maximum.

**Test approach.** Pure timeline tests for short/long connectors, one/many
sparks, non-zero stagger, at-most concurrent tokens and two opposite-direction
passes on a bidirectional link. Browser filmstrip samples several token
transforms at one instant and both legs of a `<->` connector.

**Validation.** Focused anim tests, browser spark spec in light/dark, reduced
motion, axe, `npm run check`, `npm test`.

## 3. Click-driven or end-driven advance

**Fix.** Add an optional per-step `advance click | advance end` attribute to the
PDL format and IR, defaulting to end-driven auto-advance. The printer emits the
attribute only when authored. Flow planning carries it to the beat. The player
loops the current beat instead of scheduling an auto-advance when the step is
click-driven; the normal transport click/next still advances. The step inspector
gets one closed-domain select for the two choices.

**Test approach.** Format unit/parity cases for both values and default
omission; IR/plan tests for beat propagation; controller tests for cycling and
click advance; browser test for persisted value, reload, presentation and panel
playback, keyboard and axe.

**Validation.** Atomic format change: TS + Go parser/printer/IR, FILE-FORMAT,
corpus regeneration and parity fixtures, then focused suites, full browser
suite, docs gate, `npm run check` and `npm test`.

## 4. Flow Steps delay input feels sluggish

**Fix.** Keep a local draft in the delay input and commit one document edit when
the value settles (`change`/blur), not on every `input`. Existing document and
undo paths stay unchanged; no new save timer is added because autosave already
debounces UI state and flushes content once written.

**Test approach.** Component test asserts typing several characters produces no
document write until the change event; browser probe measures a burst of delay
edits and confirms one committed source update. Existing flow-edit e2e still
covers persistence and undo.

**Validation.** Focused FlowPane tests, browser performance probe, full browser
suite, `npm run check` and `npm test`.

## Close evidence

Each item gets an archive write-up with the RED command/output, the GREEN
commands, captured screenshots reviewed against the style guide, and the exact
bug entry removed from `bugs.md`. The coordinated plan and CHANGELOG are updated
before the final commit; `scripts/check-repo-clean.sh` runs after it.
