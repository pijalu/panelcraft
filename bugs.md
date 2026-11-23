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

### Presentation dock can leave content partially hidden

Observed:

- The zone marked by the arrow in
  `/Users/muaddib/Library/Caches/goa/images/goa-image-3117671125.png` shows a
  partially hidden element at the bottom of the drawing/presentation surface. The
  capture alone does not establish whether the obscured element is diagram
  content or narration chrome.

Expected:

- The dock, canvas and narration have distinct visible regions. No active-step
  object, connector label, narration or control is clipped behind the dock,
  including when text wraps or the viewport is narrow.

Review:

- **Severity: medium.** Playback controls remain reachable, but partially hidden
  content cannot be read reliably.
- Presentation reserves a fixed 96 px bottom inset
  (`web/src/ui/app.css:487-498`), while the fixed dock has content-driven height:
  controls, progress dots, choices, narration and safe-area padding
  (`app.css:505-576`). Those heights can diverge. Refitting reacts to presentation
  entry, window resize and the optional asides, but not explicitly to dock height
  changes (`web/src/ui/PresentDock.tsx:139-168`).
- UX lens — **Flow**: presentation feedback and content must remain visible
  without forcing the viewer to recover hidden context.

Fix plan and test approach:

1. In the same reproduction, identify the obscured DOM/SVG element and record its
   bounds, the canvas bounds and the dock bounds before changing layout code.
2. Add a browser regression asserting that the canvas's usable bottom equals the
   dock's top and that all active-step bounds remain inside the visible canvas.
3. Replace the fixed inset with one measured dock-height value shared by the
   canvas reservation and advance surface; refit the camera after dock size
   changes. Include safe-area padding and wrapped content in that measurement.
4. Exercise short/long narration, step descriptions, choices, multiple progress
   dots, narrow viewports and both themes. Capture initial, playing, paused and
   settled frames and review them against the style-guide checklist.
5. Run the presentation/framing Playwright suites and `npm run check`.

### Show the code view while drawing

Observed:

- Code is not showing while drawing. No separate capture or reproduction path was
  supplied for this item.

Expected:

- A fresh drawing session shows the editable diagram source alongside the canvas.
  Adding or editing an element on the canvas updates that source within the
  documented debounce, while the explicit single-pane toggle remains available.

Review:

- **Severity: high.** Hiding the source removes the other half of the core
  canvas/code authoring workflow and makes synchronization failures hard to see.
- This is pinned by the current default rather than caused by a missing editor:
  `web/src/ui/uiLayout.ts:78-91` initializes Code as `collapsed`, and
  `web/src/ui/uiLayout.test.ts:11-21` explicitly expects that state at every
  viewport. It conflicts with the product overview's requirement that diagram
  source is always visible (`docs/SPEC.md:15-17`); the split-layout and explicit
  single-pane option remain specified at `docs/SPEC.md:151-157`.
- UX lens — **Mental Model**: visible source keeps the relationship between PDL,
  canvas objects and saved files predictable.

Fix plan and test approach:

1. Reproduce in a fresh browser profile and capture the initial shell, then add an
   object and a connector while keeping Code visible.
2. Replace the default-layout assertions with the intended visible-Code contract
   and add a browser regression proving that the editor is visible and receives
   both canvas edits. This is an intentional contract correction, not removal of
   the old assertion to make the implementation pass.
3. Change the fresh-profile default so Code opens beside the canvas; keep its
   docking, collapse and single-pane controls functional, and preserve explicit
   saved layout choices.
4. Verify canvas → code and code → canvas synchronization, diagnostics, undo and
   redo with Code open, collapsed and reopened. Review usable canvas/code sizes at
   wide and narrow viewports in both themes.
5. Run `npm run check`, the layout/code-sync unit suites and the drawing, shell,
  history and accessibility Playwright scenarios; attach before/after captures.

Closed items live in [docs/archive/](docs/archive/).
