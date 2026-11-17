# Bug and feature tracking

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

## Cross-cutting design constraints

- Reproduce first and write the behavioural regression before the fix. Source inspection identifies likely causes; it does not prove a reported browser defect.
- Keep domain rules out of components. UI components render state and call narrow application ports; pure engine/workspace services own geometry, graph traversal, format rules and validation. Do not make an engine package import UI strings or browser globals.
- Maintain one source of truth per state and one document writer. Do not add parallel visibility flags, fake workspace files, duplicated option lists or per-menu enablement rules. Prefer a discriminated state/result type over several booleans or optional fields that permit invalid combinations.
- Keep changes small and cohesive. Extract a module only when it gives a rule one owner; do not build a general framework or mix opportunistic cleanup into a bug fix. Preserve existing ports where possible and remove an API only after tracing its callers.
- A format change is atomic: TypeScript and Go parser/printer/IR/validation, format documentation, corpus regeneration and parity fixtures land together. UI work also needs keyboard, reduced-motion, narrow-viewport, light/dark and no-network verification as applicable.

## Orthogonal waypoint routes need an explicit simplification contract

**Observed.** `routeExplicit` drops only bends inside entities, and `routeThroughWaypoints` scores each leg independently (`web/src/engine/render/router.ts:79-103,208-229,377-382`). The reported probe produces two whole-path direction reversals even though no segment literally intersects or retraces itself. Calling every reversal a “loop” is therefore imprecise.

**Review finding.** The proposal conflicts with the current authoritative-waypoint contract in `docs/FILE-FORMAT.md:364-373` and with the intentional-detour assertion in `CanvasController.routeGeometry.test.ts:198-216`. “Greedily drop bends that reduce reversals” is a product behaviour change, not a small bug fix. It must not be slipped in while leaving those contracts untouched.

**Expected.** For orthogonal routes only, simplify an authored out-and-back route by skipping the fewest bends necessary under a documented scoring rule. Preserve authored order and source text. A skipped bend must carry a reason on the connector. Never increase entity crossings. Straight and curved routes are outside this item. Explicitly supersede the old “every outside bend is authoritative” wording and replace—not weaken—the old detour test with tests for the new contract.

**Fix plan.**

1. Add the exact reported polyline as a failing whole-route test, plus an intentional detour that must survive, multiple removable bends, duplicate points, obstacles and an already-clean route. Define a reversal, retracing and a crossing separately in test helpers; do not use one as a synonym for another.
2. Introduce one pure explicit-route planner whose result contains both the polyline and structured skip records (`inside-entity` or `causes-reversal`, authored index and point). Evaluate whole candidates deterministically: entity crossings are a hard constraint, fewer full-path reversals wins, then fewer dropped bends, shorter length and authored-index tie-breaks. If removal is iterative, prove termination and bound the work with a realistic many-bend performance case.
3. Make the canvas consume that same result for rendering and warnings. Do not leave `invalidWaypoints` as a second, divergent decision path. The engine returns reason codes; the canvas owns plain-language text.
4. Keep all authored `waypoint` lines unchanged in PDL/IR. Update the routing contract in `FILE-FORMAT.md`, `USER-GUIDE.md`, `SPEC.md` and `CHANGELOG.md`, including the intentional change to detour preservation.

**Validation.** Focused router/controller tests first, then `npm test`, `npm run check`, route performance tests and built-app light/dark route screenshots. Assert both rendered geometry and warning text, and verify that the document text is unchanged.

## Update banner click blockage is not reproduced

**Observed.** A user reports a stuck “Update available” banner with unclickable controls. The current code and existing e2e do not establish that failure. Review check run after `npm run build`: `npx playwright test e2e/ux08-pwa.spec.ts` completed with **4 passed**, including real Restart and Later clicks, reload, and queueing during playback. Thus the original plan to change presentation queueing would risk fixing working behaviour.

**Expected.** Whenever the banner is the topmost interactive surface, Restart and Later receive real pointer and keyboard activation. Later hides only the banner and leaves Restart available in the application menu. Presentation/modal behaviour remains intentional: a hidden or modal-covered banner is not expected to receive clicks, and a queued offer must not interrupt playback.

**Review/fix plan.**

1. Treat this as **unreproduced**, not as a proven z-index defect. Capture the exact shell state, waiting-worker state, console errors, bounding boxes, computed `pointer-events`, stacking contexts and `document.elementFromPoint` at both button centres. Cover narrow viewports, browser zoom, unapplied-code confirmation, menus/dialogs, presentation and reload.
2. Add a failing Playwright case only when a concrete blocked state is identified; a synthetic forced `pointer-events: none` test would not reproduce the product bug. Verify actual state changes after the clicks, not merely button visibility.
3. Make the smallest localized fix after the hit-test evidence. If the defect is lifecycle-related, keep `UpdateController` as the state owner rather than adding another flag. The unused `PwaHandle.playbackEnded` callback and duplicated controller/UI visibility are review risks to investigate, not proven causes and not licence for a broad rewrite.

**Validation.** The new failing case must fail before the fix and pass after it. Re-run the complete PWA spec, keyboard activation, light/dark and narrow-viewport screenshots, `npm run check` and `npm test`. Record the reproduction state in this item before closing it.

## Presentation Play must replay the current beat

**Observed.** The presentation toggle calls `FlowRunner.resume`, which resumes the existing animation timeline (`web/src/ui/PresentDock.tsx:49-55`; `web/src/ui/flows/flowController.ts:324-338`). It therefore cannot start a fresh spark cycle after Pause or after a step was settled.

**Expected.** Pause freezes the current beat. Play in the presentation dock replays that beat from time zero with a full dwell, without advancing twice or retaining old animations. Step changes and Restart retain their existing meanings. Reduced motion renders the settled state immediately.

**Fix plan.**

1. Add a controller regression that pauses, then verifies Play creates a new current-beat animation and exactly one full-duration advance timer. Add a browser assertion on WAAPI `currentTime`/`playState` and visible spark position.
2. Model **replay current beat** explicitly in the runner instead of overloading “resume” in the UI. Decide and test whether ordinary PlayBar resume continues or also replays; do not let the two transport surfaces acquire accidental different semantics. Reuse the current beat and scheduling path without re-entering a goto or duplicating navigation side effects.
3. Before replay, cancel only animations owned by the old beat. Do not leave detached WAAPI animations registered and do not cancel unrelated camera work through a global convenience call.

**Validation.** Cover playing→paused→replay, parked step→replay, Restart, step change, exit, file change and reduced motion. Run focused controller/animator tests, presentation e2e, light/dark captures, `npm run check` and `npm test`.

## Spark and border effects need one beat timeline

**Observed.** `FlowAnimator.play` pulses every actor immediately, while `travel` starts sparks immediately and leaves one-way tokens filled at their endpoints (`web/src/engine/anim/engine.ts:115-155,298-395`). This does not implement source-pulse → travel/disappear → target-pulse. Independent WAAPI calls have no shared lifecycle model, and clearing a layer does not itself prove that detached animations were cancelled.

**Expected.** Each spark has a deterministic per-link sequence: source border expands; the spark is created at the defined expansion point and the source border returns to rest; the spark follows the resolved direction; on arrival it disappears and the target border expands and returns to rest. Multiple sparks repeat their own creation/reception effects. Reverse and bidirectional links use actual travel endpoints. All effects finish inside the beat’s dwell, and reduced motion shows only the final visible state.

**Fix plan.**

1. Specify the timeline numerically before editing: source start, spark creation, travel start/arrival, target pulse and final rest for every spark index. Clarify whether creation occurs at peak expansion or after unexpansion; tests must encode that choice rather than the ambiguous phrase “after expansion”.
2. Build a pure timeline/value function shared by all spark counts and directions. Account for ring duration, staggering, minimum travel, arrival margin and total dwell so auto-advance cannot cut off the target pulse. Use `BeatLink.from`/`to`, not the unordered actor ring set.
3. Give `FlowAnimator` explicit ownership of its animation handles/session and cancel that ownership on replay, step change, stop and file change. Keep the `BeatPlayer` boundary narrow; do not scatter timeouts through Preact components or globally cancel camera animations.
4. Test event order and computed visibility, not element count alone. Include one/multiple sparks, flipped and bidirectional links, parallel lanes, very short dwell, pause/replay, step change, exit and reduced motion. Define how repeated bidirectional arrivals pulse borders rather than ignoring them.

**Validation.** Deterministic timeline unit tests with fake player/clock, real Chromium WAAPI assertions and filmstrips at source pulse, mid-travel, arrival and settled state in both themes. Then run animation/presentation e2e, `npm run check` and `npm test`.

## Dedicated presentation URL anchor

**Observed.** There is no location-hash/history integration in the presentation shell. `#present=<flow-id>` is absent. A flow id alone is not a globally shareable document address: workspace content is browser-local and the active file is restored locally.

**Expected.** In the same browser profile, `#present=<encoded-flow-id>` opens that flow from the restored active file once storage and the document are ready. Reload and Back/Forward preserve the navigation contract. Unknown/malformed ids and flows without an authored id fall back safely without changing document text. File changes and presentation exit cannot leave a stale anchor. No `#view=<name>` is introduced because named PDL views are being removed.

**Fix plan.**

1. Add a small pure hash codec and a narrow History/location port. Keep URL policy out of the UI-agnostic `FlowRunner`; a shell controller coordinates workspace readiness, player state and history.
2. Specify transition semantics before coding: direct load, explicit Present, natural end, explicit Exit, external file switch, cross-file flow goto, unknown flow and hash-originated start. Prevent feedback loops between hash writes and player state, and use push versus replace deliberately so Back does not trap the user.
3. Encode/decode the id, do not concatenate raw flow text into a hash, and never use the hash as document input. Direct links cannot promise access to another browser’s local workspace; document that limitation.

**Validation.** Unit-test codec and transition table with fake history. Browser-test direct load, reload, Back/Forward, unknown/malformed values, active-file mismatch, exit, file switch and upgrading client. Assert no document mutation and no external request, then run `npm run check`, `npm test` and built-app e2e.

## Hamburger menu needs task-based groups

**Observed.** `buildAppMenu` is mostly separator-delimited, although Export is already a submenu (`web/src/ui/appMenuEntries.ts:68-107,258-278`). `Menu` already supports submenus. Converting every separator block mechanically into another level would bury frequent actions and contradict the stated goal of keeping common commands reachable.

**Expected.** Group File, Layout/Workspace, Flows and Application by user task. Keep high-frequency commands prominent, advanced commands one level down, and every command’s id, checked state, disabled state and action intact. Persist no new UI state merely to represent grouping.

**Fix plan.** Write the top-level/group membership matrix first, including what stays top-level and why. Build that matrix in the existing pure `appMenuEntries` model and reuse `Menu`’s submenu primitive; do not create a third menu model or duplicate selection state in `AppMenu`. Update flat-order tests to assert the new structure and add browser keyboard tests for ArrowRight/ArrowLeft, Escape, focus return and viewport-safe placement. “Existing Menu tests cover this” is not sufficient evidence for the new hierarchy.

**Validation.** Focused model/component tests, complete menu e2e, axe scans, keyboard-only traversal and light/dark/narrow-viewport screenshots. Verify all previously available commands by stable id/test id, then run `npm run check` and `npm test`.

## Remove named views without deleting diagram layout persistence

**Observed.** ViewBar owns named views, tag chips, layout mode, positions, pin and hide (`web/src/ui/views/ViewBar.tsx:37-92,94-197`). Named `view` blocks also reach TypeScript/Go format and IR, hierarchy validation and CLI `--view`. The original proposal said to remove all layout/view helpers but simultaneously retain stored positions and Reset layout; that is internally incomplete.

**Expected.** Remove ViewBar, named view switching and PDL `view` blocks. Preserve one diagram’s layout data by promoting the surviving single-view concepts—layout mode, positions and any intentionally retained pin/hide data—to explicit top-level document state. Resetting routes never changes object positions. **Reset diagram layout** clears those positions and performs deterministic auto-layout in one undoable command, distinct from the existing **Reset workspace layout** panel command.

**Migration decision.** Reject legacy named `view` blocks and `drilldown ... view <id>` with clear diagnostics; no silent ignore or auto-migration. Document the manual conversion to top-level layout statements. Do not simply delete `Doc.views` and leave `pcdToState` with no position source.

**Fix plan.**

1. Define the post-view IR and top-level grammar first, including whether pin/hide/hideTag remain supported and where their UI lives. Update TypeScript and Go parser/printer/serializer/validation atomically, remove `viewName`/`useViewSession`/CLI view options and regenerate corpus/parity fixtures. Remove ViewBar CSS, strings and tests only after replacement behaviour is covered.
2. Add pure document operations for route reset and layout reset. **Reset all routes** with no selection clears every link’s waypoints and endpoint anchors; **Reset route** with exactly one selected connection affects only that link; object, mixed and multiple selections disable route reset. Each multi-object operation is one undoable command, not a loop of commits.
3. Put selection enablement in one shared command/policy model consumed by canvas and hamburger adapters. Keep CanvasController responsible for canvas commands and the layout engine behind its port. Auto-layout computes and persists all new positions atomically and deterministically.
4. Update hierarchy/drilldown code, `FILE-FORMAT.md`, `USER-GUIDE.md`, `SPEC.md`, `CHANGELOG.md`, architecture seeds and corpus. Add TS and Go diagnostics for rejected legacy syntax.

**Validation.** Test the full selection matrix, undo/redo, reload persistence, position preservation on route reset, deterministic layout and rejected legacy files. Run `npm run check`, `npm test`, `bash scripts/check-docs.sh`, `go test ./...`, `go vet ./...`, `staticcheck ./...`, complexity gates, corpus parity and built-app light/dark menu/context-menu e2e.

## Decomposition picker, complete embedded export and embedded editing

**Observed.** The decomposition target is a free-text input (`web/src/ui/HierarchyFields.tsx:44-92`) even though `WorkspaceManager.files()` exposes known files. Current `.pcd` export downloads only the root text (`web/src/ui/AppMenu.tsx:48-51`; `web/src/workspace/workspace.ts:659-663`). Existing `source` blocks embed program text, not child diagrams; there is no embedded-decomposition grammar or editor identity for a child inside a root file.

**Expected.**

- The child-diagram path is a keyboard-accessible picker of known workspace `.pcd` files, showing the stored relative path and preserving an unresolved legacy value visibly rather than silently clearing it. Clear decomposition remains a separate action. No named-view field is added because views are being removed.
- Current-file `.pcd` export asks **Keep linked decomposition** versus **Embed all decomposition** only when the root has reachable linked decomposition. “All” means every transitively reachable child, not every unrelated workspace file. The non-embedded option preserves the root’s linked representation and clearly requires the child files for portability. Mermaid/SVG/PNG and workspace ZIP behaviour do not change.
- Embedded export is all-or-nothing: every transitive relation is present and embedded, or no embedded file downloads. Missing, unparsable, invalid, cyclic or unreadable descendants produce actionable diagnostics; there is no partial “complete” export and no silent fallback to linked export. Export does not mutate the workspace.
- Embedded children appear as expandable children of their owning root file in the workspace explorer. Opening one uses the normal canvas/code/properties/flow editor, but its identity is a root file plus nested decomposition path—not a fake VFS file. Edits save into the root through the existing single writer and form one undoable root-document command.

**Fix plan.**

1. **Format/design first.** Add a discriminated decomposition target: linked path or embedded child with a stable logical path and recursive document. Avoid optional `path`/`document` combinations that allow invalid states. Define nesting/depth/size limits, child identity, path resolution, C4 level validation, duplicate ownership, cycle rules and linked↔embedded editing behaviour. Keep embedded source text as a separate concept. Land TS/Go parser, printer, IR serializer, recursive validation, docs and corpus parity together.
2. **Pure graph service.** Implement decomposition collection and embedding behind a `WorkspaceReader` port. Return a structured export plan/result containing ordered descendants, transformed root or diagnostics. Traverse transitively with cycle detection and deterministic output. UI asks for the choice and downloads only a successful result; it must not perform graph traversal itself. Revalidate the captured root revision before download so a prompt cannot export a different edit by accident.
3. **Derived tree, one document state.** Project embedded children into the explorer from the parsed root; do not insert duplicate child text into the virtual FS. Introduce a `DocumentRef` (root path plus nested object/path identity) and a resolver/editor adapter that reads and commits the nested document through the root. Define selection recovery after object rename/removal and preserve the current dirty-code/navigation safeguards.
4. **Picker and conversion safety.** Reuse a known-value path-picker port rather than maintaining a hand-edited parallel file list. Exclude invalid/self/cyclic choices where they can be determined and explain disabled choices. Changing an embedded child to linked (or deleting it) is potentially destructive: require an explicit action and preserve one-step undo.
5. Update `FILE-FORMAT.md`, `USER-GUIDE.md`, `SPEC.md`, `CHANGELOG.md`, architecture examples and CLI convert/validate/render behaviour. If CLI embedded export is exposed, use the same graph rules rather than a second implementation.

**Validation.** Unit-test picker candidates, nested identity, transitive multi-level export, shared/missing/cyclic/unparsable descendants, all-or-nothing failure, deterministic bytes and non-mutation. Add TS⇄Go corpus/parity and recursive round-trip tests. Browser-test embedded child editing, code/canvas sync, undo/redo, reload, nested navigation, export choice/cancel, and re-import of the downloaded file into a fresh workspace with no external files. Include keyboard/axe, light/dark tree/dialog screenshots and no-network e2e; then run all format, Go, complexity and repository gates.

## Known-value inputs and property hierarchy

**Observed.** `IconField` combines a free-text handle with a separate picker button (`web/src/ui/IconPicker.tsx:157-211`). Other known domains also have free-text fields, notably decomposition paths and flow goto file/flow or process target ids. Conversely, names, descriptions, technology, tags and custom properties are legitimately free text. Object sections currently order Identity → Metadata → Style → Decomposition → Advanced (`web/src/ui/PropertiesPanel.tsx:249-344`), and Icon is inside Style even though it writes the object’s identity-level `icon` field.

**Expected.** When the valid values are known at edit time, use a picker rather than requiring transcription. Icon is one direct dropdown/combobox control showing current preview and label—no adjacent text input plus extra picker button. Preserve search, project icons, Manage project icons, no-icon and unknown-legacy states. Property sections follow task priority: **Identity** (Name, Kind, Icon), **Style**, **Metadata**, **Decomposition**, **Advanced**. This ordering is a Laws-of-UX/task heuristic, not unsupported usage telemetry.

**Fix plan.**

1. Replace IconField’s two-editor model with one select-like control; a searchable rich popover is acceptable for the large icon catalogue, but it must have one trigger, one accessible name and one value. Support keyboard navigation/typeahead, Escape with focus return, outside dismissal and viewport-safe placement. Keep an unknown stored handle visible as a disabled/unresolved choice so loading a legacy file cannot erase it.
2. Extract the existing “write object icon and clear stale style override” operation as one reusable command; moving the control must not duplicate or lose that patch behaviour. Keep catalog filtering and icon-management operations separate from the trigger component.
3. Audit known-value fields and convert only actual closed domains: decomposition target, flow goto file/flow and process target are candidates; message endpoints become read-only under the selected-step item instead of gaining another editor. Use dependent options where goto flow depends on file, and preserve unresolved current values with diagnostics. Leave genuinely open text alone.
4. Move Icon into Identity and Style before Metadata without changing section ids or persisted expansion preferences. Add a DOM order assertion and verify that object/link property commands remain unchanged.

**Validation.** Replace free-text icon tests with selection behaviour tests; cover built-in/project/none/unknown icons, legacy override clearing, keyboard and focus, dependent pickers and section order. Update affected e2e selectors deliberately. Run property/icon/flow suites, axe, light/dark and narrow-viewport screenshots, `npm run check` and `npm test`.

## Flow Markdown notes with presentation panel

**Observed.** Flow description is parsed as one quoted line (`web/src/engine/format/parser.ts:691-699`) and exported through `prose`, which deliberately flattens and escapes it (`web/src/engine/format/flowMarkdown.ts:17-23,129-132`). The UI already uses a textarea, but an actual newline cannot safely round-trip through the current quoted-string printer/lexer. There is no presentation flag or Markdown renderer. Playback also reuses `description` for the current step and later for flow-level closing text, so adding a side panel must not overload that field again.

**Expected.** Existing one-line descriptions remain valid. Flow text supports headings, bold, italic, inline code, bullet/numbered lists and links, with a persisted **Show during presentation** flag. When enabled and non-empty, presentation shows sanitized flow-level Markdown in a non-modal side panel; otherwise no panel appears. Raw HTML is text, never markup; images and active/embed content are unsupported; links never auto-fetch and unsafe URL schemes are rejected. Markdown documentation export preserves supported structure rather than flattening it.

**Fix plan.**

1. Define a multiline flow-description block and presentation flag while retaining the legacy one-line form. Keep source text in IR; do not store rendered HTML. Land TS/Go parser/printer/serializer/diagnostics/corpus changes atomically and add multiline round-trip tests.
2. Implement one small, local safe-Markdown parser that returns a typed AST for exactly the listed subset. Render Preact elements/text nodes rather than `dangerouslySetInnerHTML`. Centralize URL policy and raw-HTML handling. Reuse the AST/policy for documentation export so app rendering and export cannot drift into different sanitization rules; define how headings nest under the exported flow heading.
3. Add separate `flowDescription` and current-step `description` state to the player. The panel is a labelled `aside`, does not steal focus, has a responsive narrow-screen layout, and triggers presentation refit when its presence changes available canvas size. Links are ordinary user-activated links with safe `rel` behaviour where relevant.
4. Update editor copy, strings, `FILE-FORMAT.md`, `USER-GUIDE.md`, `SPEC.md`, `CHANGELOG.md` and Markdown-export goldens. No remote renderer, webfont, image fetch or new runtime service; any proposed dependency would require the repository’s ADR process and is unnecessary for this subset.

**Validation.** Test every supported construct, nesting/escapes, multiline round-trip, raw HTML, `javascript:`/`data:` URLs, empty text, toggle persistence and no-panel state. DOM/e2e tests cover editing, reload, presentation visibility, canvas refit, keyboard/focus, axe and light/dark/narrow screenshots. Run focused vitest, `npm test`, `npm run check`, corpus parity, docs and no-network e2e.

## Selected flow-step properties: correct the existing model, do not recreate it

**Observed.** Step selection and an inline `StepInspector` already exist below the step list (`web/src/ui/flows/FlowPane.tsx:425-468,884-930,1089-1093`). Description and Camera are already common fields; msg/alt/par labels already exist. **Advanced step** is a disclosure for adding alt/par/goto, not a dialog containing this inspector. Message endpoints are currently editable text fields. Spark count/speed belong to the resolved **link style**, not to the step (`web/src/engine/model/types.ts:93-96,217-225`; `web/src/engine/flows/plan.ts:145-180`).

**Expected.** Keep one inline inspector and make its primary fields kind-correct: existing Label/Text/Note where supported, common Description and Camera, and read-only link endpoint context for message steps. Do not invent a Label for kinds whose IR has no label. For a message with a resolvable link, expose Spark count and Spark speed as **shared link animation** controls; other step kinds show no spark editor. Values use the existing 1–8 and 0.25–4× bounds.

**Fix plan.**

1. Reuse the existing `FlowSelection` and `makeActions`/`retext` path; no second selection store and no new Advanced-step dialog. Reorder/relabel the current inspector fields and make From/To read-only without dropping `linkRef` resolution or flip behaviour.
2. Resolve the selected message through the existing `resolveMsg`, including `linkRef` and direction-insensitive fallback. Add one pure operation that patches the resolved link’s style through `retext`. An unresolved/ambiguous message disables spark controls with a reason; never silently edit the first plausible link when `linkRef` is invalid.
3. Label the controls so users know the change affects every step using that link. If truly per-step busyness is wanted instead, that is a separate format/IR feature and must not be disguised as a link-style edit.
4. Centralize numeric bounds/validation rather than adding a fourth copy in the component. Preserve draft-focus behaviour for text edits and ensure editing a derived flow’s link style does not unnecessarily materialize a virtual flow.

**Validation.** Test each step kind, label/text mapping, read-only endpoints, identified and fallback link resolution, unresolved links, shared-style visibility across steps, invalid numeric input, undo/reload and derived-flow non-materialization. Run focused flow suites, flow e2e, axe, light/dark screenshots, `npm run check` and `npm test`.

## Previously closed

Closed items from the last round stay in [docs/archive/](docs/archive/). The coordinated plan that drove them stays in [docs/BUGS-RESOLUTION-PLAN.md](docs/BUGS-RESOLUTION-PLAN.md) as the record of how each one was triaged and gated.

Closed items, in the order they were archived:

- `bugs-menu-viewport-contract.md` — one viewport-safe contract for every menu.
- `bugs-long-filenames-file-actions.md` — a long name never hides file actions.
- `bugs-presentation-playback.md` — presentation framing, sparks and transport.
- `bugs-default-virtual-flow.md` — a link-only diagram is presentable at once.
- `bugs-hosted-release-verification.md` — the live site proves its own revision.
- `bugs-visible-default-grid.md` — a fresh profile shows the dots grid.
- `bugs-route-validation.md` — routes are validated as a whole polyline.
- `bugs-entity-label-centering.md` — labels sit on their rendered centre.
- `bugs-project-icon-registry.md` — 43 built-ins plus portable project icons.
- `bugs-c4-drill-down.md` — genuine C4 decomposition with embedded source.
