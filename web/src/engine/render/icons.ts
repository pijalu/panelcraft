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
  alert: [
    'M12 2L23 21L1 21z',
    'M12 6L19.5 19L4.5 19z',
    'M11 9h2v6h-2z',
    'M10.7 17a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0z',
  ],
  api: [
    'M8 4L4 4L4 20L8 20L8 18L6 18L6 6L8 6z',
    'M16 4L18 6L18 18L16 20L16 18L16 6z',
    'M10 9h4v2h-4z',
    'M10 13h4v2h-4z',
  ],
  backup: [
    'M4 11h16v9h-16zM6 13v5h12v-5z',
    'M11 2h2v7h-2z',
    'M7 7L17 7L12 12z',
    'M8 16h8v2h-8z',
  ],
  browser: [
    'M2 4h20v16h-20zM4 6v12h16v-12z',
    'M2 8h20v2h-20z',
    'M4 6a1 1 0 1 0 2 0a1 1 0 1 0 -2 0z',
    'M7 6a1 1 0 1 0 2 0a1 1 0 1 0 -2 0z',
  ],
  cache: [
    'M4 6h16v12h-16zM6 8v8h12v-8z',
    'M8 10h8v2h-8z',
    'M8 14h5v2h-5z',
    'M6 2h2v4h-2z',
    'M11 2h2v4h-2z',
    'M16 2h2v4h-2z',
    'M6 18h2v4h-2z',
    'M11 18h2v4h-2z',
    'M16 18h2v4h-2z',
  ],
  cdn: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM5 12a7 7 0 1 1 14 0a7 7 0 1 1 -14 0z',
    'M3 11h18v2h-18z',
    'M11 3h2v18h-2z',
  ],
  certificate: [
    'M5 9a7 7 0 1 0 14 0a7 7 0 1 0 -14 0zM7 9a5 5 0 1 1 10 0a5 5 0 1 1 -10 0z',
    'M9.5 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0z',
    'M9 15L9 22L12 20L15 22L15 15z',
  ],
  chart: ['M4 3h2v16h16v2H4V3Zm4 8h2v6H8v-6Zm5-5h2v11h-2V6Zm5 3h2v8h-2V9Z'],
  clock: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM5 12a7 7 0 1 1 14 0a7 7 0 1 1 -14 0z',
    'M11 6h2v7h-2z',
    'M11 11h6v2h-6z',
  ],
  cloud: ['M6 18h11a4 4 0 0 0 .8-7.92A6 6 0 0 0 6.2 8.1 4.5 4.5 0 0 0 6 18Z'],
  cluster: [
    'M3 3h8v8h-8zM5 5v4h4v-4z',
    'M13 3h8v8h-8zM15 5v4h4v-4z',
    'M3 13h8v8h-8zM5 15v4h4v-4z',
    'M13 13h8v8h-8zM15 15v4h4v-4z',
  ],
  code: ['m9 6-6 6 6 6 1.4-1.4L5.8 12l4.6-4.6L9 6Zm6 0-1.4 1.4 4.6 4.6-4.6 4.6L15 18l6-6-6-6Z'],
  container: [
    'M3 4h18v16h-18zM5 6v12h14v-12z',
    'M9 6h2v12h-2z',
    'M13 6h2v12h-2z',
  ],
  database: ['M12 3c-4.4 0-8 1.3-8 3v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6c0-1.7-3.6-3-8-3Zm0 2c3.9 0 6 1 6 1s-2.1 1-6 1-6-1-6-1 2.1-1 6-1Zm-6 3.6C7.6 9.5 9.7 10 12 10s4.4-.5 6-1.4V12c0 .3-1 1-3 1.6-1.9.5-4.5.5-6.4 0C6.6 13 6 12.4 6 12V8.6Zm0 6C7.6 15.5 9.7 16 12 16s4.4-.5 6-1.4V18c0 .3-1 1-3 1.6-1.9.5-4.5.5-6.4 0C6.6 19 6 18.4 6 18v-3.4Z'],
  deploy: [
    'M12 2L19 10L14 10L14 16L10 16L10 10L5 10z',
    'M3 19h18v3h-18z',
  ],
  document: [
    'M4 2L15 2L20 7L20 22L4 22z',
    'M6 4L14 4L18 8L18 20L6 20z',
    'M8 10h8v2h-8z',
    'M8 14h8v2h-8z',
    'M8 17h5v2h-5z',
  ],
  external: [
    'M3 8h13v13h-13zM5 10v9h9v-9z',
    'M11 3L21 3L21 13L19 11L19 6L13 12L11 10L17 5L12 5z',
  ],
  folder: ['M3 5L9 5L11 8L21 8L21 19L3 19zM5 10L19 10L19 17L5 17z'],
  function: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0zM5 12a7 7 0 1 1 14 0a7 7 0 1 1 -14 0z',
    'M10 8L17 12L10 16z',
  ],
  gateway: ['M4 20L4 9L12 3L20 9L20 20L16 20L16 10L12 7L8 10L8 20z'],
  gear: ['m10 3 .4 2.4a7 7 0 0 0-1.9 1.1L6.2 5.6 4.2 9l2 1.5a7 7 0 0 0 0 2.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 1.9 1.1L10 21h4l.4-2.4a7 7 0 0 0 1.9-1.1l2.3.9 2-3.4-2-1.5a7 7 0 0 0 0-2.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-1.9-1.1L14 3h-4Zm2 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z'],
  git: [
    'M2 6a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM4 6a2 2 0 1 1 4 0a2 2 0 1 1 -4 0z',
    'M2 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM4 18a2 2 0 1 1 4 0a2 2 0 1 1 -4 0z',
    'M14 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM16 12a2 2 0 1 1 4 0a2 2 0 1 1 -4 0z',
    'M5 8h2v8h-2z',
    'M8 11h8v2h-8z',
    'M15 9L19 12L15 15z',
  ],
  group: [
    'M2 4h20v16h-20zM4 6v12h16v-12z',
    'M5 7h14v10h-14zM7 9v6h10v-6z',
  ],
  key: [
    'M3 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0zM5 8a3 3 0 1 1 6 0a3 3 0 1 1 -6 0z',
    'M11 11L20 20L17 20L15 18L17 16L15 14L13 14z',
  ],
  loadbalancer: [
    'M2 9h6v6h-6zM4 11v2h2v-2z',
    'M16 2h6v6h-6zM18 4v2h2v-2z',
    'M16 9h6v6h-6zM18 11v2h2v-2z',
    'M16 16h6v6h-6zM18 18v2h2v-2z',
    'M8 11h8v2h-8z',
    'M13 5h3v2h-3z',
    'M13 19h3v2h-3z',
    'M13 5h2v3h-2z',
    'M13 16h2v3h-2z',
  ],
  lock: ['M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Zm0 10a2 2 0 0 1 1 3.7V20h-2v-2.3A2 2 0 0 1 12 14Z'],
  logs: [
    'M4 3L16 3L20 7L20 21L4 21z',
    'M6 5L15 5L18 8L18 19L6 19z',
    'M8 9h8v2h-8z',
    'M8 13h8v2h-8z',
    'M8 16h5v2h-5z',
  ],
  mail: ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm.4 2L12 12l7.6-5H4.4ZM20 8.7l-8 5.3-8-5.3V17h16V8.7Z'],
  mobile: [
    'M7 2h10v20h-10zM9 4v16h6v-16z',
    'M10 18h4v1.5h-4z',
  ],
  monitor: [
    'M2 4h20v14h-20zM4 6v10h16v-10z',
    'M10 18h4v2h-4z',
    'M8 20h8v2h-8z',
    'M5 11L8 11L10 8L12 14L14 11L19 11z',
  ],
  network: [
    'M3 3h7v7h-7zM5 5v3h3v-3z',
    'M14 14h7v7h-7zM16 16v3h3v-3z',
    'M10 5h4v2h-4z',
    'M6 10h2v4h-2z',
    'M8 17h6v2h-6z',
  ],
  package: [
    'M3 6h18v15h-18zM5 8v11h14v-11z',
    'M3 11h18v2h-18z',
    'M11 11h2v5h-2z',
  ],
  proxy: [
    'M6 5h12v14h-12zM8 7v10h8v-10z',
    'M2 9h4v2h-4z',
    'M2 14h4v2h-4z',
    'M18 9h4v2h-4z',
    'M18 14h4v2h-4z',
  ],
  queue: [
    'M2 5h11v3h-11z',
    'M2 10.5h11v3h-11z',
    'M2 16h11v3h-11z',
    'M14 11h6v2h-6z',
    'M18 7L22 12L18 17z',
  ],
  search: [
    'M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0zM5 10a5 5 0 1 1 10 0a5 5 0 1 1 -10 0z',
    'M15 15L21 21L19 23L13 17z',
  ],
  server: [
    'M2 4h20v7h-20zM4 6v3h16v-3zM2 13h20v7h-20zM4 15v3h16v-3z',
    'M5.3 7.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z',
    'M5.3 16.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z',
  ],
  shield: ['M12 2 21 6v6c0 5.2-3.7 8.6-9 10-5.3-1.4-9-4.8-9-10V6l9-4Zm0 2.2L5 7.3V12c0 4 2.7 6.7 7 8 4.3-1.3 7-4 7-8V7.3l-7-3.1Z'],
  storage: [
    'M3 5h18v14h-18zM5 7v10h14v-10z',
    'M3 9h18v2h-18z',
    'M10 12L14 16L10 16z',
  ],
  stream: [
    'M3 5h12v2h-12z',
    'M9 11h12v2h-12z',
    'M3 17h12v2h-12z',
    'M17.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0z',
    'M3.5 18a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0z',
  ],
  terminal: [
    'M2 4h20v16h-20zM4 6v12h16v-12z',
    'M7 9L12 12L7 15z',
    'M12 15h6v2h-6z',
  ],
  user: [
    'M7.5 8a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0zM9.5 8a2.5 2.5 0 1 1 5 0a2.5 2.5 0 1 1 -5 0z',
    'M5 21L5 17.5L9 15L15 15L19 17.5L19 21z',
  ],
  users: [
    'M4 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0zM5.8 8a2.2 2.2 0 1 1 4.4 0a2.2 2.2 0 1 1 -4.4 0z',
    'M2 20L2 17L5 15L11 15L14 17L14 20z',
    'M13.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0zM15.3 8a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1 -3.4 0z',
    'M15 15L19 15L22 17L22 20L16 20L16 17z',
  ],
  workflow: [
    'M2 2h6v6h-6zM4 4v2h2v-2z',
    'M9 9h6v6h-6zM11 11v2h2v-2z',
    'M16 16h6v6h-6zM18 18v2h2v-2z',
    'M8 4h3v2h-3z',
    'M4 8h2v3h-2z',
    'M15 11h3v2h-3z',
    'M11 15h2v3h-2z',
  ],
};

export type IconName = keyof typeof ICONS;

export const isIcon = (name: string): name is IconName => name in ICONS;

export const iconPaths = (name: string): string[] | null => (isIcon(name) ? (ICONS[name] ?? null) : null);

/** Glyph specs for an icon anchored at (x, y), optionally fitted to a smaller box. */
export function iconGlyphs(name: string, x: number, y: number, size = ICON_BOX): IconSpec[] {
  const paths = iconPaths(name);
  if (paths === null) return [];
  return paths.map((d) => ({
    tag: 'path',
    attrs: { d, class: 'pc-glyph-icon', transform: `translate(${x} ${y}) scale(${size / ICON_BOX})` },
  }));
}
