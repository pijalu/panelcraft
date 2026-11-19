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
- `gocyclo -over 15 cmd internal web` (CI fails >15; target is ≤10. Scoped paths
  are required: `node_modules` ships Go code that would fail a bare `.` scan)
- `go test -count=1 -race -cover ./...`
- Fix any issues.
 ! For cognitive and cyclomatic complexity, Pre-existing warnings are acceptable only if they are unrelated to the change and explicitly noted !

 At the end of the session - the bug list should be empty, change committed and this file should only contain the guidelines for bug reporting.
 If new items are added, restart the process.

 Use goals to execute the fix plan - focus on micro tasks goals with new contextto lower context usage - use todos for micro tasks that should share context

 Commit at the end of each fix with a clear and descriptive commit message

## Report format
Describe the bug or feature request under `# To fix` below. Keep one section
per item with a short title, the observed behavior, and the expected behavior.
Copy this template for each new item:

### Short title of the item

Observed:

- What actually happens, with the exact command, screen or file that shows it.

Expected:

- What should happen instead, stated so a test could check it.

Fix plan and test approach:

1. Reproduce it and record the failing command or capture.
2. Add the failing test or regression that proves the defect.
3. Make the smallest change that fixes it, on both language sides when the file
   format is involved.
4. State the validation: the commands to run and the captures to review.

# To fix

### Presentation keeps the editor selection and resize overlay

Observed:

- `node test-results/template-names/probe.mjs` selects an element in each shipped
  template, opens Flow Steps, and starts presentation. C4, Flow, and Mermaid each
  retain `pc-selected` and eight `.pc-resize-handle` elements; the handles follow
  the presentation camera. Captures: `test-results/template-names/*-presented.png`.

Expected:

- Presentation shows flow highlighting, badges, and animation, but no editor
  selection outline, resize handles, link handles, halos, or editing guides.
- Exiting presentation restores the prior selection and its normal editing
  handles without changing the document.

Fix plan and test approach:

1. Add a browser regression for select → Flow Steps → present for every template;
   assert the editor chrome is absent throughout camera movement and restored on exit.
2. Add controller coverage proving that hiding editing chrome does not clear the
   underlying selection and that later renders cannot repaint it in presentation.
3. Make the smallest controller/shell change that suppresses only editing chrome;
   keep the separate flow-animation layer intact.
4. Run focused unit/E2E tests, then the complete browser suite and light/dark
   screenshot review.

### Template item names require an end-to-end guard

Observed:

- The user reports unnamed items across all templates. The local probe above has
  not reproduced missing object names: immediately after insertion and after
  reload, C4 shows Customer/Shop/Payment provider, Flow shows Web app/API, and
  Mermaid shows Service A/Service B in the SVG, accessible names, and Properties.
- Existing browser coverage checks only one C4 object id, not every template's
  names through selection, persistence, flow display, and presentation.

Expected:

- Every shipped template preserves every authored item name in the canvas,
  accessible object name, Properties, flow rows, and presentation narration.

Fix plan and test approach:

1. Turn the probe into a data-driven browser regression covering all templates,
   every object, reload, Properties, and presentation.
2. If any state drops a name, localize that projection and add a focused unit
   regression before changing it; do not patch template text to hide a shared bug.
3. Validate with the focused browser test and the complete E2E suite; record any
   additional reproduced naming defect here before fixing it.

### Responsive header and collapsed default workspace

Observed:

- The wordmark remains visible on narrow screens, Present includes a text label,
  the hamburger precedes Present instead of being rightmost, and a fresh/reset
  workspace opens Shapes while the other panels are collapsed.

Expected:

- Below 720 px only the brand icon remains, with `alt="PanelCraft"`; the wide
  wordmark never causes a duplicate accessible announcement.
- Present is icon-only with the `Present a flow` tooltip and accessible name; the
  hamburger is the rightmost header control.
- A fresh or reset workspace exposes Files, Flow Steps, Shapes, Code, and
  Properties as collapsed rails. Saved user layouts still restore unchanged.

Fix plan and test approach:

1. Add wide/narrow browser assertions for visibility, accessible names, tooltip,
   control order, horizontal containment, and all five default rails.
2. Update the pure layout-default tests and make pre-existing panel scenarios
   open their target panel explicitly rather than relying on the old default.
3. Implement the header order/CSS and the one-value default-layout change.
4. Run focused tests, the complete unit/E2E suites, and wide/narrow light/dark
   screenshot review.

Closed items live in [docs/archive/](docs/archive/).
