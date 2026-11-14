<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-02 Reorganize the shell into a canvas-first dockable workspace

**Status:** closed after implementation and validation.

## Observed behavior

Files, Shapes, and Properties previously consumed permanent dock space, Code opened only at wide
viewport sizes, and panels could collapse or resize but could not close, change dock, or float.
Restored-layout adoption could overwrite an early interaction, and later validation showed that a
resize gesture could accidentally become a native panel drag.

## Expected behavior

- Fresh workspaces open Shapes only; Files, Code, and Properties start as reopenable rails while
  file tabs and canvas controls remain available.
- Every secondary panel has distinct collapse and close commands, left/right/bottom/floating
  destinations, keyboard-accessible docking commands, resizing, and an always-available View menu.
- The complete versioned arrangement is browser-local workspace settings, never PDL data. Reload
  restores it without overwriting an early interaction or losing an unapplied code buffer.
- Viewport recovery keeps the canvas and panels reachable. Reset restores a known-safe arrangement.
- Presentation hides docked and floating chrome and restores it on exit; code/canvas synchronization
  and document text remain intact.

## Executed plan

1. Replaced fixed-position assumptions with layout version 2: panel mode, dock, order, widths,
   heights, floating bounds, and properties-section state. Added migration and corrupt-value
   normalization with safe defaults.
2. Added shared `PanelHost`, `DropZone`, `HostedPanel`, and `ViewMenu` components. App content is
   registered once and hosted in left, right, bottom, or floating zones; Code is independent of the
   canvas column.
3. Added HTML5 drag/drop indicators, native-details keyboard alternatives, close/reopen/reset,
   floating move/native resize, docked splitters, focus transfer, and existing panel shortcuts.
4. Persisted structural changes immediately, debounced resize writes, serialized autosave flushes,
   preserved early interactions, and recovered restored layouts against the actual viewport.
5. Updated legacy unit/browser setups to open explicitly the panels their scenarios use rather than
   weakening assertions or restoring the old production defaults.
6. Extended presentation coverage to a moved floating Code panel and added an unapplied-buffer
   docking/floating/close/reopen regression.
7. Captured and reviewed the complete light/dark filmstrip, ran fresh and narrow axe scans, updated
   the changelog, and archived this plan.

## Defects found and fixed during validation

- Stored settings arriving after a first click could replace that interaction. A touched/early-save
  path now preserves and persists the user's layout.
- Open horizontal panels could leave too little canvas after a viewport reduction. Recovery now
  collapses horizontal panels until the canvas minimum is available, while retaining their rails.
- Empty side docks had no drop target; they now retain an 8 px target. Collapsed floating panels keep
  their floating host, and bottom splitters live inside a panel wrapper rather than becoming
  full-width flex siblings.
- A bottom-height drag could initiate native Code dragging and drop it into another dock. Splitter
  pointer-down now prevents and stops that gesture; a component regression checks the canceled event.
- Immediate autosave requests could finish out of order. Flushes now drain serially, and quota
  failures retain pending state without retry-looping. This was a valid persistence race, but it was
  not the cause of the native drop.
- The narrow empty-state content could center-overflow into the header. Safe centering and scrolling
  keep it below the header, with a browser geometry assertion.
- Existing E2E helpers assumed legacy open panels. They now opt into those panels explicitly. Two S5
  helpers also use the established hydration wait plus `ControlOrMeta+A`; the keyboard UX scenario
  waits for the specified post-float focus transfer before issuing the next command.
- The service-worker cache assertion now polls CacheStorage visibility after activation instead of
  taking a one-shot sample. No service-worker application code changed.

## Test approach and results

- Focused layout/component/persistence run: **6 files / 42 tests passed**.
- `npx playwright test e2e/ux02-workspace.spec.ts`: **3 passed** before the dirty-buffer case was
  added; the final full browser gate includes all **4 UX-02 tests**.
- Keyboard-only stress run after synchronizing its focus steps: **8/8 passed**, no retries.
- `npx playwright test e2e/ux02-workspace.spec.ts --grep 'unapplied code'`: **1 passed**.
- Fresh and narrow light/dark axe scans passed within the UX-02 filmstrip. Existing light/dark shell,
  dialog, reduced-motion, offline, no-network, presentation, and performance scenarios also passed
  in the full gate.

### Accessibility evidence

The focused JSON report at `test-results/ux02-accessibility-report.json` reports **2 expected, 0
unexpected, 0 flaky**. Its decoded fresh light/dark ARIA snapshots expose the View group, named
Show files/code/properties controls, the named Shapes drag/keyboard-docking button, the Shapes
separator, template buttons, file tab, and the existing diagnostic status. Focus assertions cover
open, dock, float, collapse, close, reopen, and reset. Axe scans cover both fresh and recovered
narrow layouts in both themes.

### Visual review

Reviewed the actual `test-results/screenshots/ux02-{fresh,left,drag,right,bottom,floating,collapsed,
closed,reopened,reset,restored,narrow}-{light,dark}.png` sequence against the style-guide checklist.
Panel edges and dock indicators are aligned, text and focus states remain legible in both token
schemes, floating panels retain their resize affordance, and restored/narrow states have no document
horizontal overflow. The narrow header/template overlap found in the first review was fixed and the
captures were regenerated. No external assets or animation ghosting are present.

## Validation evidence

All commands were run separately and their actual output inspected:

- `npm run check`: TypeScript and ESLint passed.
- `npm test`: **87 files / 923 tests passed**; coverage thresholds passed.
- `npm run build`: passed; the existing bundle-size warning remains.
- `npx playwright test`: **77 passed**, including all UX-02, axe, offline/no-network, presentation,
  dirty-buffer, and performance scenarios.
- `go vet ./...`: passed.
- `staticcheck ./...`: passed.
- `go test -count=1 -race -cover ./...`: passed.
- `gocognit -over 15 .`: unchanged pre-existing findings in vendored flatted, existing Go tests,
  corpus parity, and Mermaid conversion; no Go code changed.
- `gocyclo -over 12 .`: unchanged pre-existing findings in vendored flatted and existing Go
  parser/printer/lexer/tests; no Go code changed.
- `bash scripts/check-docs.sh`: documentation links and PCD fences passed.
- `bash scripts/check-repo-clean.sh --worktree`: passed after the UX-02 commit.
