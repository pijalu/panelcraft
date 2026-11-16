<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Coordinated plan to close every open bug and feature request

**Status:** Closed. Every item below went through its sub-plan, its gates and its
own `docs/archive/` write-up; item 11 — the release umbrella — was verified last
against the deployed revision (identity, asset hashes, items 7–16 in a fresh and
an upgrading browser context). [`../bugs.md`](../bugs.md) is back to guidelines
only, so the next report starts the cycle again rather than extending this list.
Retained here as the record of how each item was triaged, bounded and gated.
**Scope:** Open items 7–16 in [../bugs.md](../bugs.md).
**Execution model:** One primary agent per numbered work package below. Agents own
their item's tests, implementation, visual review, documentation, archive write-up,
and commit. Shared contracts and the integration order prevent parallel agents from
silently overwriting one another.

## 1. Triage and de-duplication review

No two open items are exact duplicates, and none should be closed merely because an
older archived item has a similar title.

| Item | Disposition | Boundary and relationship |
|---|---|---|
| 7 — menus | Open product defect | Owns the shared menu geometry, overflow, keyboard, focus, and canvas command-grouping contract. |
| 8 — long filenames | Open product defect | Not a duplicate of item 7. Owns Files-panel layout and file-specific actions; reuses item 7's context-menu behavior. |
| 9 — presentation | Mixed confirmed defects and unreproduced report | Camera, timing, and spark styling are confirmed. Transport failure must be reproduced before changing handlers. Earlier spark work covered count/direction, not this lifetime or neon-style request. |
| 10 — default flow | Partial reopen / missing automatic path | The archived topological-ordering fix remains valid. Do not rewrite it; expose its derivation automatically for link-only documents. |
| 11 — hosted verification | Release umbrella, not another application defect | Must stay open until the product fixes are deployed and checked. Its application scenarios overlap intentionally, but it owns revision provenance, release gating, cache separation, and hosted evidence. |
| 12 — grid | Open default/preference defect | Not a duplicate of prior grid test-stability work. The renderer exists; fresh-profile visibility and saved-choice migration are the scope. |
| 13 — routing | Broader routing defect plus explicit-waypoint validation gap | The archived perpendicular-endpoint fix is not reopened as a failed algorithm. This item covers the whole polyline, connector labels, and invalid interior waypoints. Intentional detours are not defects. |
| 14 — entity labels | New rendered-baseline defect | Earlier shape-content work covered reservations and overlap, not the interaction of SVG baseline positioning with `LABEL_ASCENT`. Keep entity-label centering separate from connector-label routing. |
| 15 — icons | Feature/format extension | Extends the existing built-in-only property. It is not part of item 14, although its UI/render integration must preserve item 14's label geometry. |
| 16 — C4 drill-down | Feature/format extension | Imports open reused ghost objects and flow `goto` jumps between flows; neither defines decomposition. This item requires a new hierarchy contract, not a rename of existing navigation. |

### Triage outcomes that constrain implementation

- Preserve the existing topological derivation, endpoint-perimeter behavior, explicit
  anchors, valid waypoints, saved grid preferences, and imported-ghost semantics.
- Do not classify the second routing fixture's down/up detour as an automatic-router
  bug. Its defect is acceptance/rendering of a waypoint inside the target entity.
- Treat item 11 as the final release gate, not as permission to redeploy unfixed code
  repeatedly to diagnose local defects.
- Items 15 and 16 both change the native format. They require reviewed grammar and
  TypeScript/Go parity in the same change; neither may land as a UI-only side store.

## 2. Ownership, isolation, and integration order

| Agent / branch suggestion | Item | Primary ownership | Can start | Required coordination |
|---|---|---|---|---|
| Menu agent / `fix/menu-viewport-contract` | 7 | `Menu.tsx`, `menuModel.ts`, `ContextMenu.tsx`, `CanvasMenu.tsx`, menu tests/styles | Immediately | Publish the shared context-menu API before Files integration. |
| Files agent / `fix/files-long-names-actions` | 8 | Files panel, file-action model, related tests/styles | Layout immediately; menu after contract | Do not fork menu positioning or keyboard code. |
| Presentation agent / `fix/presentation-playback` | 9 | animation camera/timing, spark styles, presentation dock/player tests | Immediately | Consume item 10's default flow only in final integration tests. |
| Default-flow agent / `fix/default-connection-flow` | 10 | flow derivation/launcher/template, related tests | Immediately | Reuse `topologicalLinks`; no presentation engine edits. |
| Release agent / `fix/hosted-release-verification` | 11 | Pages/CI workflow, hosted smoke/evidence | Design immediately; close last | Run after all product and format changes merge. |
| Grid agent / `fix/default-visible-grid` | 12 | grid preferences/render toggles/user docs/tests | Immediately | No PDL or document-format change. |
| Routing agent / `fix/whole-route-validity` | 13 | router, route diagnostics, connector-label geometry/tests | After geometry contract with label agent | Do not edit entity-label baseline code; consume its geometry API. |
| Label agent / `fix/entity-label-centering` | 14 | shape text layout, browser geometry tests | Immediately | Provide stable content/label rectangles to routing. |
| Icon agent / `feat/project-icon-registry` | 15 | built-in assets, icon grammar/IR/render/management, parity | Immediately | First native-format feature to integrate; rebase drill-down onto it. |
| Drill-down agent / `feat/c4-drill-down-source` | 16 | decomposition/source grammar, navigation/workspace UI, parity — **closed** | Specification now; format after item 15 | Reuse the final format/parity layout from item 15. |

### Integration sequence

1. **Contracts and reproductions:** every agent records a minimal reproduction and a
   failing test before changing behavior. Label and routing agents agree on geometry
   inputs. Menu and Files agents agree on context-menu invocation. Icon and drill-down
   agents agree not to edit the same format generation concurrently.
2. **Independent product fixes:** items 7, 9, 10, 12, and 14 can merge independently.
   Item 8 follows the menu contract. Item 13 follows the label geometry contract.
3. **Native-format features:** integrate item 15 completely, including corpus and Go
   parity, then rebase and integrate item 16. Run label, routing, export, and workspace
   regressions after each.
4. **Full integration:** rebuild the production bundle, run every focused and full
   gate, inspect the combined UI, and resolve any cross-item regression before release.
5. **Hosted verification and closure:** item 11 deploys the exact integrated revision,
   checks it in fresh and upgrading browser contexts, and only then permits all items
   to be archived and removed from the open list.

Each agent commits only its own item with a descriptive message. If testing exposes a
new defect, reproduce it, add it to the relevant plan, fix it without weakening the
original assertion, and update the eventual archive write-up. Generated browser
artefacts stay under `test-results/`; curated golden changes require an intentional
`UPDATE_GOLDENS=1` run and screenshot review.

## 3. Sub-plan 7 — one viewport-safe contract for every menu

**Owner:** Menu agent. **Depends on:** none. **Blocks:** Files context-menu work.

### Reproduce and specify

1. Inventory application menus, nested submenus, every panel/view menu, canvas blank
   space, object, group, and connection context menus. Record trigger, entry count,
   disabled states, invocation method, and current rectangle at each edge.
2. Capture failing cases at all four corners, with long labels, a short viewport,
   narrow/touch layout, browser zoom, scrolled canvas/panels, and an already scrolled
   menu. Include nested submenus whose right-hand placement exceeds the viewport.
3. Write one contract covering maximum available height/width, internal scrolling,
   overflow cues, root and submenu flipping/clamping, pointer/touch dismissal,
   Arrow/Home/End and submenu keys, Enter/Space, Escape/Tab, and focus restoration.

### Implement the smallest shared solution

1. Extend the shared geometry model to position root and nested surfaces from measured
   rectangles and available space. Reposition on viewport resize and relevant scroll;
   avoid raw pointer coordinates or right-only nested placement.
2. Give overflowing lists a focusable internal scroll region, visible overflow
   affordance, and `scrollIntoView({block: 'nearest'})` for pointer/keyboard focus.
   Do not let the document scroll instead of the menu.
3. Make `ContextMenu` use the same placement, focus, dismissal, and keyboard semantics
   as application menus. Restore focus to the invoking object/edge/canvas without
   changing selection or creating an undo entry.
4. Reorganize canvas commands by task: keep Properties, clipboard, and Delete direct;
   group alignment/distribution without removing commands. Preserve disabled-state
   explanations and destructive-action clarity.

### Tests and closure evidence

- Unit-test geometry at every edge/corner, nested depth, long content, resize, and
  insufficient space. Component-test all keys, disabled skipping, scrolling, focus
  return, pointer outside, touch, and action invocation exactly once.
- Add Playwright coverage for each menu family and canvas target in light/dark,
  desktop/narrow/short viewports. Assert bounding boxes and actual click/focus, not
  merely DOM presence. Run accessibility scans on open root/submenu/context states.
- Review screenshots for clipping, trigger occlusion, scroll cues, grouping, focus,
  and contrast. Record the inventory and before/after evidence in the item 7 archive.

## 4. Sub-plan 8 — long filenames never hide file actions

**Owner:** Files agent. **Depends on:** item 7's shared menu contract.

1. Add a narrow Files-panel fixture with an unbroken long filename, extension,
   directory depth, active/dirty indicators, and every file action. Reproduce action
   displacement and horizontal overflow before editing CSS.
2. Change the row/grid layout so the filename can wrap or break safely while action
   controls retain a non-shrinking, reachable area. Do not clip focus rings or make
   row height break keyboard selection and scrolling.
3. Add a file-row context menu containing the same actions and disabled states as the
   visible buttons. Invoke it by right-click and a keyboard-accessible action; use the
   shared menu primitive and return focus to the correct row.
4. Test pointer, touch, keyboard, rename/delete dialogs, dirty files, long names in
   nested folders, and no horizontal overflow at supported widths. Verify that file
   operations still target the intended row after wrapping or menu invocation.
5. Review light/dark/narrow screenshots and run Files, workspace, menu, accessibility,
   and full browser suites. Archive with the exact long-name fixture and evidence.

## 5. Sub-plan 9 — presentation framing, lifetime, sparks, and controls

**Owner:** Presentation agent. **Depends on:** none; final default-flow journey uses item 10.

### Separate the four failure modes

1. **Framing:** capture active rectangles, route/label bounds, viewport, and computed
   camera for the default C4 message steps. Add tests that reject close-up cropping
   and excessive zoom while retaining participants and route context.
2. **Timing:** use the injectable clock/player to reproduce a one-way spark ending at
   900 ms during a 2500 ms dwell. Define one beat-lifetime contract: the token reaches
   the endpoint, its completion is visible, and no orphaned animation survives a step,
   pause, restart, exit, or file change. Do not merely stretch every animation blindly.
3. **Transport:** in a real browser, record the clicked control, hit target, player
   state, overlay/pointer-events state, and console errors. Reproduce previous,
   play/pause, next, restart, exit, progress dots, and branch choices in playing,
   paused, and branch states before assigning a cause. Existing handlers are not proof
   that the buttons work.
4. **Appearance:** implement token-based neon core/glow after behavior is stable.
   Bound glow so it does not hide routes or labels; provide a static reduced-motion
   endpoint/emphasis rather than animation.

### Verify

- Unit-test camera bounds independently of manual canvas zoom, deterministic timing
  with fake clocks, repeated/bidirectional sparks, and cleanup. Browser-test every
  control by pointer and keyboard, exit viewport restoration, and no orphan layers.
- Test long routes, parallel branches, narrow/wide screens, both themes, and reduced
  motion. Inspect settled and mid-animation screenshots, including endpoint arrival.
- Run focused animation/presentation tests, accessibility, full unit/browser/quality
  gates, and archive the reproduced transport cause separately from the visual fixes.

## 6. Sub-plan 10 — derive a virtual default flow without duplicating authored data

**Owner:** Default-flow agent. **Depends on:** none.

1. Add failing tests for the shipped Customer/Shop/Payment provider template and a
   generic link-only document. Require a launcher entry and playback order "buys" then
   "charges" before any New flow action.
2. Implement one pure derivation adapter around the existing `topologicalLinks()` /
   `addFlow` ordering logic. Preserve stable link references, labels, parallel-link
   identity, direction, and deterministic creation-order fallback for cycles.
3. Prefer a non-persisted virtual default when a document has links and no authored
   flows. Opening, presenting, saving, formatting, or reloading must not mutate PDL,
   create undo history, or append flows. Specify what happens when the user edits the
   default or deletes the last authored flow: materialize at most once on an explicit
   edit, with an ordinary undoable command.
4. Keep any authored flow authoritative; never silently reorder or replace it. Empty
   documents and documents without usable connections retain the normal empty state.
5. Test launcher, presentation, repeated reload/save, parallel links, cycles, hidden
   links, invalid/deleted references, edit/materialize/undo, and template insertion.
   Run flow, format, workspace, and full gates, then archive this as the missing
   automatic path while retaining the archived topological algorithm.

## 7. Sub-plan 11 — prove the integrated revision on the hosted site

**Owner:** Release agent. **Depends on:** all other items merged and full local gates green.

1. Add a deployment evidence step that records source SHA, Pages run, built HTML asset
   names/hashes, and the eventual served asset identity. Do not infer correctness from
   a successful deploy job alone.
2. Make publication require successful relevant continuous-integration checks for the
   same SHA. Avoid a workflow pattern that can deploy a different revision from the
   one whose checks passed. Preserve path filtering for documentation-only changes.
3. Add a post-deployment Playwright smoke configuration targeting the hosted URL in a
   fresh browser context. Assert app boot, no third-party resource loads, item 7 menu
   reachability, item 8 file actions, item 9 transport/framing, item 10 default flow,
   item 12 grid, item 13/14 geometry fixtures, and item 15/16 persistence/navigation.
4. Test first visit separately from an upgrading client with an installed service
   worker. Verify update/restart behavior and prove which bundle is active; never use
   a hard refresh as the only evidence that caching is correct.
5. Retain test output and screenshots as release evidence. If hosted behavior differs,
   reopen the owning item with the exact SHA and failure rather than creating a
   generic "site broken" duplicate. Close item 11 only after the integrated revision
   passes; then archive all items and leave `bugs.md` with guidelines only.

## 8. Sub-plan 12 — visible default grid with preference-safe migration

**Owner:** Grid agent. **Depends on:** none.

1. Reproduce with cleared storage at normal zoom; separately test restored `off`,
   `dots`, and `lines` values and corrupt/old settings. Confirm whether menu and `G`
   failures exist beyond the intentional hidden default.
2. Change the fresh-install default to a subtle visible grid, preserving snap enabled.
   Add an explicit settings-version/migration distinction between "missing preference"
   and "user chose off"; never overwrite an existing choice or move existing geometry.
3. Verify Off/Dots/Lines and `G`, including restoration of the last visible type,
   persistence, independent snapping, and visible feedback at normal zoom. Retain the
   intentional sub-50% suppression and restoration unless a separate usability defect
   is reproduced.
4. Assert pointer transparency and exclusion from presentation, minimap, SVG, PNG, and
   CLI artwork. Update the specification and user guide to state the new default and
   migration behavior.
5. Review light/dark screenshots at default/low zoom and dots/lines. Run grid, export,
   accessibility, persistence, and full gates; archive with fresh and migrated profiles.

## 9. Sub-plan 13 — validate complete routes and preserve intentional detours

**Status: closed.** Evidence and implementation notes:
[docs/archive/bugs-route-validation.md](archive/bugs-route-validation.md).

**Owner:** Routing agent. **Depends on:** item 14's shared content/label geometry.

1. Save the first screenshot's minimal automatic-route reproduction, the exact PCD in
   item 13, before screenshots, and full route/label coordinates. Add whole-polyline
   assertions: perimeter endpoints, normal endpoint legs, no endpoint/third-party
   interior crossing, no unrelated label collision, bounded detours, and no gratuitous
   reversal. Endpoint-only assertions are insufficient.
2. Instrument which stage produces each invalid point: side selection, obstacle
   avoidance, route projection, persisted waypoints, or connector-label placement.
   Change one cause at a time; do not replace the router speculatively.
3. For automatic routes, evaluate deterministic candidate polylines against entity and
   label obstacles with clearance and a readable cost model. Preserve outward stubs,
   explicit anchors, parallel-link separation, and stable output. If no valid route
   exists, choose a documented minimal-conflict result and diagnostic rather than an
   unexplained large loop.
4. For explicit waypoints, preserve valid intentional detours. Define one non-
   destructive policy for interior waypoints: diagnose invalid points and either reject
   the edit or render a clearly defined safe fallback while retaining the source text.
   Never silently relocate a user's waypoint and call it authoritative.
5. Use the same entity/content rectangles as item 14 for connector-label avoidance.
   Place the "charges" label adjacent to its route without crossing Shop, Payment
   provider, unrelated links, or its own arrow geometry.
6. Test nearby/stacked/reordered entities, moves, reload, undo/redo, views, anchors,
   valid/invalid waypoints, and SVG export in both themes. Run router/render/browser/
   quality gates and archive separate evidence for automatic and explicit routes.

## 10. Sub-plan 14 — center labels by actual rendered bounds

**Owner:** Label agent. **Depends on:** none. **Publishes geometry to:** item 13.

1. Add the exact 57×36 Shop fixture and fail a real-browser assertion comparing the
   transformed rendered text bounding-box center with the shape content-box center.
   Keep a route-hidden control so connector labels cannot confound the result.
2. Establish one vertical-positioning model. Resolve the `LABEL_ASCENT` SVG offset and
   `dominant-baseline: central` interaction rather than adding a compensating constant.
   Preserve horizontal anchoring and existing content reservations.
3. Expose the resulting content/label rectangles through a small renderer geometry API
   for routing, auto-fit, and tests. Avoid two divergent calculations of available text
   space.
4. Cover default/small/custom heights, multiline and unbroken text, every shape kind,
   icons/glyphs/imported badges, selection, resize, reload, and custom colors. Use SVG
   transforms/screen-space rectangles in browser assertions.
5. Review light/dark screenshots with routes visible and hidden; run shape, auto-fit,
   routing, accessibility, and full gates. Item 15 must rerun the icon cases before
   its later format feature merges.

## 11. Sub-plan 15 — built-in and project-defined portable icons

**Owner:** Icon agent. **Depends on:** label geometry contract. **Blocks:** item 16 format integration.

### Format and asset foundation

1. Write the grammar proposal and required format decision before coding: a
   document-scoped named icon declaration with explicit media type and canonical
   Base64 payload, referenced by the existing object `icon name` property. Define
   handle syntax, built-in collisions, duplicate/unknown handles, size/decoded-size
   limits, media types, diagnostics, and deterministic printing.
2. Expand the bundled technical set with traceable GPL-compatible provenance and
   license documentation. Keep all assets inline/local; no icon font, CDN, external
   URL, or new runtime dependency without the required architecture decision record.
3. Update TypeScript IR/parser/printer/validation and Go IR/parser/printer/validation
   together. Regenerate corpus fixtures only through the acceptance tooling and review
   the diff. Add valid/invalid/collision/malformed/oversized corpus cases and byte-
   equivalent TypeScript/Go IR and canonical PDL output.
4. Sanitize SVG at ingest and render using an allowlist that removes scripts, event
   handlers, external references, unsafe CSS, and active/foreign content. Define raster
   decoding failure behavior if raster media are allowed. A malformed custom icon must
   produce a diagnostic/fallback, never execute or fetch content.

### Management and rendering

1. Add searchable built-in/custom picker, preview, accessible names, and project icon
   add/import/paste-Base64, rename, replace, and remove workflows. Renames update all
   references atomically and undoably; removal reports usages and never leaves silent
   broken references.
2. Keep label layout consistent with item 14 at default/custom sizes. Custom icons are
   decorative by default unless the object semantics require an accessible name.
3. Verify save/reload, undo/redo, duplicate/copy across files, ZIP round-trip, SVG/PNG/
   CLI export, deterministic output, and no network request. Define Mermaid export as
   an explicit declared drop/diagnostic rather than silently losing custom icons.
4. Test malicious SVG, invalid Base64/media type, size limits, unknown/colliding
   handles, rename/remove usage, and both themes/high contrast. Review screenshots and
   run format/corpus/Go/render/workspace/browser/full quality gates before archiving.

## 12. Sub-plan 16 — genuine C4 decomposition and embedded source

**Status:** closed — shipped as `drilldown`/`source` (IR v10); the write-up with
evidence is [archive/bugs-c4-drill-down.md](archive/bugs-c4-drill-down.md).

**Owner:** Drill-down agent. **Depends on:** item 15 merged; reuse its format/parity pattern.

### Specify the model before UI work

1. Extend the product and format specifications with a canonical parent-to-child
   relation from an entity to a workspace-relative `.pcd` target and optional view.
   Define permitted C4 transitions (system→containers, container→components), stable
   identity, whether one parent owns a child, and how the parent boundary/context is
   rendered without duplicating the parent object.
2. Define embedded source as text plus language metadata with escaping, size limits,
   canonical printing, and diagnostics. Source remains browser-local text: never fetch
   a URL, execute code, or require a server. Specify separate behavior for decomposition
   links, imported ghosts, and flow `goto` so none is presented as a substitute for another.
3. Define missing or non-PDL targets, cycles, duplicate relations, incompatible levels,
   rename/move/delete reference maintenance, undo/redo, unsaved buffers, direct child
   opening, presentation behavior, and export fidelity. Choose one source of truth for
   hierarchy; avoid independently editable parent/child backlinks that can disagree.
4. Update TypeScript and Go format/IR/validation atomically, regenerate/review corpus,
   and prove round-trip/idempotence/parity for valid and invalid hierarchy/source cases.

### Navigation and viewer

1. Add a visible, focusable entity drill-down affordance plus properties/code actions.
   Open the selected child view with breadcrumbs/back and correct history; preserve or
   explicitly prompt for unsaved edits. Cycles and missing targets keep the current
   context and show actionable diagnostics.
2. Render the child's parent boundary/context and distinguish it from imported ghosts.
   Add a safe source viewer/editor using local text and existing editor infrastructure;
   no embedded HTML/script execution. Keyboard, pointer, and presentation navigation
   must have specified, tested behavior.
3. Test system→container→component journeys, back/breadcrumbs, direct/reload/ZIP open,
   rename/move/delete, unsaved changes, broken/cyclic/duplicate links, level validation,
   source escaping/round-trip, and no network. Define static SVG/PNG and Mermaid behavior
   for links/source, including explicit unsupported diagnostics where necessary.
4. Review light/dark/narrow screenshots for parent context, breadcrumbs, focus, and
   source overflow. Run format/corpus/Go/workspace/render/browser/offline/accessibility/
   full quality gates. Archive only after proving this is hierarchical navigation, not
   merely opening an imported source file.

## 13. Final integration, quality gates, and closure

The integrating agent must run the real commands separately and paste actual results
into the relevant archive/final summary. A focused test that does not exercise the
reported failure is not closure evidence.

1. Rebuild before browser tests: `npm run build`. The preview server uses the existing
   bundle, so a stale build is not valid end-to-end evidence.
2. Run `npm run check`, `npm test`, `npm run test:perf`, and `npx playwright test`.
   Confirm coverage thresholds for every touched core package and no new complexity
   exception without an architecture decision record.
3. Run `go vet ./...`, `staticcheck ./...`, `gocognit -over 15 .`,
   `gocyclo -over 12 .`, and `go test -count=1 -race -cover ./...` separately. Any
   accepted pre-existing complexity warning must be unrelated and explicitly recorded.
4. For format items, run corpus acceptance/checking and Go parity, validate the
   architecture diagrams, and review every generated golden diff. Never hand-edit IR
   goldens.
5. Run `bash scripts/check-docs.sh`, `bash scripts/check-selfcontained.sh web/dist`,
   `bash scripts/check-repo-clean.sh --worktree`, and `git diff --check`. Verify GPL
   headers on new source files and no new runtime origin or unreviewed dependency.
6. Perform the combined screenshot/accessibility review, including reduced motion,
   keyboard-only operation, light/dark, narrow/short viewports, and no-network mode.
   Fix any newly discovered defect and update this plan before closure.
7. Complete item 11's same-SHA deployment and fresh/upgrading hosted checks. Move each
   validated item to its own `docs/archive/` write-up with reproduction, root cause or
   design decision, implementation summary, commands/output, screenshots, and residual
   risks. Remove all closed entries from `bugs.md`; if new items were added, restart
   the process instead of declaring the list empty.
