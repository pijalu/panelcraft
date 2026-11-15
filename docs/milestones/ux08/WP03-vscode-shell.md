<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP03 — VS Code-inspired component theme

**Severity:** Medium — shell consistency and information hierarchy

**Status:** Proposed  
**Requirement:** 9 — application should match VS Code component style  
**Depends on:** WP01 and WP02, so theme work does not conflict with menu/layout repairs  
**Branch:** `feat/ux08-vscode-shell`

## Single-task outcome

Apply a coherent VS Code-inspired visual language to application chrome in light and dark. This
is a token/component migration, not a workflow rewrite or pixel-identical clone.

## Evidence and UX rationale

Reviewed `test-results/screenshots/ux05-major-surfaces-light.png`: crowded header controls,
repeated titles and mixed Unicode/text glyphs weaken hierarchy. Jakob’s Law supports familiar
editor chrome; Aesthetic-Usability Effect is valid only if WP01/WP02 and keyboard workflows pass.

## Implementation steps

1. Extend `docs/STYLE-GUIDE.md` with semantic application tokens for activity bar, panel,
   panel border, tabs, list hover/selection, menu, input, button, focus, disabled text and
   scrollbar slider. Provide light/dark values with WCAG AA contrast.
2. Keep diagram/document theme tokens separate from application chrome. Use system fonts and
   the existing 4 px spacing scale; no webfonts, icon fonts, CDN or VS Code asset copying.
3. Migrate header, activity rails, panels, tabs, lists, menus, inputs, buttons, dialogs and
   scrollbars to the semantic tokens. Use compact 32 px minimum targets and consistent inline
   16 px SVG icons with accessible names; replace decorative Unicode controls where touched.
4. Preserve the current System/Light/Dark preference, no-flash boot behavior and independent
   document/CLI themes. Do not alter canvas geometry, flow semantics or storage.
5. Add token/contrast tests and update the AST string audit if new icons/labels require strings.
   Remove obsolete CSS only after tracing all selectors; avoid a wholesale stylesheet rewrite.

## Required checks

```bash
npx vitest run web/src/ui/appTheme.test.ts web/src/ui/useAppTheme.test.tsx web/src/ui/strings.test.ts
npm run check
npm run build
npx playwright test e2e/ux05-app-theme.spec.ts e2e/m7-a11y.spec.ts e2e/ux02-workspace.spec.ts
```

Capture the same major surfaces in both themes for comparison: menu, Files, Shapes, Flow Steps,
Code, Properties, dialogs, focus states and narrow layout. Run axe and review the screenshots
against the updated style-guide checklist.

## Acceptance

- All chrome uses semantic tokens; no new hard-coded component palette or external asset.
- Focus, hover, selected, disabled and scrollbar states are distinct beyond hue alone.
- Light/dark contrast passes; standalone/narrow layouts retain usable targets.
- Visual review confirms a coherent editor-like shell without regressing WP01/WP02 behavior.

## Evidence

Pending. Record token contrast results, exact commands, axe output and screenshot review here.
