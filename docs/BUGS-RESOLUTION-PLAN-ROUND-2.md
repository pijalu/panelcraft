<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Coordinated plan for the second bug round

**Status:** Closed. All twelve items were archived from [`../bugs.md`](../bugs.md),
which now holds only the reporting guidelines and the closed-item list. This
document keeps the order of work and the evidence contract; each item's
detailed fix plan was copied into its own archive write-up.
**Branch:** `feat/bugs-round-2`. **Execution:** one active goal at a time, with a
fresh context per item, followed by one commit per tested and archived item.
No parallel edits: several items touch the flow player, the format, or the menu.

## Ground rules

1. Reproduce first. Browser reports need browser evidence; source inspection is
   a hypothesis, not a reproduction. Write the behavioural regression before
   changing behaviour and keep it in the final commit.
2. Keep domain rules in pure engine/workspace services. Components render state
   and call narrow ports; engine packages own no UI strings or browser globals.
3. Preserve one source of truth per state and one document writer. Prefer a
   discriminated state/result over extra flags and optional fields. Do not add
   fake files, duplicated option lists or per-menu enablement rules.
4. Make format changes atomic: parser, printer, IR, validation, documentation,
   corpus regeneration and TypeScript⇄Go parity in the same commit.
5. For interface work, use the design-review workflow in
   [`../.agents/skills/laws-of-ux/SKILL.md`](../.agents/skills/laws-of-ux/SKILL.md), including the
   relevant individual law references. Check keyboard operation, focus return,
   reduced motion, narrow viewport, light/dark themes and no-network behaviour
   where applicable.
6. Run each code-quality command in a separate shell invocation and read its
   output: `go vet ./...`, `staticcheck ./...`, `gocognit -over 15 .`,
   `gocyclo -over 12 .`, `go test -count=1 -race -cover ./...`. Pre-existing
   complexity warnings are acceptable only when unrelated to the change and
   named in the archive write-up.
7. Keep generated captures in `test-results/`. Curated goldens change only via
   `UPDATE_GOLDENS=1 npm run e2e` and an explicit screenshot review.
8. When testing exposes a new issue, add it to that item's plan, fix it without
   weakening the earlier assertion, and record both in the archive write-up.
9. An item closes only after its archive file exists, its `bugs.md` section is
   removed, and the evidence in the archive names the commands actually run and
   the observed result. When all items close, `bugs.md` contains guidelines only.

## Order and dependencies

| Order | Item | Depends on | Archive file |
|---:|---|---|---|
| 1 | Presentation step badge centring | none | `bugs-presentation-badge-centering.md` |
| 2 | Presentation Play replays the current beat | 1 (same presentation surface) | `bugs-presentation-replay-beat.md` |
| 3 | One beat timeline for sparks and borders | 2 (runner and player semantics) | `bugs-spark-beat-timeline.md` |
| 4 | Presentation URL anchor | 2–3 (transport and effects settled) | `bugs-present-hash-anchor.md` |
| 5 | Orthogonal waypoint simplification | none | `bugs-orthogonal-waypoint-simplification.md` |
| 6 | Update banner hit-test review | none; close as unreproduced if no state is found | `bugs-update-banner-hit-test.md` |
| 7 | Remove named views, retain layout | before 8–9 and before menu regrouping | `bugs-remove-named-views.md` |
| 8 | Decomposition picker, export and embedded editing | 7 | `bugs-embedded-decomposition.md` |
| 9 | Known-value inputs and property order | 8 | `bugs-known-value-properties.md` |
| 10 | Flow Markdown notes and presentation panel | 2–4 for player integration | `bugs-flow-markdown-panel.md` |
| 11 | Selected flow-step properties | 10 (same inspector) | `bugs-step-properties.md` |
| 12 | Hamburger menu task groups | 7–11 (command set settled) | `bugs-hamburger-task-groups.md` |

## 1. Presentation step badge centring

**Plan in `bugs.md`:** "Presentation step badge is vertically miscentred".
**Test approach:** add an SVG geometry unit assertion comparing text bbox centre
with circle centre for 1, 10 and 100; add a Chromium `getBBox()` measurement in
the presentation e2e. The current `y + 4` offset and `dominant-baseline: central`
are the hypothesis, not the fix.
**Implementation boundary:** badge renderer only; do not touch the dock's text
counter. Keep the calculation in the renderer and reuse existing type/spacing
tokens.
**Validation:** focused unit test fails before edit and passes after; full
`npm test` and `npm run check`; presentation e2e with measured centre offset;
light/dark screenshots reviewed against the style guide.
**Close evidence:** pre-fix failure output, post-fix measurements, screenshot
review result and archive write-up.

## 2. Presentation Play replays the current beat

**Plan in `bugs.md`:** "Presentation Play must replay the current beat".
**Test approach:** controller regression for playing→paused→replay and parked
step→replay, asserting a fresh current-beat animation and exactly one
full-duration advance timer; WAAPI `currentTime`/`playState` plus visible spark
position in Chromium.
**Implementation boundary:** add an explicit runner operation. Do not overload
`resume`, re-enter `goto`, duplicate navigation side effects, cancel camera work
globally or give the ordinary play bar different semantics by accident.
**Validation:** cover Restart, step change, exit, file change and reduced motion;
focused controller/animator tests; presentation e2e; light/dark captures;
`npm run check`; `npm test`.
**Close evidence:** recorded stale-timeline reproduction, timer/animation counts
before and after, keyboard and theme results.

## 3. One beat timeline for sparks and borders

**Plan in `bugs.md`:** "Spark and border effects need one beat timeline".
**Test approach:** specify numeric source start, spark creation, travel
start/arrival, target pulse and final rest before editing; encode creation at
peak expansion or after unexpansion explicitly; pure timeline tests with fake
player/clock for one/multiple/flipped/bidirectional sparks, parallel lanes and
very short dwell. Real Chromium assertions cover computed visibility and event
order, not element count.
**Implementation boundary:** one pure value function; `FlowAnimator` owns and
cancels only its own handles on replay, step change, stop and file change; use
`BeatLink.from`/`to`; no timeouts in components and no global WAAPI cancellation.
**Validation:** filmstrips at source pulse, mid-travel, arrival and settled
state in both themes; pause/replay, step change, exit and reduced motion;
animation/presentation e2e; `npm run check`; `npm test`.
**Close evidence:** numeric timeline table, ordered event assertions and
filmstrip review notes in the archive.

## 4. Presentation URL anchor

**Plan in `bugs.md`:** "Dedicated presentation URL anchor".
**Test approach:** pure codec tests and a fake-history transition table before
browser work. Cover direct load, Present, natural end, Exit, file switch,
cross-file goto, unknown/malformed ids, an authored id missing, reload, Back and
Forward.
**Implementation boundary:** small hash codec plus narrow History/location port;
shell controller owns workspace readiness and player/history coordination; no
URL policy in `FlowRunner`; hash text is never document input; no `#view=` anchor.
**Validation:** built-app e2e for the transition table, no document mutation and
no external request; upgrading-client case; `npm run check`; `npm test`.
**Close evidence:** transition table, browser results and a note that local
workspace content cannot be shared with another browser profile.

## 5. Orthogonal waypoint simplification

**Plan in `bugs.md`:** "Orthogonal waypoint routes need an explicit
simplification contract".
**Test approach:** exact reported polyline, intentional detour that survives,
multiple removable bends, duplicate points, obstacles, already-clean route and
many-bend performance case. Define reversal, retracing and crossing separately.
The intentional-detour test is replaced with the new contract, not weakened.
**Implementation boundary:** one pure planner returns the polyline and structured
`inside-entity`/`causes-reversal` skip records with authored index/point. Score
whole candidates: crossings are a hard constraint, then fewer reversals, fewer
drops, shorter length, authored-index tie-break. Canvas renders and warns from
the same result; authored PDL and IR keep every waypoint line.
**Validation:** focused router/controller tests before full `npm test` and
`npm run check`; route performance test; built-app light/dark route screenshots
checking geometry and warning text; document-text equality assertion.
**Close evidence:** pre-fix reversal output, new scoring rule, test output and
screenshot review.

## 6. Update banner hit-test review

**Plan in `bugs.md`:** "Update banner click blockage is not reproduced".
**Test approach:** record shell state, waiting-worker state, console errors,
bounding boxes, computed `pointer-events`, stacking contexts and
`document.elementFromPoint` at both button centres. Cover narrow viewport, zoom,
unapplied confirmation, menus, dialogs, presentation and reload.
**Implementation boundary:** add a failing Playwright case only after a concrete
blocked state exists; a forced `pointer-events: none` is not a reproduction.
With no state found, close as unreproduced without speculative production edits.
If lifecycle is at fault, `UpdateController` stays the state owner.
**Validation:** complete PWA spec, real pointer and keyboard activation, state
changes after clicks, light/dark and narrow captures, `npm run check`, `npm test`.
**Close evidence:** exact reproduction state or explicit statement that none was
found, all hit-test data and PWA results.

## 7. Remove named views, retain layout

**Plan in `bugs.md`:** "Remove named views without deleting diagram layout
persistence".
**Test approach:** first define post-view IR and top-level grammar, including
which pin/hide data survives and where its UI lives. Test rejected legacy
`view` blocks and `drilldown ... view <id>`, route reset with no/one/multiple
selection, one undo entry per operation, deterministic auto-layout and reload
persistence.
**Implementation boundary:** atomic TypeScript and Go parser, printer, IR,
validation, corpus and parity changes; promote retained layout state to top
level; remove `ViewBar`, `viewName`, `useViewSession` and CLI view options only
after replacement behaviour is covered; distinguish Reset diagram layout from
Reset workspace layout.
**Validation:** `npm run check`, `npm test`, `bash scripts/check-docs.sh`,
`go test ./...`, `go vet ./...`, `staticcheck ./...`, both complexity gates,
corpus parity and built-app light/dark menu/context-menu e2e.
**Close evidence:** migration decision, diagnostics output, undo/redo matrix and
layout persistence results.

## 8. Decomposition picker, export and embedded editing

**Plan in `bugs.md`:** "Decomposition picker, complete embedded export and
embedded editing".
**Test approach:** unit-test candidate lists, nested identity, transitive
multi-level embedding, shared/missing/cyclic/unparsable descendants,
all-or-nothing failure, deterministic bytes and non-mutation. Browser-test
embedded editing, code/canvas sync, undo/redo, reload, export choice/cancel and
re-import into a fresh workspace.
**Implementation boundary:** discriminated linked/embedded decomposition target
with limits and cycle rules; pure `WorkspaceReader`-backed graph service;
derived explorer tree with a root-file-plus-path `DocumentRef` and the existing
single document writer; one keyboard-accessible known-value picker; no fake VFS
files and no UI-owned traversal.
**Validation:** TypeScript⇄Go corpus and parity; recursive round trips; CLI
convert/validate/render; keyboard/axe; light/dark/narrow tree and dialog
captures; no-network e2e; all Go and TypeScript quality gates.
**Close evidence:** export plan examples, diagnostics and fresh-workspace import
result.

## 9. Known-value inputs and property order

**Plan in `bugs.md`:** "Known-value inputs and property hierarchy".
**Test approach:** replace free-text icon tests with one-control selection
behaviour for built-in/project/none/unknown values; test typeahead, Escape and
focus return, outside dismissal and viewport placement; test unresolved
decomposition/goto/process values, dependent flow options and DOM section order.
**Implementation boundary:** one select-like icon control and one reusable
icon-write command that also clears stale override; convert only closed domains;
leave names, descriptions, technology, tags and custom properties as text;
message endpoints stay read-only; keep section ids and expansion preferences.
**Validation:** property/icon/flow suites with deliberately updated e2e
selectors, axe, light/dark and narrow captures, `npm run check`, `npm test`.
**Close evidence:** section-order assertion, keyboard/focus results and updated
selector diff.

## 10. Flow Markdown notes and presentation panel

**Plan in `bugs.md`:** "Flow Markdown notes with presentation panel".
**Test approach:** multiline round-trip and legacy one-line tests; every
supported construct; nesting and escapes; raw HTML as text; `javascript:` and
`data:` rejection; empty text; toggle persistence; no-panel state; focus and
canvas refit in the browser.
**Implementation boundary:** atomic multiline description block and
presentation flag across both parsers, printers, IR, validation, docs and
corpus; one local typed Markdown AST and URL policy reused by app and docs
export; no rendered HTML in IR, no images, no remote renderer, no new runtime
dependency.
**Validation:** focused vitest, `npm test`, `npm run check`, corpus parity,
documentation gate and built-app no-network e2e; light/dark/narrow captures.
**Close evidence:** sanitization table, export goldens and panel screenshots.

## 11. Selected flow-step properties

**Plan in `bugs.md`:** "Selected flow-step properties: correct the existing
model, do not recreate it".
**Test approach:** cover every step kind's fields, read-only endpoints,
identified and fallback `linkRef` resolution, unresolved links, shared-style
visibility across steps, invalid numeric bounds, undo/reload and derived-flow
non-materialization.
**Implementation boundary:** reuse `FlowSelection`, `makeActions`, `retext` and
the existing inline inspector; no second selection store and no advanced-step
dialog; one pure resolved-link style patch; 1–8 sparks and 0.25–4× speed bounds
live in one shared validator; no invented labels for kinds without label fields.
**Validation:** focused flow suites, flow e2e, axe, light/dark screenshots,
`npm run check`, `npm test`.
**Close evidence:** link-resolution matrix and shared-style edit results.

## 12. Hamburger menu task groups

**Plan in `bugs.md`:** "Hamburger menu needs task-based groups".
**Test approach:** publish the top-level/group membership matrix before code,
including what stays top-level and why. Update flat-order tests; add browser
keyboard tests for ArrowRight, ArrowLeft, Escape, focus return and
viewport-safe placement; verify every command by stable id/test id.
**Implementation boundary:** build the matrix in pure `appMenuEntries` and reuse
`Menu`'s submenu primitive; no third menu model, no duplicated selection or
enablement state; keep ids, checked/disabled state and actions intact; keep
frequent commands prominent.
**Validation:** focused model/component tests, complete menu e2e, axe,
keyboard-only traversal, light/dark/narrow captures, `npm run check`, `npm test`.
**Close evidence:** membership matrix, id parity list and screenshot review.

## Final integration

Completed with item 12. The final sources were rebuilt and the full suite ran
green (`npx playwright test --workers=4 --reporter=line` — 227 passed); the
member-item archive records the model, quality and screenshot evidence. The
light/dark shell was reviewed again in the new menu captures. The
repo-clean check is run after the closing commit. No separate release or hosted
deployment is in scope for this round.
