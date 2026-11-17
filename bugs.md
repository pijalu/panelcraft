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

## Hamburger menu needs task-based groups

**Observed.** `buildAppMenu` is mostly separator-delimited, although Export is already a submenu (`web/src/ui/appMenuEntries.ts:68-107,258-278`). `Menu` already supports submenus. Converting every separator block mechanically into another level would bury frequent actions and contradict the stated goal of keeping common commands reachable.

**Expected.** Group File, Layout/Workspace, Flows and Application by user task. Keep high-frequency commands prominent, advanced commands one level down, and every command’s id, checked state, disabled state and action intact. Persist no new UI state merely to represent grouping.

**Fix plan.** Write the top-level/group membership matrix first, including what stays top-level and why. Build that matrix in the existing pure `appMenuEntries` model and reuse `Menu`’s submenu primitive; do not create a third menu model or duplicate selection state in `AppMenu`. Update flat-order tests to assert the new structure and add browser keyboard tests for ArrowRight/ArrowLeft, Escape, focus return and viewport-safe placement. “Existing Menu tests cover this” is not sufficient evidence for the new hierarchy.

**Validation.** Focused model/component tests, complete menu e2e, axe scans, keyboard-only traversal and light/dark/narrow-viewport screenshots. Verify all previously available commands by stable id/test id, then run `npm run check` and `npm test`.

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

- `bugs-present-hash-anchor.md` — a presentation link resolves in the reader's own workspace.
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
