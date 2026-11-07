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

Rules: contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text/UI glyphs in both
schemes; never rely on hue alone (a11y, M7 pass formalizes audit).

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
- Hairline borders 1 px; focus rings 2 px `--pc-accent` (never remove outlines).
- Shadows: two elevations only — `0 1px 2px rgb(0 0 0 / 0.1)` (panels),
  `0 8px 24px rgb(0 0 0 / 0.18)` (dialogs/popovers); dark scheme lowers alpha.

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
