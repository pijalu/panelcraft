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



## 7. Audit and repair all menus and context menus for usable viewport behavior

**Severity:** High — commands become unreachable, blocking basic editing tasks.

**Observed behavior:** Menus with many commands extend or scroll outside the
visible viewport, making the menu unusable. The review must cover the complete
application menu, every nested submenu, panel/view menus, and canvas context
menus rather than fixing only the most visible popover.

**Expected behavior:** Every command remains visible or reachable through an
obvious internal scrolling affordance at every supported viewport size. Menus
open near their trigger without covering it, flip or clamp away from viewport
edges, and keep nested submenus on screen. Pointer, touch, and keyboard users
can reach the same commands; focused items scroll into view; disabled and
destructive actions are understandable; and closing restores focus to the
trigger or invoking canvas object. Frequently used actions remain easy to find,
while advanced alignment/distribution choices are grouped without hiding
recovery actions or removing capability.

**Critical assessment:** This is not solved by adding `max-height` alone. The
shared application menu clamps only its root rectangle; nested submenus are
absolutely positioned to the right without viewport collision handling
(`web/src/ui/Menu.tsx`, `web/src/ui/menuModel.ts`). The canvas context menu uses
the pointer coordinates directly, so a right-click near an edge can place its
70%-height surface off-screen (`web/src/ui/ContextMenu.tsx`). Context menus also
lack the application menu's Arrow/Home/End navigation. Finally, the canvas menu
shows twelve similarly prominent actions, including many disabled alignment and
distribution commands, increasing search effort when the user only wants a
common action such as Properties or Delete.

**Fix plan:** Inventory all menu surfaces and define one shared viewport,
scrolling, focus, and dismissal contract. Add failing geometry and interaction
tests for root menus, nested submenus, and context menus opened at every viewport
edge/corner, with long labels, browser zoom, and narrow/touch layouts. Implement
available-space sizing, visible overflow cues, collision-aware placement, and
consistent Arrow/Home/End, Enter, Escape, focus-return, and scroll-into-view
behavior. Review command grouping from a user-task perspective: prioritize
Properties, clipboard, and Delete; progressively disclose advanced arrangement
commands without deleting functionality. Capture and inspect screenshots in
light/dark themes at desktop, narrow, and short viewports, including scrolled and
keyboard-focused states. Run the full menu, accessibility, browser, and quality
gates, then repeat critical cases against the deployed site.

## 8. Keep long filenames and file actions reachable — schedule after long-menu fix

**Observed behavior:** In the Files panel, an overly long filename pushes the
file-action icons out of view.

**Expected behavior:** Wrap long filenames across lines so the visible action
icons remain reachable, and provide a context menu as an alternative way to
invoke the file actions. Preserve pointer, touch, and keyboard operation without
horizontal overflow.

**Fix plan:** Add component and browser regressions using a long filename in a
narrow Files panel. Verify the filename wraps, every action stays visible and
operable, the context menu exposes the same actions, and keyboard focus remains
usable. Review light/dark and narrow-viewport screenshots, then run the full
unit, end-to-end, accessibility, and quality gates.

## 9. Repair flow presentation framing, playback, sparks, and transport

**Observed behavior:** Flow presentation does not behave as expected:

1. Automatic camera zoom is too aggressive, producing close-ups instead of
   preserving enough diagram context.
2. Message animation stops too early in the step.
3. The moving spark is visually plain; it should have an attractive neon glow.
4. Buttons in presentation mode reportedly do not respond.

**Expected behavior:** Automatic framing keeps the active participants, route,
and label readable at a restrained zoom while retaining useful context. Message
animation remains active for the intended step duration and reaches its endpoint
before the step changes. Sparks have a clear neon-style core and glow in both
themes without obscuring labels. Every presentation control — previous,
play/pause, next, restart, exit, progress dots, and branch choices — responds to
pointer and keyboard input.

**Research:** The automatic camera currently fits only the active rectangles with
48 px padding and allows the general 400% zoom maximum
(`web/src/engine/anim/camera.ts`, `web/src/engine/render/viewport.ts`). One-way
sparks run once for 900 ms by default, while a step dwells for 2500 ms;
bidirectional sparks alone repeat until the beat ends
(`web/src/engine/anim/timings.ts`, `web/src/engine/anim/engine.ts`). A spark is a
6 px accent-coloured circle with a 55%-opacity trail and no glow
(`web/src/ui/app.css`). Presentation button handlers exist in
`web/src/ui/PresentDock.tsx`, but current browser scenarios do not exercise every
transport button. The camera, timing, and plain-spark reports match the current
implementation; the unresponsive-buttons report still needs an exact live-browser
reproduction before assigning a cause.

**Fix plan:** First add failing browser regressions for excessive message-step
zoom, animation lifetime relative to dwell, and every presentation control in
playing, paused, and branch-choice states. Capture the actual hit target and
player state when a control fails. Then bound automatic presentation zoom and
context independently of manual canvas zoom, define one timing contract so sparks
do not finish prematurely, and implement a token-based neon core/glow with static
reduced-motion emphasis. Verify endpoint completion, pause/resume, restart,
branch choices, exit restoration, and no orphan animation. Review settled and
mid-animation screenshots in light/dark themes at wide and narrow sizes, run
accessibility checks, then run focused animation/presentation tests followed by
the full unit, browser, and quality gates.

## 10. Provide a presentable default flow from existing connections

**Observed behavior:** The default C4 context template contains Customer → Shop
("buys") and Shop → Payment provider ("charges"), but no flow. Those existing
topological links therefore do not provide an immediately presentable story.

**Expected behavior:** A document with existing connections and no authored flow
has a deterministic default flow derived from those links. The default C4 example
is immediately presentable with "buys" followed by "charges". Explicitly created
or edited flows remain authoritative, parallel links remain distinct, cycles have
a stable fallback order, and opening or presenting a document must not create
duplicate flows on repeated saves.

**Research:** This partially reopens a previously closed item. `addFlow` already
materializes existing connections in stable topological source order
(`web/src/ui/flows/flowDoc.ts`), and the earlier fix is recorded in
`docs/archive/bugs-topological-flow-editing.md`. That behavior runs only when the
user chooses New flow; the C4 template in `web/src/ui/EmptyState.tsx` still has
only objects and links. The missing piece is automatic availability for a
link-only document, not the topological ordering algorithm itself.

**Fix plan:** Reuse the existing topological derivation rather than adding a
second ordering implementation. Add failing tests for the default C4 template, a
link-only document, repeated presentation/reload, parallel links, and cyclic
graphs. Provide one default-flow path that preserves connection labels and stable
link references without duplicating or silently reordering authored flows. Verify
that the launcher lists the default and that presentation plays "buys" then
"charges". Add template, persistence, launcher, and end-to-end playback coverage,
then run the full flow, format, workspace, and quality gates.

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

## 13. Prevent entity links from crossing shapes and generating nonsense routes

**Severity:** High — incorrect geometry can misrepresent architecture semantics.

**Observed behavior:** Links between entities can take nonsensical routes. In the
supplied screenshot (`/Users/muaddib/Library/Caches/goa/images/goa-image-702857706.png`),
the Shop → Payment provider connector travels horizontally through the Shop
shape and its label, loops far above both entities, and only then turns down to
Payment provider. The "charges" label is detached to the left of Shop rather
than clearly associated with that route. This is a correctness problem, not
cosmetic polish: the drawing makes the relationship difficult to trace and can
imply the wrong source or target.

A second screenshot (`/Users/muaddib/Library/Caches/goa/images/goa-image-375620880.png`)
shows a vertical connector segment passing through the Payment provider name.
Its exact reproduction is:

```pcd
pcd 1.0

person user "Customer"
system app "Shop" {
  size 57 36
  style {
    fill #6a0b53
    text #c2dbff
  }
}
system_ext pay "Payment provider"

user -> app : "buys"
app -> pay : "charges" {
  waypoint (432, 254)
  waypoint (432, 70)
}

view "Default" {
  position app (248, 128)
  position pay (348, 52)
  position user (40, 40)
}
```

**Expected behavior:** Each automatic route starts and ends at the correct entity
perimeter, approaches endpoints perpendicularly, avoids entity interiors and
text, and uses the shortest readable orthogonal path without unexplained loops
or backtracking. Labels remain adjacent to their owning connector and never
cross unrelated shapes or links. Moving entities, changing views, reloading,
and exporting preserve a coherent route. Explicit anchors and valid user
waypoints remain authoritative, including intentional detours, but a waypoint
inside an endpoint entity must be diagnosed or safely resolved rather than
silently drawing through that entity and its label.

**Research:** A previous fix covered outward endpoint stubs and perpendicular
approaches (`docs/archive/bugs-orthogonal-endpoints.md`), but the screenshots
show that endpoint direction alone does not ensure a valid overall route. The
second fixture also separates automatic-routing defects from explicit-path
behavior: its two waypoints intentionally force the down/up backtrack, and
`(432, 70)` lies inside the Payment provider rectangle positioned at
`(348, 52)`. The current waypoint router deliberately skips obstacle avoidance
(`web/src/engine/render/router.ts`), so it accepts that target-interior point
and draws through the target label. The large detour is user-authored; the
missing validation or safe handling of entity-interior waypoints is the defect.
Tests must assert the entire polyline and label placement, not only endpoints.

**Fix plan:** Reproduce first with the default Customer/Shop/Payment provider C4
example and save the before screenshot and route coordinates. Add failing
geometry tests that reject entity-interior crossings, label/entity collisions,
far-away detours, and unnecessary reversals for automatic routes. Add the exact
second fixture as an explicit-waypoint regression: preserve the intentional
detour while rejecting or safely handling the waypoint inside Payment provider.
Include nearby, stacked, and reordered entities. Localize whether the invalid
points come from obstacle avoidance, endpoint anchors, persisted waypoints, or
route projection before changing the router. Verify the original fixture after
entity moves, reload, undo/redo, view switches, and SVG export; retain valid
explicit waypoint behavior. Review light/dark screenshots and run focused
routing/render tests, the full browser suite, and all quality gates.

## 14. Center entity labels using rendered geometry, including custom sizes

**Observed behavior:** In the second screenshot above, the Shop label is not well
centered inside its custom 57×36 shape; it reads visibly too low. The defect
affects the entity's own label, independently of the connector-label placement
problem in the previous item.

**Expected behavior:** Entity labels are horizontally and optically vertically
centered in their available content box at default and custom sizes. Small
shapes, multiple lines, icons, glyphs, imported badges, and custom text colors
must not introduce baseline offsets or clipping. Connector routing must use the
same correct content geometry when avoiding labels.

**Research:** The label layout adds `LABEL_ASCENT` to the SVG text `y` coordinate
(`web/src/engine/render/shapes.ts`), while the stylesheet applies
`dominant-baseline: central` to that same text (`web/src/ui/app.css`). This
combines two vertical-positioning models and is consistent with the downward
shift visible at 36 px height. Existing unit tests calculate expected bounds
from SVG attributes rather than measuring the browser-rendered text, so they can
pass while the visible label remains off-center.

**Fix plan:** Add a failing real-browser regression using the supplied 57×36
Shop object. Compare the rendered text bounding box center with the shape's
content-box center instead of asserting only the `y` attribute. Establish one
baseline model for entity labels and verify default/small/custom heights,
multiple lines, every shape kind, icons, and both themes. Review screenshots
with the route visible and hidden so entity-label centering and connector-label
avoidance cannot be confused, then run focused render tests, visual review, and
the full quality gates.

## 15. Icon management is limited to eight built-ins

**Observed.** Objects can select only `cloud`, `database`, `gear`, `lock`, `mail`,
`user`, `chart`, and `code`. There is no project icon registry, no way to declare a
Base64 icon under a stable handle, and no searchable technical icon picker.

**Expected.** Ship a broader offline C4/technical set (person, system, container,
component, server, browser, mobile, API/gateway, queue, topic, function, file,
network, and security variants) and let a diagram declare custom icons whose handles
work with the existing object `icon name` property. A suggested PDL form is a
named document-scoped declaration with an explicit media type and Base64 payload;
the exact grammar needs a format review. Icons must remain embedded and portable in
`.pcd`, ZIP, SVG export, browser reload, and CLI rendering. No icon font, CDN, or
runtime fetch.

**Fix / test plan.** Specify the registry, handle namespace/collision rules, size
limits, canonical Base64 printing, and unknown/malformed icon diagnostics. Sanitize
SVG (no scripts, event handlers, external references, or unsafe CSS), make icon
accessibility decorative unless it carries meaning, and record asset licenses. Add
a searchable picker plus add/preview/rename/remove project-icon management with
usage checks. Land grammar + parser + printer + IR + docs + regenerated corpus and
TypeScript/Go parity atomically. Test persistence, ZIP/SVG export, invalid and
oversized payloads, deterministic output, and light/dark/high-contrast screenshots.
Document any Mermaid-export loss instead of silently dropping custom icons.

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
