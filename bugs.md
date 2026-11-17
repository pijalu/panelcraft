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
- `bugs-step-properties.md` — selected message steps edit their resolved link's shared animation.
- `bugs-hamburger-task-groups.md` — the menu is grouped by user task without losing a command.
