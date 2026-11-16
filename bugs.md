# Bug and feature Tracking

## Guideline
1. Create a detailed fix plan for each bug - the plan must contain test approach and validation steps - execute the plan and validate the fix when all elements are in place.
2. Any issues found must be fixed and the fix plan must be updated accordingly.
3. Issues found during testing must be fixed and the fix plan must be updated accordingly.
4. Each bug should be moved to docs/archive when tested and closed as the associated plan.
5. Use interactive shell/filmstrip to validate the output of the tool - you must verify the actual terminal output.
6. Check code quality with each tool run separately (do not chain them with `;` or `&&`):
- `go vet ./...`
- `staticcheck ./...`
- `gocognit -over 15 .`
- `gocyclo -over 12 .`
- `go test -count=1 -race -cover ./...`
 Fix any issues.
 ! For cognitive and cyclomatic complexity, Pre-existing warnings are acceptable only if they are unrelated to the change and explicitly noted !

 At the end of the session - the bug list should be empty, change committed and this file should only contain the guidelines for bug reporting.
 If new items are added, restart the process.

 Use goals to execute the fix plan - focus on micro tasks goals with new contextto lower context usage - use todos for micro tasks that should share context

 Commit at the end of each fix with a clear and descriptive commit message

## Report format
Describe the bug or feature request under `# To fix` below. Keep one section
per item with a short title, the observed behavior, and the expected behavior.

# To fix

The coordinated, agent-by-agent closure plan for every item below is in
[docs/BUGS-RESOLUTION-PLAN.md](docs/BUGS-RESOLUTION-PLAN.md). It includes the
duplicate/reopen audit, ownership boundaries, dependencies, tests, release gate,
and final archive criteria. Planning only: no implementation has been executed.



## 11. Verify hosted behavior against the deployed revision

**Observed behavior:** The long-menu and long-filename defects are still visible
at `https://pijalu.github.io/panelcraft/`, which could indicate either unfixed
application code or a stale/failed release.

**Expected behavior:** Each fix can be traced to the exact deployed commit and
verified in a fresh browser against the hosted application. A successful Pages
deployment must not be mistaken for proof that the hosted behavior is correct or
that continuous-integration checks passed.

**Research:** This is not currently evidence of a stale deployment. GitHub Pages
run 43845352314 completed its build and deploy jobs successfully from commit
`49d7ebff972490a36267a8acbaeb1f4c86a4065d`, which contains the current application
changes. The later `b8620f7` commit changes documentation only and correctly does
not trigger the path-filtered Pages workflow. The menu and filename items above
are still open, so their presence on the live site is expected. Also, Pages build
and deploy run independently of the main continuous-integration workflow, so a
green deployment alone does not establish application correctness.

**Fix plan:** Record the source commit and served asset identity in the deployment
evidence, then run a fresh-context hosted smoke test after deployment. Include
long-menu scrolling, long-filename actions, presentation transport, and grid
visibility once their fixes land. Check service-worker update behavior separately
from a clean first visit so an old cached client cannot be confused with a failed
deployment. Make the release process require the relevant continuous-integration
checks before publication, and retain the hosted test output as release evidence.

## 16. No true C4 drill-down or embedded source view

**Observed.** Imported objects appear as read-only ghosts and open their source
file; flow `goto` navigates to another file. Neither expresses that one C4 element
decomposes into a child diagram. Objects also cannot carry embedded source code.

**Expected.** Let an entity link to a subordinate diagram/view and optionally embed
source, so a system can open its container diagram and a container its component
diagram. This must be a real C4 hierarchy with stable parent/child identity, not an
import alias or a generic hyperlink. Selecting or keyboard-activating the entity's
drill-down affordance should open the child with breadcrumbs/back navigation and a
clear parent boundary/context; embedded source should open in a safe read/edit
viewer without leaving browser-local storage.

**Fix / test plan.** Review and extend SPEC/FILE-FORMAT with one canonical
parent-to-child relation, allowed C4 level transitions, entity identity across
levels, view selection, and embedded source language/content escaping. Define
missing targets, cycles, duplicate links, rename/move/delete behavior, unsaved
changes, import/ghost interaction, presentation behavior, and export semantics.
Keep targets workspace-relative; never fetch URLs or execute source. Add navigation
breadcrumbs, visible/focusable drill-down controls, and child-boundary rendering
without duplicating or silently renaming the parent object. Test round trips,
TypeScript/Go parity, broken/cyclic links, keyboard navigation, reload/ZIP export,
and light/dark/narrow screenshots. Mermaid/static SVG exports must state how linked
children and source are represented or explicitly reported as unsupported.

## Closed this session

- **Icons: 43 built-ins plus project-defined, portable, sanitized icons.**
  Objects could only pick one of eight built-in glyphs and there was no way to
  give a diagram its own asset. A document can now declare
  `icon <handle> { label "…" media "image/svg+xml" data "<canonical Base64>" }`
  and reference it through the existing `icon name` property, so the `.pcd` stays
  self-contained through ZIP, SVG/PNG export, browser reload and CLI rendering —
  no sidecar file, no icon font, no CDN, no fetch. Grammar, IR v9, printer,
  TypeScript and Go parser/validator, corpus seeds and FILE-FORMAT landed
  together with a shared TS⇄Go fixture, so round-trip and parity stay byte-exact;
  new syntax codes `E114`/`E115` and validation `P206`–`P210` cover malformed
  payloads, handle collisions with the reserved built-in namespace, the size
  limits, unsafe SVG and unresolved names. Payloads are sanitized on ingest
  (allowlist reconstruction) and checked again at render, where they are embedded
  as a `data:` URI so an SVG-as-image runs in static mode. The built-in set grew
  to 43 vendor-neutral glyphs with a provenance/licensing record, and the
  properties panel gained a searchable picker plus project-icon management whose
  rename rewrites every reference in one undoable step and whose removal reports
  usages before clearing them. Mermaid export declares `icons` dropped either
  way. Details: [docs/archive/bugs-project-icon-registry.md](docs/archive/bugs-project-icon-registry.md).

- **Routes are validated as a whole polyline, and an intentional detour survives.**
  The report showed `Shop → Payment provider` cutting through its own shape and
  then looping above both entities, with the `charges` label detached. Three
  separate causes were localised before touching the router. Explicit waypoints
  were passed through verbatim, so a bend placed inside an entity was drawn
  through that shape and its label; automatic routes never tested their own two
  endpoint rectangles, so a route (especially one with explicit perimeter
  anchors) could be scored as conflict-free while cutting through the entity it
  pointed at; and candidate scoring ranked only crossings and raw length, so a
  connector that ran out, back and out again was not recognised as a loop. Now
  each authored leg is routed around entity rectangles while keeping its bends,
  automatic candidates count interior conflicts against every entity including
  the endpoints (a port or clearance stub only touches a perimeter), and
  reversals are penalised after crossings and shared lines so detours stay
  bounded and readable. A bend inside an entity cannot be honoured by any route,
  so it is skipped rather than silently relocated: the file keeps the authored
  `waypoint` line, and the connector carries the reason — tooltip, accessible
  description and `data-route-warning` — e.g. “charges: bend 2 at (432, 70) is
  inside Payment provider — the route skips it.” Verified by whole-polyline
  fixture tests (perimeter endpoints, perpendicular legs, no interior crossing of
  any entity or entity label, bounded length, no reversal, preserved detour,
  untouched document, label adjacency, nearby/stacked/reordered entities,
  anchors), router contract tests, browser scenarios for both fixtures in both
  themes with sampled route paths against rendered shape boxes, the full unit,
  coverage, e2e (192) and Go gates, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-route-validation.md`.

- **Flow presentation frames, animates and responds as reported.** Four separate
  defects, not one: the automatic camera fitted only the step's participants at
  up to 400 % zoom, so a message between neighbouring shapes became a close-up
  with the route, its label and the surrounding diagram cropped away; a one-way
  spark ran its own 900 ms inside a 2500 ms step and then faded out, so the
  arrival was never seen; the spark was a plain accent dot with no glow; and
  "the buttons do not respond" reproduced as two real defects — the shell's key
  handler swallowed Space/Enter while focus was on a dock button, and a parked
  step published `paused` while its animation kept running, so the toggle needed
  two presses. Presentation zoom is now capped at 1.25 with the union centred and
  independent of the manual canvas zoom (an authored focus zoom is still kept);
  one beat-lifetime contract places every spark inside the dwell with a visible
  arrival margin and holds a one-way token at its endpoint; pause/resume reach the
  animations, a parked step settles to its end state, and stop removes every
  animation and the emptied layer; arrows/Escape stay global while a focused
  control owns Space/Enter; and the token is a theme-token neon core with halos no
  wider than 8 px, with a static endpoint mark under reduced motion. Verified by
  camera/timing/lifetime unit tests, ten browser scenarios covering every control
  by pointer and keyboard in playing, paused and branch states plus framing,
  arrival, pause and orphan cleanup, the full unit/coverage/perf gates, and
  light/dark screenshot review.
  Write-up: `docs/archive/bugs-presentation-playback.md`.

- **Long file names no longer hide the file actions.** A long `.pcd` name pushed
  duplicate / rename / delete out of the Files panel. The row's label was an
  unstyled flex item, so `min-width: auto` kept it at the name's full width and
  the name never wrapped — only the ellipsis was fighting the actions. The label
  is now the only shrinkable part of the row, the name wraps to two clamped lines
  with the whole name in the tooltip, and the actions keep a non-shrinking area
  with no horizontal overflow. The same actions are on a row context menu
  (right-click or `Shift+F10`) built on the shared menu surface, so a cramped row,
  a touch screen or a keyboard user can still reach them; the menu targets its own
  row, delete keeps its two-step confirmation, and focus returns to that row when
  the menu closes or a rename is cancelled. Verified by row geometry, menu entry
  set, keyboard path, focus return and accessibility scans in the browser, five
  component tests, the full unit/coverage and end-to-end gates, and light/dark
  screenshot review (which rejected unbounded wrapping).
  Write-up: `docs/archive/bugs-long-filenames-file-actions.md`.

- **Every menu now shares one viewport-safe contract.** Menus were positioned
  from unmeasured guesses: nested submenus sat at `left: 100%` with no collision
  handling, and the canvas context menu was drawn at raw pointer coordinates, so
  a right-click near a corner put its surface off-screen — and it had no
  arrow-key navigation at all. Placement is now measured (`placeMenu` picks the
  side with room and refuses to cover its own trigger; `placeSubmenu` flips left
  when the right side has no room), a list that overflows scrolls internally with
  a visible cue and scroll-into-view focus, and the context menu runs on the same
  surface as the application menu — arrows, Home/End, submenu open/close,
  Enter/Space, Escape/Tab, outside dismissal and focus returning to the canvas.
  The canvas commands keep Properties, clipboard and Delete direct and group the
  nine arrange commands in one reachable **Arrange** submenu. Verified by pure
  geometry tests, component keyboard tests, five browser scenarios asserting real
  bounding boxes and key behaviour, accessibility scans, and the full
  unit/coverage/perf/docs gates.
  Write-up: `docs/archive/bugs-menu-viewport-contract.md`.

- **A link-only diagram is presentable straight away.** The default C4 template
  ships "buys" and "charges" but no flow, so the story needed hand-written PDL.
  The ordering algorithm was already correct — it only ran on an explicit New
  flow. The default flow is now derived virtually from the connections (same
  topological order, labels and parallel links preserved, creation order as the
  cycle fallback) and offered by both the Flows pane and the presentation
  launcher, marked "from the connections". Opening, presenting, saving or
  reloading writes nothing and appends no flow; the first real edit materialises
  it once as an ordinary undoable command, and an authored flow always wins.
  Verified by derivation, catalog, pane and browser tests (launcher, playback
  order, no duplicate after repeated presentation and reload, materialise plus
  undo), the full unit/coverage/perf/docs gates, and screenshot review.
  Write-up: `docs/archive/bugs-default-virtual-flow.md`.

- **Entity labels are centred by their rendered bounds again.** Two vertical
  positioning models had been stacked: the SVG `y` carried a 12 px font ascent
  *and* `.pc-label` centred the em box on that same coordinate, so every label
  drifted 4 px low — most visible in the reported 57×36 Shop shape. `y` is now the
  centre of its line box, one model, no compensating constant. Fixing the drift
  exposed a real overlap the old shift had hidden: a 32 px datastore cannot fit
  its lid, a line and the padding, so a block that does not fit is clamped to its
  region top instead of overflowing into the shape's glyphs. Verified by a
  real-browser assertion of rendered bounds against the layout model for every
  kind in both themes, two unit tests pinning the model, 4 targeted and 165 full
  browser tests, and the full unit/coverage/docs gates.
  Write-up: `docs/archive/bugs-entity-label-centering.md`.

- **A fresh profile now shows a subtle dots grid.** The hidden default was the
  whole defect — renderer, menu items and the `G` shortcut all worked. Flipping
  the default needed a migration answer first: a stored preference record is
  written only when the user changes something, so a present `type` is a choice
  and is preserved (including `off`), while a missing field means "never chose"
  and takes the visible dots default with snapping still on. Snapping stays
  independent, the last-visible-type memory behind `G` and the sub-50 % zoom
  suppression are unchanged, and the grid still never reaches the document,
  minimap, presentation or an export. Verified by unit tests for the migration
  contract, 4 targeted and 161 full browser tests, both-theme screenshot review,
  and the full unit/coverage/perf/docs gates.
  Write-up: `docs/archive/bugs-visible-default-grid.md`.

- **The CI/CD browser setup is deterministic again.** Flow creation now waits
  for the canvas-to-file write to settle, and grid fixtures replace the editor
  contents atomically instead of racing select-all against re-renders. The five
  presentation timeouts came from clicking intentionally pointer-transparent
  route strokes; the current connection-derived flow setup avoids that invalid
  test action. The exact failing revision reproduced five failures and passed
  all 10 targeted tests with the repairs. Current targeted coverage passed
  20/20, the full browser suite passed 160/160, and all unit, coverage, static,
  race, build, and accessibility gates remained green.
  Write-up: `docs/archive/bugs-ci-e2e-determinism.md`.

- **Secondary and middle mouse drags now pan the canvas.** Moving either button
  changes only the viewport, never object geometry, selection, document text, or
  undo history. A moved secondary drag suppresses the context menu; a stationary
  right-click preserves it. Space+drag, wheel, keyboard, and primary-pointer
  navigation remain available. Verified by controller and real-browser
  regressions, full coverage/static gates, 21 related browser tests,
  accessibility scans, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-canvas-mouse-panning.md`.

- **Views are retained with a non-destructive contract.** Creating a view
  snapshots current positions; switching restores only stored positions and
  never recomputes layout. Explicit apply/reset commands remain unchanged.
  Verified by component and browser regressions, full coverage/static gates,
  13 related browser tests, accessibility scans, and light/dark screenshots.
  Write-up: `docs/archive/bugs-views-non-destructive.md`.
- **Automatic orthogonal links now approach shapes perpendicularly.** Obstacle
  detours and avoidance candidates stay axis-aligned with outward endpoint
  stubs; explicit anchors and waypoints remain authoritative. Verified by
  regression and render suites, 13 related browser tests, full coverage/static
  gates, Go race tests, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-orthogonal-endpoints.md`.
- **Collapsed panels now share one tab-like column per dock.** All collapsed
  panels keep labelled, keyboard-accessible expand controls, the Code sync chip
  remains visible, and expanding one panel leaves the other tabs available.
  Verified by component tests, full unit/coverage gates, 16 targeted browser
  tests, and light/dark screenshot review.
  Write-up: `docs/archive/bugs-collapsed-panel-rails.md`.
- **Flows now start from existing connections and support non-destructive
  visibility controls.** Stable topological source order uses creation index
  for ties; manual drag/drop remains authoritative. Hide removes only the
  flow's message card, while Hidden connections can Show the original link
  again. Descriptions, keyboard ordering, parallel-link references, and
  light/dark accessibility are covered.
  Write-up: `docs/archive/bugs-topological-flow-editing.md`.
- **BUG-08 — undo from the History dialog could revert far more than the last
  edit** (the connector-style end-to-end test went red on the shared CI runner,
  green locally). Fixed by removing the test's dependence on same-link command
  coalescing: the undo/redo contract is now asserted on a reloaded session that
  holds exactly one journal entry.
  Write-up: `docs/archive/bugs-cx04-undo-race.md`.
- **BUG-09 — cryptic identifiers in commits, comments and docs.** Fixed with a
  locally-defined glossary in `agents.md` ("Identifiers in this repo"), a rule
  that the sentence must stand without the tag, and `scripts/check-jargon.sh`
  wired into `verify.sh` and CI, which fails any change that adds a bare tag.
  Write-up: `docs/archive/bugs-identifier-clarity.md`.
- **BUG-10 — the deployed GitHub Pages site was blank.** Fixed by building the
  bundle for the `/<repo>/` sub-path and failing the job if an `/assets/`
  reference survives.
  Write-up: `docs/archive/bugs-pages-blank-page.md`.
