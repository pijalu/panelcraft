<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queue bug: pan the canvas with a secondary/middle mouse drag

Source: `bugs.md`, queued item 5.

## Review and reproduction scope

`CanvasController.beginPanOrHalo` starts camera panning for middle-button or
Space+primary-button presses, but not for the secondary (right) mouse button.
Consequently, a right-button drag leaves the world transform unchanged. The
canvas shell also handles every `contextmenu` event by opening its editing menu,
so releasing that drag activates a menu instead of completing a camera gesture.
Middle-button panning exists, but its pointer press is not cancelled, leaving the
browser's native middle-click behavior available to interfere with the gesture.

The required distinction is movement, not button alone: a moved secondary-button
drag pans and suppresses the context menu; a stationary secondary-button click
continues to open the existing canvas menu. Primary-button selection/editing,
Space+drag, touch-style primary pointer input, wheel/trackpad panning and zoom,
and keyboard navigation retain their current behavior.

## Test and implementation plan

1. Add controller regressions for secondary and middle-button drags over an
   object. Require screen-space camera movement, cancelled native press behavior,
   unchanged objects/selection/undo history, and suppression of the context menu
   after a moved secondary-button drag. Add a stationary secondary-click control
   proving that its context menu remains available.
2. Add a real-browser regression that drags from a selected object with the
   secondary button, checks the world transform and absence of the context menu,
   and proves object geometry, selection, and document text are unchanged. Repeat
   with the middle button, then verify a plain right-click still opens the menu.
   Exercise existing wheel, Space+drag, keyboard, and primary-pointer navigation
   through the focused controller/browser suites. Capture and review both themes
   and run accessibility scans.
3. Run the new tests before implementation and record the actual failures.
4. Make the smallest controller change: include the secondary button in the pan
   mode, cancel native pan presses, remember whether a secondary pan moved, and
   stop only that gesture's context menu before it reaches the shell. Do not
   change context-menu commands or any document mutation path. Update the user
   guide's panning instructions and the canvas navigation requirement wording.
5. Run focused and full unit/coverage/static checks, related Playwright scenarios,
   accessibility checks, and light/dark screenshot review. Run every required Go
   quality command separately and document only unrelated pre-existing warnings.
6. Record the implementation and evidence here, close the queue item, and commit
   only this mouse-panning fix.

## Implementation

Secondary and middle presses now enter the existing camera-pan mode and cancel
the native press default. Movement changes only the viewport transform; object,
selection, document, and undo paths are untouched.

Chromium emits `contextmenu` immediately after secondary `pointerdown`, before
any movement. The controller therefore cancels that native event while a
secondary pan is in progress. On release, a stationary click dispatches the
deferred menu event at the release target, preserving the shell's existing menu.
Any movement marks the gesture as a pan and suppresses late native menu events
instead. The long-menu viewport concern reported during this fix is queued
separately as `bugs.md` item 7 and is intentionally outside this change.

## Validation evidence

- Controller RED: `npx vitest run web/src/ui/CanvasController.test.ts
  --coverage.enabled=false --reporter=dot` produced 2 failures/62 passes. Both
  secondary and middle drags reported `down.defaultPrevented === false`; the
  stationary secondary-click control passed.
- Browser RED: `npx playwright test e2e/canvas-mouse-panning.spec.ts
  --reporter=line` failed in both themes after the secondary drag. The expected
  world transform was `translate(90 60) scale(1)` but remained unset; the failure
  screenshot shows the editing context menu open over the selected object.
- The first browser attempt stopped before the gesture because collapsing Code
  unmounts `.cm-content`. The test plan was corrected to capture the source before
  collapsing and reopen Code for the final source-preservation assertion; the
  rerun above then reached and reproduced the actual panning defect.

- Event-order RED: instrumented Chromium reported `pointerdown 2` →
  `contextmenu 2` → eight `pointermove` events → `pointerup 2`. The first
  implementation panned correctly but left the already-open menu visible. Tests
  were updated to reproduce that native order; the controller suite again failed
  2/64 before the deferred-menu implementation.
- Focused GREEN: the same controller command passed 64/64. The focused browser
  scenario passed 2/2 after the deferral fix, including no menu after either
  drag, preserved geometry/source/selection, stationary menu behavior, wheel,
  keyboard reset, Space+drag, axe scans, and both screenshot captures. Waiting
  for the menu's first item to receive focus before Escape removed a test-only
  race with the menu effect installing its keyboard handler.

- `npm test`: 117 files and 1,321 tests passed with coverage thresholds.
  `CanvasController.ts` reached 85.39% statements and 91.18% lines.
- `npx vitest run --reporter=dot`: all 119 files and 1,329 tests passed,
  including performance suites.
- `npm run check`: TypeScript, service-worker TypeScript, and ESLint passed.
  The first run reported new complexity violations in `onPointerMove` (13) and
  `onPointerUp` (18); extracting the pan and deferred-menu helpers preserved
  behavior and brought both methods back within the limit before the green run.
- `npm run build`: production bundle completed successfully.
- `npx playwright test e2e/canvas-mouse-panning.spec.ts
  e2e/doc01-context-menu.spec.ts e2e/p0-regressions.spec.ts
  e2e/p1-geometry.spec.ts e2e/p3-a11y-map.spec.ts e2e/p3-commands.spec.ts
  e2e/p6-minimap.spec.ts e2e/s1-create.spec.ts --reporter=line`: 21/21 passed,
  covering both new gestures, existing context-menu commands, document
  preservation, geometry, keyboard navigation, mini-map navigation, and creation.
- Reviewed `test-results/screenshots/canvas-mouse-panning-{light,dark}.png`.
  Both settled frames retain the selected object and its overlay, unchanged
  geometry, a synchronized mini-map, and complete theme parity with no clipping,
  ghosting, or context menu. Axe reported no WCAG A/AA violations in either
  theme. Jakob's Law/Mental Model review found the conventional drag navigation
  and stationary-click distinction consistent; Doherty feedback is immediate.
- `bash scripts/check-docs.sh`: all links and PDL fences passed.
  `bash scripts/check-jargon.sh HEAD`: no opaque identifier-only references.
  The first requirement edit tripped the identifier gate; retaining the original
  tagged requirement and adding a plain-language clarification passed.
- `go vet ./...` and `staticcheck ./...`: passed.
  `go test -count=1 -race -cover ./...`: all packages passed.
- `gocognit -over 15 .` and `gocyclo -over 12 .` reported only pre-existing
  warnings in untouched Go parser/printer/CLI tests, the icon generator, and
  vendored `node_modules/flatted`; this TypeScript-only fix added none.
- `git diff --check`: passed.

Residual behavior: a stationary secondary click opens its menu on release rather
than on the browser's earlier native menu event, allowing the controller to
distinguish it from a drag. Long-menu viewport containment remains queued as
`bugs.md` item 7, separately from this fix.
