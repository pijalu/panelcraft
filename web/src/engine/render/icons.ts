// SPDX-License-Identifier: GPL-3.0-only
// M5-WP7 inline icon set (N7/N11: no icon fonts, no CDN — ADR-0005).
// Each entry is a list of SVG path `d` strings drawn in a 24×24 box; the
// sources of truth live in web/assets/icons/*.svg (original in-repo works,
// GPL-3.0-only) and icons.test.ts asserts this module matches those files.
export interface IconSpec {
  tag: 'path';
  attrs: Record<string, number | string>;
}

export const ICON_BOX = 24;

export const ICONS: Record<string, string[]> = {
  cloud: ['M6 18h11a4 4 0 0 0 .8-7.92A6 6 0 0 0 6.2 8.1 4.5 4.5 0 0 0 6 18Z'],
  database: [
    'M12 3c-4.4 0-8 1.3-8 3v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3Zm0 2c3.9 0 6 1 6 1s-2.1 1-6 1-6-1-6-1 2.1-1 6-1Zm-6 3.6C7.6 9.5 9.7 10 12 10s4.4-.5 6-1.4V12c0 .3-1 1-3 1.6-1.9.5-4.5.5-6.4 0C6.6 13 6 12.4 6 12V8.6Zm0 6C7.6 15.5 9.7 16 12 16s4.4-.5 6-1.4V18c0 .3-1 1-3 1.6-1.9.5-4.5.5-6.4 0C6.6 19 6 18.4 6 18v-3.4Z',
  ],
  gear: [
    'm10 3 .4 2.4a7 7 0 0 0-1.9 1.1L6.2 5.6 4.2 9l2 1.5a7 7 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 1.9 1.1L10 21h4l.4-2.4a7 7 0 0 0 1.9-1.1l2.3.9 2-3.4-2-1.5a7 7 0 0 0 0-2.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.9-1.1L14 3h-4Zm2 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z',
  ],
  lock: [
    'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Zm0 10a2 2 0 0 1 1 3.7V20h-2v-2.3A2 2 0 0 1 12 14Z',
  ],
  mail: [
    'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm.4 2L12 12l7.6-5H4.4ZM20 8.7l-8 5.3-8-5.3V17h16V8.7Z',
  ],
  user: [
    'M12 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 9c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5Z',
  ],
  chart: ['M4 3h2v16h16v2H4V3Zm4 8h2v6H8v-6Zm5-5h2v11h-2V6Zm5 3h2v8h-2V9Z'],
  code: ['m9 6-6 6 6 6 1.4-1.4L5.8 12l4.6-4.6L9 6Zm6 0-1.4 1.4 4.6 4.6-4.6 4.6L15 18l6-6-6-6Z'],
};

export type IconName = keyof typeof ICONS;

export const isIcon = (name: string): name is IconName => name in ICONS;

export const iconPaths = (name: string): string[] | null => (isIcon(name) ? (ICONS[name] ?? null) : null);

/** Glyph specs for an icon anchored at (x, y) in shape-local coordinates. */
export function iconGlyphs(name: string, x: number, y: number): IconSpec[] {
  const paths = iconPaths(name);
  if (paths === null) return [];
  return paths.map((d) => ({
    tag: 'path',
    attrs: { d, class: 'pc-glyph-icon', transform: `translate(${x} ${y}) scale(${ICON_BOX / ICON_BOX})` },
  }));
}
