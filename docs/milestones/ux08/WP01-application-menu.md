<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP01 — Accessible application menu

**Severity:** High — keyboard access and interaction consistency

**Status:** Implemented and verified (2026-11-15)
**Requirement:** 4 — menu/hamburger for View, exports and History; outside-click collapse  
**Depends on:** nothing  
**Branch:** `feat/ux08-application-menu`

## Single-task outcome

Replace header action sprawl with one keyboard-accessible **Application menu**. Reuse one
popover/dismissal implementation for it and existing panel menus. Do not restyle the whole shell,
add grid behavior or redesign flows in this WP.

## Evidence and UX rationale

- `WorkspaceToolbar.tsx:82-108` renders separate Import, ZIP, four export, private, Snapshots and
  Clear data controls.
- `WorkspacePanels.tsx:122-145,197-245` uses native `details` without shared outside-dismiss or
  trigger-focus restoration. `ContextMenu.tsx:27-44` has a separate implementation.
- Jakob’s Law favors familiar application menus; Hick’s Law requires meaningful groups rather
  than one undifferentiated action list.

## Implementation steps

1. Add component tests for `aria-haspopup`, `aria-expanded`, outside pointer, Escape and focus
   return, arrows/Home/End, Tab closure, item activation, disabled items and viewport collision.
2. Build a small owned menu/popover primitive. Menus use roving `menuitem` focus. History stays a
   labelled non-modal dialog/popover, not a `role=menu`.
3. Migrate View and panel-action menus to the same outside-dismiss/focus lifecycle. Preserve
   docking, close and reset behavior.
4. Replace the header toolbar buttons with a hamburger **Application menu**, grouped as:
   - **File:** Import files, Open workspace ZIP; Export current submenu
     `.pcd/.mmd/.svg/.png`; Export workspace ZIP.
   - **View:** panel visibility, theme and Reset layout. Add disabled placeholder-free grid
     controls only when WP05 supplies behavior; otherwise leave grid to WP05’s later menu change.
   - **Flows:** Open Flow Steps and Present using current actions.
   - **History:** Open history.
   - **Workspace:** Snapshots, Private mode and, after a separator, Clear data.
5. Keep product identity and saved/dirty/problem status visible. Keep hidden file inputs and the
   existing typed clear-data confirmation. Centralize every new string.
6. Update only tests that intentionally target the new menu structure; retain action-level
   assertions and existing test IDs where practical.

## Required checks

```bash
npx vitest run web/src/ui/AppMenu.test.tsx web/src/ui/App.test.tsx web/src/ui/AppUx03.test.tsx web/src/ui/AppM6.test.tsx
npm run check
npm run build
npx playwright test e2e/ux05-app-theme.spec.ts e2e/p3-history.spec.ts e2e/p1-shell.spec.ts
```

Add focused menu component/spec files if the listed files do not cover the new primitive. Capture
light/dark menu-open, keyboard-focus and narrow-viewport screenshots and review them against
`docs/STYLE-GUIDE.md`.

## Acceptance

- All former header actions remain reachable through labelled groups.
- Outside pointer, Escape and item selection close the top surface; focus returns to its trigger.
- Repeated menu open/close does not alter workspace data or panel layout unexpectedly.
- No individual export buttons remain in the header; no new network/dependency was introduced.

## Evidence

**RED:** `npx vitest run web/src/ui/Menu.test.tsx` failed before the primitive was
complete (submenu entries were filtered out of the roving-focus list and the first item
was never focused): 5 failed / 12 passed.

**GREEN (unit):** `npx vitest run web/src/ui/Menu.test.tsx web/src/ui/menuModel.test.ts
web/src/ui/appMenuEntries.test.ts web/src/ui/WorkspacePanels.test.tsx` → 29 passed.
Full run `npx vitest run` → 103 files / 1068 tests passed.

**GREEN (e2e):** `npm run build && npx playwright test` → 105 passed. Menu-specific
scenarios: `ux02-workspace` (keyboard open/dock/float/close/reset), `ux03-files`
(keyboard close focus returns to `app-menu`), `ux05-app-theme` (theme radio),
`s4-workspace` (private-mode checkbox), `cx01`–`cx04` (export submenu).

**Vision review (2026-11-15):** `test-results/screenshots/ux05-app-menu-light.png` and
`-dark.png`. Found and fixed: popover overflowed the viewport bottom (now clamped to
`innerHeight - top`, scrollable) and menu type was larger than panel type (now
`--pc-text-sm`). Remaining cosmetic follow-up (checkbox glyph for Private mode, stronger
disabled contrast) is WP03’s theme pass, not a behavior defect.
