# STYLE-GUIDE — PanelCraft

Normative visual language for all UI work. Every UI-touching milestone runs the
[screenshot checklist](#screenshot-checklist-vision-review) as a DoD gate
(SPEC §8.4). Tokens below are the single source of truth — components reference
CSS custom properties, never hard-coded values (M2-WP5 enforces).

## Tokens

### Color — light (default)

| Token | Value | Use |
|---|---|---|
| `--pc-bg` | `#ffffff` | page background |
| `--pc-surface` | `#f5f6f8` | panels, toolbars |
| `--pc-fg` | `#1a1d21` | primary text |
| `--pc-muted` | `#6b7280` | secondary text, disabled |
| `--pc-accent` | `#2563eb` | selection, primary actions |
| `--pc-border` | `#d1d5db` | hairlines, separators |
| `--pc-canvas` | `#fafafa` | diagram canvas |
| `--pc-match` | `#b91c1c` | equal-size resize brackets and dimension labels |

### Color — dark

| Token | Value | Use |
|---|---|---|
| `--pc-bg` | `#14161a` | page background |
| `--pc-surface` | `#1e2126` | panels, toolbars |
| `--pc-fg` | `#e5e7eb` | primary text |
| `--pc-muted` | `#9ca3af` | secondary text, disabled |
| `--pc-accent` | `#60a5fa` | selection, primary actions |
| `--pc-border` | `#374151` | hairlines, separators |
| `--pc-canvas` | `#111316` | diagram canvas |
| `--pc-match` | `#f87171` | equal-size resize brackets and dimension labels |

Rules: contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text/UI glyphs in both
schemes; never rely on hue alone (a11y, M7 pass formalizes audit).

### Application chrome tokens (UX08-WP03)

The tokens above are the **document** palette: they describe the drawing and are
what the CLI renderer consumes. Application **chrome** — activity rails, panels,
tabs, lists, menus, inputs, buttons, focus, disabled text, scrollbars — has its
own semantic layer so the editor shell can look like a familiar code editor
without moving a single canvas colour. `appTokens.test.ts` parses `app.css` and
fails CI when a token is missing from either theme, when a text/control pair drops
below WCAG AA, or when a raw colour literal appears outside a theme block.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--pc-activity-bg` | `#eef0f4` | `#1b1e23` | activity rail / collapsed-panel rail |
| `--pc-activity-fg` | `#333a45` | `#b6bec9` | rail icon resting colour |
| `--pc-activity-selected-fg` | `#1d4ed8` | `#7cb0ff` | rail icon of the active panel |
| `--pc-panel-bg` | `#ffffff` | `#1e2126` | panel/list body |
| `--pc-panel-border` | `#d7dce4` | `#333a45` | panel and separator hairlines |
| `--pc-panel-header-bg` | `#f4f6f9` | `#232730` | header row, panel headers, view bar |
| `--pc-brand-craft-start` / `--pc-brand-craft-end` | `#7c3aed` / `#6d28d9` | `#d8c8ff` / `#aa78ef` | purple gradient on the Craft half of the app wordmark |
| `--pc-tab-bg` | `#eef0f4` | `#1b1e23` | tab strip background |
| `--pc-tab-active-bg` | `#ffffff` | `#1e2126` | active tab (merges with the editor) |
| `--pc-tab-active-fg` | `#1a1d21` | `#e5e7eb` | active tab label |
| `--pc-tab-inactive-fg` | `#575e69` | `#a9b1ba` | inactive tab label |
| `--pc-tab-border` | `#d7dce4` | `#333a45` | tab outline |
| `--pc-list-hover-bg` | `#eaeef4` | `#262b33` | hovered list/tree/menu row |
| `--pc-list-selected-bg` | `#dbe7fd` | `#2b3a52` | selected list row |
| `--pc-list-selected-fg` | `#1a1d21` | `#e5e7eb` | selected row label |
| `--pc-menu-bg` | `#ffffff` | `#1e2126` | menu, popover, dialog surface |
| `--pc-menu-border` | `#c6ccd6` | `#3a424e` | menu/dialog outline |
| `--pc-menu-shadow` | `0 8px 24px rgb(0 0 0 / 18%)` | `0 8px 24px rgb(0 0 0 / 55%)` | one elevation for floating surfaces |
| `--pc-input-bg` | `#ffffff` | `#14161a` | text field background |
| `--pc-input-border` | `#8b95a2` | `#6b7683` | field border **and** control affordance edge |
| `--pc-input-fg` | `#1a1d21` | `#e5e7eb` | field text |
| `--pc-button-bg` | `#eef0f4` | `#262b33` | secondary button |
| `--pc-button-hover-bg` | `#e2e6ec` | `#333a45` | button hover/press |
| `--pc-button-fg` | `#1a1d21` | `#e5e7eb` | button label |
| `--pc-button-primary-bg` | `#1d4ed8` | `#60a5fa` | primary/checked action surface |
| `--pc-button-primary-fg` | `#ffffff` | `#0b1220` | label on the primary surface |
| `--pc-focus-ring` | `#1d4ed8` | `#60a5fa` | keyboard focus outline and hover edge |
| `--pc-disabled-fg` | `#7a828e` | `#838d9b` | disabled label (no opacity tricks) |
| `--pc-warn-fg` | `#b45309` | `#fbbf24` | warning text on any chrome surface |
| `--pc-ok` | `#2f855a` | `#4ade80` | saved-status dot |
| `--pc-danger-fg` | `#b91c1c` | `#f87171` | destructive label/icon edge |
| `--pc-danger-bg` / `--pc-danger-bg-fg` | `#fee2e2` / `#7f1d1d` | `#450a0a` / `#fecaca` | error banner |
| `--pc-warn-bg` / `--pc-warn-bg-fg` | `#fef3c7` / `#78350f` | `#451a03` / `#fde68a` | warning banner |
| `--pc-scrollbar-thumb` / `-hover` / `--pc-scrollbar-track` | `#7d8794` / `#66707c` / `#eef0f4` | `#66717f` / `#7c8794` / `#1b1e23` | scrollbar slider, both engines |

Rules:

- **Separation.** A chrome rule never references `--pc-accent`, `--pc-surface`,
  `--pc-border`, `--pc-bg` or `--pc-fg` for a surface, edge or control colour; it
  uses the chrome tokens. `--pc-fg`/`--pc-muted` remain the *text* colours, and
  the canvas/document rules keep the document palette untouched.
- **No inline colours.** Every colour literal lives in the `:root` blocks; the
  only exception is the code-view PDL syntax palette (`.pc-tok-*`), which has no
  chrome role.
- **States are not hue-only.** Hover adds `--pc-button-hover-bg` or
  `--pc-list-hover-bg`, focus adds a 2 px `--pc-focus-ring` outline, selection
  adds weight/background, and disabled switches to `--pc-disabled-fg` instead of
  lowering opacity.
- **Scrollbars.** `scrollbar-color`/`scrollbar-width: thin` for Firefox,
  `::-webkit-scrollbar*` for Blink/WebKit, both driven by the slider tokens.

### Controls and icons (UX08-WP03)

- Minimum interactive target 32 px (`--pc-control-min`) in the shell; 24 px is
  allowed only for inline chips/rows inside a panel.
- Chrome icons are the owned inline set in `web/src/ui/icons.tsx`: 16×16 SVG,
  `stroke-width` 1.6, `currentColor`, `aria-hidden`, `pointer-events: none`.
  Disclosure marks render at 12 px, the menu check at 14 px.
- **No Unicode glyph controls.** `☰ ‹ › ✕ ⧉ ✎ ↑ ↓ ▶ ⏸ ⏮ ⏭ ↺` and friends render
  differently per platform font; a control whose meaning is an icon uses the SVG
  set. Text labels keep coming from `strings.ts` (N10).
- An icon-only button carries its accessible name (`aria-label`, or `title` plus
  `aria-label` where a tooltip is useful); the SVG itself is decorative.

### Spacing — 4 px grid

`--pc-space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64 px. All margins/paddings/gaps
are multiples of 4 px. No arbitrary px values in components.

### Type scale (system fonts only — no webfonts, N11)

| Step | Size/line | Use |
|---|---|---|
| `--pc-text-xs` | 11/16 px | badges, hints |
| `--pc-text-sm` | 12/18 px | labels, code view gutter |
| `--pc-text-md` | 14/20 px | body, panel UI (default) |
| `--pc-text-lg` | 18/26 px | section titles |
| `--pc-text-xl` | 24/32 px | page titles |

Font stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
code: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

### Shape language

- Corner radii: `--pc-radius-sm` 4 px (inputs, buttons), `--pc-radius-md` 8 px
  (panels, dialogs), objects on canvas 8 px; persons/cylinders per shape glyph.
- Hairline borders 1 px `--pc-panel-border` (chrome) or `--pc-border`
  (document); focus rings 2 px `--pc-focus-ring` (never remove outlines).
- Shadows: two elevations only — `0 1px 2px rgb(0 0 0 / 0.1)` (panels),
  `--pc-menu-shadow` (dialogs/popovers/menus); dark scheme raises alpha.

### Motion (reduced-motion respected, FR-A?)

- Durations: `--pc-dur-fast` 150 ms (hover/press), `--pc-dur-med` 200 ms
  (panel transitions), `--pc-dur-slow` 300 ms (dialog/theme cross-fade).
  Nothing above 300 ms.
- Easing: `cubic-bezier(0.2, 0, 0, 1)` (standard), `linear` for progress.
- `prefers-reduced-motion: reduce` → all transitions ≤ 1 frame; flow animation
  jumps to end states (SPEC FR-F/anim).

### Diagram theme contract (M2+)

Shapes/colors are theme tokens only (M2-WP5) — the same IR must render
sanely in light and dark; screenshots are captured for both in every visual
spec (SPEC §8.3/8.4).

## Screenshot checklist (vision review)

Run per milestone on captured light+dark screenshots (e2e loop, agents.md):

- [ ] Alignment: panel edges, icon boxes, and text baselines sit on the 4 px grid
- [ ] Contrast: body text ≥ 4.5:1, muted text still legible on both schemes
- [ ] Spacing: consistent gaps between sibling panels/controls (no 3/5/7 px)
- [ ] Empty states: meaningful message, correct centering, no layout jump on load
- [ ] Focus/selection states visible (accent ring, no default-blue browser ring)
- [ ] Animation end states: settled frames match static screenshot (no ghosting)
- [ ] Theme parity: light and dark screenshots differ only in token colors —
      no missing dark variant for any glyph/panel
- [ ] No external assets visible (fonts/icons/CDN images) — self-containment
      holds visually (N7/N11)

Outcome recorded in `docs/milestones/M<n>.md` with screenshot refs; defects
filed and fixed before DoD.
