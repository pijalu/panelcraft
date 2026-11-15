<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP03 — VS Code-inspired component theme

**Severity:** Medium — shell consistency and information hierarchy

**Status:** Implemented (see Evidence)  
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

**Scope delivered.** One semantic chrome layer in `web/src/ui/app.css` (activity rails, panels,
headers, tabs, lists, menus, inputs, buttons, focus, disabled, banners, scrollbars), the owned
inline icon set `web/src/ui/icons.tsx` replacing every Unicode glyph control in the shell, a
token/contrast/dark-parity audit (`web/src/ui/appTokens.test.ts`), `docs/STYLE-GUIDE.md` extended
with the chrome token tables, control/icon rules and the "no inline colours" rule, plus
`e2e/ux08-shell.spec.ts` for surface captures and the icon/accessible-name audit.

**Pre-existing defect removed.** `app.css` carried a duplicate copy of the chrome block
(identical rules repeated later in the file, a bad-merge artifact — 314 identical lines, 28 of
them whole rules). It silently overrode the first copy, so token work on the earlier rules had no
effect. The duplicate run was proven byte-identical to earlier rules with zero selector overlap
against the rules in between, then deleted. The corrupted seam it left (a `.code-pane-head`
selector fragment splicing into a `.pc-burst` rule, plus a truncated `.panel-title`) was repaired
to the intended sequence. `app.css` went 3426 → 3218 lines with rules and brace depth verified
(`depth 0`, no duplicate rule bodies, no duplicate selectors beyond the three intentional
overrides).

**RED → GREEN (regression tests written first):**

- `web/src/ui/appTokens.test.ts` — missing tokens / contrast / raw-colour audit. GREEN: 4 passed.
- `web/src/ui/Menu.test.tsx` — "skips a disabled first entry when it opens" failed before the fix
  (focusing a disabled button is a no-op, leaving keyboard focus on the trigger); `MenuList` now
  lands on the first *enabled* entry via `edgeIndex`. GREEN after fix.
- `web/src/ui/App.test.tsx` — "clear-data dialog closes on Escape from anywhere and starts on the
  field" failed before the fix (Escape was only handled on the input); the overlay now owns the
  Escape handler and the field takes focus on open. GREEN after fix.
- `web/src/ui/App.test.tsx` / `AppM6.test.tsx` — the helpers selected "the first `<svg>` in the
  shell", which the new inline icons turned into the menu icon; they now address
  `[data-testid="canvas"]`. Test intent unchanged.

**Commands (all run, output quoted):**

```
npx vitest run                 → 104 files / 1076 tests passed
npm run check                  → tsc --noEmit, tsc -p tsconfig.sw.json --noEmit, eslint: clean
npm run build                  → dist/assets/index-*.css 47.69 kB (gzip 8.83 kB), built OK
npx playwright test            → 116 passed (41.9 s)
npx playwright test e2e/ux05-app-theme.spec.ts e2e/m7-a11y.spec.ts e2e/ux02-workspace.spec.ts
                               → 13 passed  (the WP's required trio, incl. both axe shells)
npx playwright test e2e/ux08-panels.spec.ts   → 7 passed (WP02 behaviour intact)
npx playwright test e2e/ux02-workspace.spec.ts --workers 4 --repeat-each=4 → 16 passed
                               (keyboard menu path is stable under load after the autofocus fix)
bash scripts/check-repo-clean.sh --worktree   → only the intended source/doc changes; e2e leaves
                               no artifacts (captures stay gitignored under test-results/)
```

**Token contrast (asserted by `appTokens.test.ts`, both themes).** Text pairs ≥ 4.5:1: `fg`/`muted`
on `bg` and `panel-bg`, `activity-fg` and `activity-selected-fg` on `activity-bg`,
`tab-active-fg` on `tab-active-bg`, `tab-inactive-fg` on `tab-bg`, `list-selected-fg` on
`list-selected-bg`, `input-fg` on `input-bg`, `button-fg` on `button-bg`,
`button-primary-fg` on `button-primary-bg`, `danger-fg` on `panel-bg`, `warn-fg` on `panel-bg`
and `panel-header-bg`, banner foreground/background pairs. Non-text ≥ 3:1: `input-border` on
`input-bg`, `focus-ring` on `panel-bg` and `bg`, `scrollbar-thumb` on `scrollbar-track`,
`disabled-fg` on `panel-bg`, `ok` on `panel-header-bg`. The same audit fails the build if a colour
literal appears outside a theme block (only the code-view `.pc-tok-*` syntax palette is exempt).

**axe.** `e2e/m7-a11y.spec.ts` — 6 passed, including "app shell passes axe WCAG 2.1 AA (light)" and
"(dark)"; `ux08-shell.spec.ts` also asserts every `#app button` resolves to a non-empty accessible
name and that no `☰ ‹ › ✕ ⧉ ✎ ↑ ↓ ▶ ⏸ ⏮ ⏭ ↺` glyph remains in a chrome control.

**Vision review (2026-11-15).** Captures: `test-results/screenshots/ux08-{shell,menu,focus,dialog,
narrow}-{light,dark}.png`, reviewed against the STYLE-GUIDE checklist.

- Alignment/spacing: header 36 px, panel headers 36 px, control targets 32 px, 16 px icon grid —
  no half-pixel or 3/5/7 px gaps on the surfaces touched.
- Contrast: text and control pairs verified above; the 12 px tab label measures `rgb(26,29,33)`
  (active tab, weight 600) in light and `#e5e7eb` in dark — the "faint tab" impression in the
  downscaled screenshot was antialiasing, confirmed by a computed-style probe.
- States: hover uses `--pc-button-hover-bg`/`--pc-list-hover-bg`, focus adds a 2 px
  `--pc-focus-ring` outline (visible on the menu trigger capture), selection adds weight plus
  `--pc-list-selected-bg`, disabled switches to `--pc-disabled-fg` (no opacity wash) so the
  clear-data dialog's disabled "Delete everything" stays legible.
- Empty states: the template gallery and the empty view bar keep their centring; nothing jumps on
  load.
- Narrow: a 520 px viewport opens panels as a dismissible drawer (backdrop present, 32 px targets),
  captured separately from a fresh narrow load.
- Theme parity: light/dark captures differ only in token values; no missing dark variant found.
- Self-containment: no external asset appears (icons are inline SVG, system fonts only).

**Defect filed, not fixed here (out of WP03 scope):** opening several panels at 1440 px and then
shrinking the window below 720 px leaves two side docks absolutely positioned on top of each other
(non-drawer dock unreachable, backdrop covered). It is WP02 layout state, reproducible without the
theme changes (`window.matchMedia('(max-width: 719px)')` matches, both docks get
`position: absolute`). Belongs to WP15 as a layout follow-up; the realistic narrow entry state —
fresh load at ≤ 719 px — shows exactly one drawer and is captured as correct.
