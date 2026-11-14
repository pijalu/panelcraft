<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX-03 Make Files an on-demand workspace browser

**Status:** implemented, validated and reviewed.

## Observed behavior

Files and Flows share one tabbed sidebar. Although UX-02 made that container collapsible and closable,
the two tools still cannot be shown, moved, or closed independently.

## Expected behavior

- Files is an independent view of the browser-local virtual filesystem. It starts collapsed and opens
  from View without changing the active file, open tabs, code buffer, or editing selection.
- Flow Steps is a separate initially closed on-demand panel; the larger FLOW-01 editing scope remains
  queued. Existing flow selection, editing, playback, and sequence export continue to work.
- Both panels support the established collapse, close, dock, float, resize, reload, and focus behavior.
- Closing Files never closes a file or discards edits. Tabs, quick search, import/export, snapshots,
  unsaved indicators, and storage warnings remain available without the tree.

## Executed plan

1. Removed the shared Files/Flow Steps tab strip. Files remains registered as `sidebar`; Flow Steps is
   an independent `flows` panel. Fresh layouts close Flow Steps by default; existing layout v2 records
   normalize the missing panel to closed without discarding other preferences.
2. Routed every action through the existing manager, parser, code-sync, player and flow ports. Closing
   Files only closes its browser; open tabs, dirty buffers, snapshots, exports and quick search remain
   independent. Flow selection/scope/step moved to App session state so docking and close/reopen retain it.
3. Added Files and Flow Steps to every dock and the View menu. Quick search opens Files only for a result
   selection; `Escape` restores search focus. Flow Steps can be opened and docked without opening Files.
4. Added unit/component and browser coverage for keyboard-only use, actual download capture, snapshots,
   dirty editing, search with Files closed, four docks, create/close/reopen and persistence. Ran axe
   WCAG 2.1 AA scans and captured light/dark open, docked, floating, dirty and closed states.
5. Rebuilt `web/dist`, ran focused and full gates, reviewed screenshots and ARIA snapshots, then archived
   the item and prepared its separate commit.

## Defects found during validation

- Initial axe scans found an unnamed step-kind selector and insufficient CodeMirror gutter/light-string
  contrast. Added the accessible name and AA-compliant colors; no axe rules were disabled.
- Screenshot review found that docking Flow Steps reset its selected flow. Reproduced it in a component
  test and retained selection in App session state across panel remounts.
- Search-to-panel keyboard testing exposed an overlay/focus race. The test now waits for overlay closure
  and explicitly focuses View; the focused three-test keyboard journey passed nine consecutive repeats.

## Validation evidence

- `npx vitest run src/ui/workspaceLayout.test.ts src/ui/uiLayout.test.ts src/ui/AppUx03.test.tsx src/ui/flows/FlowPane.test.tsx` — 4 files, 41 tests passed.
- `npx vitest run src/ui/AppUx03.test.tsx src/ui/App.test.tsx src/ui/p2-flowedit.test.tsx src/ui/flows/FlowPane.test.tsx` — 4 files, 83 tests passed.
- `npx playwright test e2e/ux03-files.spec.ts` — 4 tests passed; keyboard journey also passed 9/9 stress repeats.
- `test-results/ux03-accessibility-report.json` — 4 expected reports, 0 unexpected, 0 flaky; light/dark axe scans clean.
- Decoded light/dark ARIA snapshots confirm named `Workspace files` and `Flow step editor` regions, a named
  `Step type` combobox, and Files content absent while closed with editor chrome retained.
- `test-results/screenshots/` — reviewed fresh, independently opened, docked, floating, dirty, organizing,
  closed, restored and reopened states in light and dark. Alignment, truncation, contrast and focus are
  legible; docking retains the selected flow and closing Files preserves tabs and unsaved changes.
- `npm run check` — TypeScript and ESLint passed.
- `npm test` — 88 files, 926 tests passed; coverage thresholds passed.
- `npm run build` — production bundle passed; existing chunk-size warning remains.
- `npx playwright test` — 81 tests passed.
- `go vet ./...` and `staticcheck ./...` — passed with no diagnostics.
- `gocyclo -over 15 cmd internal web` — passed (`OK`). Advisory `gocognit -over 15` and stricter
  `gocyclo -over 12` scans report existing parser/converter/test functions; UX-03 changes no Go files.
- `go test -count=1 -race -cover ./...` — all packages passed.
- `bash scripts/check-docs.sh` — 9 docs checked; links and PCD blocks valid.
- `bash scripts/check-selfcontained.sh web/dist` — no external-origin resource loads.
- `git diff --check` — passed. Post-commit clean-worktree result is recorded below.

FLOW-01 remains queued: this item supplies its independent panel prerequisite only, not canvas-assisted
targeting or Step cards.
