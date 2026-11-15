// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP03: the application chrome is themed by semantic tokens only. This test
// parses app.css directly so a hard-coded component colour or an unreadable token
// pair fails CI instead of shipping.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

/** Every semantic chrome token the theme promises, with its documented role. */
const CHROME_TOKENS = [
  'activity-bg', 'activity-fg', 'activity-selected-fg',
  'panel-bg', 'panel-border', 'panel-header-bg',
  'tab-bg', 'tab-active-bg', 'tab-active-fg', 'tab-inactive-fg', 'tab-border',
  'list-hover-bg', 'list-selected-bg', 'list-selected-fg',
  'menu-bg', 'menu-border', 'menu-shadow',
  'input-bg', 'input-border', 'input-fg',
  'button-bg', 'button-hover-bg', 'button-fg', 'button-primary-bg', 'button-primary-fg',
  'focus-ring', 'disabled-fg',
  'scrollbar-thumb', 'scrollbar-thumb-hover', 'scrollbar-track',
  'danger-fg', 'danger-bg', 'danger-bg-fg', 'warn-bg', 'warn-bg-fg', 'warn-fg', 'ok',
  // UX08-WP05: the canvas grid is an editor-only preference with its own pair.
  'grid-dot', 'grid-line',
] as const;

type Tokens = Map<string, string>;

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing CSS block ${selector}`);
  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

function declarations(source: string): Tokens {
  const tokens: Tokens = new Map();
  for (const match of source.matchAll(/--pc-([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) tokens.set(name, value.trim());
  }
  return tokens;
}

const light: Tokens = new Map(declarations(block(':root')));
const dark: Tokens = new Map([...declarations(block(":root[data-theme='dark']")), ...light]);

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (digits === undefined) throw new Error(`token is not a 6-digit hex colour: ${hex}`);
  const int = Number.parseInt(digits, 16);
  return 0.2126 * channel((int >> 16) & 0xff)
    + 0.7152 * channel((int >> 8) & 0xff)
    + 0.0722 * channel(int & 0xff);
}

function contrast(a: string, b: string): number {
  const [first, second] = [luminance(a), luminance(b)];
  const high = Math.max(first ?? 0, second ?? 0);
  const low = Math.min(first ?? 0, second ?? 0);
  return (high + 0.05) / (low + 0.05);
}

describe('application chrome tokens (UX08-WP03)', () => {
  it('defines every semantic chrome token in both themes', () => {
    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
      const missing = CHROME_TOKENS.filter((token) => !tokens.has(token));
      expect(missing, `${theme} theme missing tokens`).toEqual([]);
    }
  });

  it('keeps the canvas grid subtle in both themes (UX08-WP05)', () => {
    // Perceptible but never competitive: above the noise floor of a flat fill,
    // well below the 3:1 required for a control boundary, so the grid cannot
    // out-shout shapes or labels.
    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
      for (const token of ['grid-dot', 'grid-line']) {
        const ratio = contrast(tokens.get(token) ?? '', tokens.get('canvas') ?? '');
        expect(ratio, `${theme} ${token} vs canvas`).toBeGreaterThan(1.1);
        expect(ratio, `${theme} ${token} vs canvas`).toBeLessThan(2.2);
      }
    }
  });

  it('keeps text and control pairs at WCAG AA or better in both themes', () => {
    // Text pairs need 4.5:1; non-text UI boundaries need 3:1 (WCAG 1.4.11).
    const pairs: Array<[string, string, number]> = [
      ['fg', 'bg', 4.5],
      ['muted', 'bg', 4.5],
      ['muted', 'panel-bg', 4.5],
      ['fg', 'panel-bg', 4.5],
      ['disabled-fg', 'panel-bg', 3],
      ['activity-fg', 'activity-bg', 4.5],
      ['activity-selected-fg', 'activity-bg', 4.5],
      ['tab-active-fg', 'tab-active-bg', 4.5],
      ['tab-inactive-fg', 'tab-bg', 4.5],
      ['list-selected-fg', 'list-selected-bg', 4.5],
      ['input-fg', 'input-bg', 4.5],
      // A control boundary must be perceivable: the input edge is the affordance.
      ['input-border', 'input-bg', 3],
      ['button-fg', 'button-bg', 4.5],
      ['button-primary-fg', 'button-primary-bg', 4.5],
      ['focus-ring', 'panel-bg', 3],
      ['focus-ring', 'bg', 3],
      ['scrollbar-thumb', 'scrollbar-track', 3],
      ['danger-fg', 'panel-bg', 4.5],
      ['danger-bg-fg', 'danger-bg', 4.5],
      ['warn-bg-fg', 'warn-bg', 4.5],
      ['warn-fg', 'panel-bg', 4.5],
      ['warn-fg', 'panel-header-bg', 4.5],
      // the status dot is a non-text indicator (WCAG 1.4.11)
      ['ok', 'panel-header-bg', 3],
    ];
    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
      const failures = pairs
        .map(([fgToken, bgToken, minimum]) => ({
          pair: `${fgToken} on ${bgToken}`,
          ratio: contrast(tokens.get(fgToken) ?? '', tokens.get(bgToken) ?? ''),
          minimum,
        }))
        .filter((entry) => entry.ratio < entry.minimum)
        .map((entry) => `${theme}: ${entry.pair} = ${entry.ratio.toFixed(2)} < ${entry.minimum}`);
      expect(failures).toEqual([]);
    }
  });

  it('keeps document theme tokens independent from the chrome tokens', () => {
    // The canvas/document palette stays usable by the CLI renderer, which never
    // sees the application chrome tokens.
    for (const token of ['bg', 'surface', 'fg', 'muted', 'accent', 'border', 'canvas', 'match']) {
      expect(light.has(token)).toBe(true);
      expect(dark.get(token)).toBeTruthy();
    }
    expect(light.get('panel-bg')).not.toBe(light.get('canvas'));
  });

  it('declares colour values only in the theme blocks, never inline in a rule', () => {
    // A raw colour inside a component rule bypasses both themes. The single
    // remaining family is the code-view PDL syntax palette, which is scoped to
    // the code pane and has no chrome role.
    const offences = css
      .slice(css.indexOf('\n* {\nbox-sizing'))
      .split('\n')
      .filter((line) => !line.includes('.pc-tok-'))
      .filter((line) => !line.trim().startsWith('/*') && !line.trim().startsWith('*'))
      .filter((line) => /#[0-9a-f]{3,8}\b/i.test(line));
    expect(offences).toEqual([]);
  });
});
