<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed item: hamburger menu task groups

**Bug entry removed:** "Hamburger menu needs task-based groups" in `bugs.md`.

## Membership matrix (published before the code)

The application menu has four task groups. High-frequency commands stay on the
root surface (Pareto, Fitts: fewer acquisitions); specialized commands sit one
level down in a named submenu (Hick, proximity, common region). A command belongs
to exactly one place; no id, test id, checked value, disabled value or action is
duplicated or changed.

| Task group | Root row (stays prominent) | Named submenu | Commands inside the submenu |
|---|---|---|---|
| File | **Import files…** (`tb-import-files`), **Export current file** (`menu-export-current`) with the four formats unchanged | `menu-group-file` — **File & data** | `tb-import-zip`, `tb-export-zip`, separator, `tb-snapshots`, `tb-clear-data` |
| Layout / workspace | — | `menu-group-layout` — **Layout & workspace** | five panel toggles (`view-panel-*`), grid radios and snap (`view-grid-*`), `reset-workspace-layout`, `menu-reset-diagram-layout`, `menu-reset-all-routes` / `menu-reset-route` |
| Flows | **Open Flow Steps** (`app-menu-flows`), **Present** (`app-menu-present`) | none: both commands are frequent and adjacent | — |
| Application | **History** (`history-open`) | `menu-group-application` — **Application** | three theme radios (`app-theme-*`), `tb-ephemeral` checkbox, conditional `app-install` / `app-update-restart` |

Root order is Import files, Export current file, File & data, Open Flow Steps,
Present, Layout & workspace, History, Application, so each task's rows sit
together. Groups with no submenu (Flows) are represented by adjacent prominent
rows.

Why these stay root-level: import and export-of-current-file begin the primary
open/edit/share loop; opening Flow Steps and Present are the two flow actions and
already share one task; History is the recovery action used after an edit. ZIP
file management, layout resets, grid preferences, snapshots and data clearing
are deliberate, less frequent choices. Theme, private mode, install and update
are application preferences/lifecycle, not diagram work. No UI state records
which group is open: `Menu` owns the transient submenu state, as it does for the
pre-existing Export submenu.

## Why this was a defect

`buildAppMenu` was a long, mostly separator-delimited list: four file commands,
three themes, five panel toggles, four grid commands, three resets, two flow
commands, history and up to five application/workspace commands were all on one
surface. On a short viewport the list scrolled, so a frequent command could sit
below the fold while advanced commands took equal visual weight. Separators
carried the only grouping, and they have no accessible name: a screen-reader
user heard one undifferentiated menu.

## Fix approach

- Build the matrix in the pure `appMenuEntries` model. Existing builders for
  themes, panels, grid, resets, install/update and export formats are reused
  unchanged; only the composition of root rows and submenus changes.
- Reuse `Menu`'s existing `submenu` entry kind. No third menu model, no
  duplicated selection/enablement state in `AppMenu`, no new persisted state.
- Add three labelled submenu rows to the typed string catalog.
- Update the flat-order unit test into a membership/parity test and the e2e
  helper so a command can be reached by its stable test id regardless of its
  group. Add browser proof of ArrowRight/ArrowLeft, Escape and focus return,
  measured viewport placement, axe, light/dark and narrow captures.

## Evidence

### Red before the fix

- `npx vitest run web/src/ui/appMenuEntries.test.ts --reporter=dot` —
  **1 file failed, 2 tests failed / 15 passed**. The new membership assertions
  saw the old flat root (`import-zip`, `view-grid-*`, `snapshots`, `private`,
  `clear-data` at the top) and no `group-file` / `group-layout` /
  `group-application` submenu entries.
- `npx playwright test e2e/bugs-hamburger-task-groups.spec.ts --reporter=line`
  against the bundle built from unmodified sources — **8 failed**: the named
  group rows and their submenu surfaces did not exist.

### Green after the fix

- `npm run check` — exit 0 (`tsc --noEmit`, service-worker `tsc`, `eslint .`).
- `npm test` — exit 0, **148 files, 1616 tests passed**, coverage thresholds
  green. The two model tests now pin the root order, every command's group and
  a 34-id/test-id parity list; `Menu.test.tsx` and the shared test helper were
  kept green with the new hierarchy.
- `npx vitest run web/src/ui/appMenuEntries.test.ts web/src/ui/Menu.test.tsx
  --reporter=dot` — **2 files, 33 tests passed**.
- `npx playwright test e2e/bugs-hamburger-task-groups.spec.ts
  e2e/bug07-menu-viewport.spec.ts --reporter=line` — **13 passed**, covering
  ArrowRight/ArrowLeft, Escape from inside a group, focus return after a
  command, measured placement at 1280×420 and 480×720, axe scans, and the
  existing viewport/scroll contract on the regrouped submenu.
- `npm run build` — exit 0; production bundle built from the changed source.
- `npx playwright test --workers=4 --reporter=line` — **227 passed (2.1m)**.
  The default six-worker run was timing-sensitive in unrelated presentation
  and spark-animation specs; with four workers the full suite is green.
- `go vet ./...` and `staticcheck ./...` — exit 0.
- `go test -count=1 -race -cover ./...` — all packages ok (the same coverage
  as before; this change touches no Go code).
- `gocognit -over 15 .` and `gocyclo -over 12 .` — exit 1 with pre-existing
  warnings only: vendored `node_modules/flatted/golang`, long parser/printer
  and IR helpers, and large table/test functions. None is in a file touched by
  this item.
- `bash scripts/check-docs.sh` — OK, 9 docs with resolving links and valid
  `.pcd` fences. `bash scripts/check-selfcontained.sh` — OK, no external-origin
  resource loads in `web/dist`.

### Issues found during validation

The new browser keyboard test exposed three real defects in the existing menu
primitive, each fixed without weakening the assertion:

1. **ArrowRight opened a group but focus stayed on its row.** A submenu is
   `visibility: hidden` for the commit in which it is measured, so the browser
   refused `focus()`. The autofocus layout effect now also re-runs when
   placement makes the surface visible.
2. **End inside a group jumped back to the root menu.** Nested menus live in
   the parent's DOM and navigation keys bubbled to the parent handler. Handled
   arrow/Home/End keys now stop propagation.
3. **The last command in a scrolling group could sit a few pixels below the
   visible edge.** The submenu's capture-phase scroll listener fed its own
   clipped height back into placement, shrinking `maxHeight` under the focused
   row. Internal submenu scrolls are now ignored by that listener; the measured
   1280×420 case keeps the focused row inside the surface.

## Screenshot evidence and vision review

Captured by `e2e/bugs-hamburger-task-groups.spec.ts` into
`test-results/screenshots/`:

- `bugs-hamburger-root.png`, `bugs-hamburger-group-layout.png`
- `bugs-hamburger-root-light.png`, `bugs-hamburger-root-dark.png`
- `bugs-hamburger-application-light.png`, `bugs-hamburger-application-dark.png`
- `bugs-hamburger-group-1280.png`, `bugs-hamburger-group-480.png`

Reviewed against the style guide and the relevant laws — Hick, Pareto, Fitts,
proximity and common region. The root surface shows five frequent commands and
three clearly named submenu rows with consistent 32 px height, chevrons and
focus ring; the checked theme radio and its group label read unambiguously in
both themes. Light and dark have identical spacing and AA contrast. At 480 px
the submenu flips to the left of its row: it overlaps the root surface but stays
inside the window and never covers the trigger, which is the trade-off of
keeping the row and its submenu both reachable on a narrow screen.

## Residual risks

- The full suite is stable at four workers in this environment; at six workers
  two unrelated timing-sensitive presentation/spark specs can flake under CPU
  pressure. They pass alone and in the full four-worker run.
- Grouping adds one extra acquisition for whole-workspace file and layout
  commands. That is deliberate: they are less frequent and now named, and no
  command was removed or duplicated.
