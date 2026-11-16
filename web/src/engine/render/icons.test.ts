// SPDX-License-Identifier: GPL-3.0-only
// M5-WP7 icon sync test (ADR-0005): the icons.ts module must match the
// web/assets/icons/*.svg sources byte-for-path — a drift means someone edited
// one side only. Also asserts the license header survives on every source.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ICONS, iconGlyphs, iconPaths } from './icons';
import { BUILTIN_ICONS, searchBuiltinIcons } from '../model/icons';

const ICON_DIR = join(import.meta.dirname, '..', '..', '..', 'assets', 'icons');

/** Pull every path `d` out of an .svg source file. */
const pathsOf = (svg: string): string[] =>
  [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1] ?? '');

describe('icon set sync (M5-WP7)', () => {
  it('module matches every assets/icons/*.svg source', () => {
    const files = readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const name = file.replace(/\.svg$/, '');
      const svg = readFileSync(join(ICON_DIR, file), 'utf8');
      expect(iconPaths(name), `missing module entry for ${name}`).toEqual(pathsOf(svg));
    }
    // and no extra module entries without a source file
    const names = new Set(files.map((f) => f.replace(/\.svg$/, '')));
    for (const key of Object.keys(ICONS)) {
      expect(names.has(key), `module entry ${key} has no .svg source`).toBe(true);
    }
  });

  it('every source carries the GPL-3.0-only SPDX header (ADR-0005)', () => {
    for (const file of readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg'))) {
      const svg = readFileSync(join(ICON_DIR, file), 'utf8');
      expect(svg, `${file} missing SPDX`).toContain('SPDX-License-Identifier: GPL-3.0-only');
    }
  });

  it('the model registry and the drawn module cover the same handles', () => {
    const registry = BUILTIN_ICONS.map((i) => i.name).sort();
    const drawn = Object.keys(ICONS).sort();
    expect(registry).toEqual(drawn);
  });

  it('search matches handles, labels and keywords', () => {
    expect(searchBuiltinIcons('kafka').map((i) => i.name)).toContain('queue');
    expect(searchBuiltinIcons('').length).toBe(BUILTIN_ICONS.length);
    expect(searchBuiltinIcons('zzz')).toEqual([]);
  });

  it('iconGlyphs positions paths and rejects unknown names', () => {
    const glyphs = iconGlyphs('cloud', 100, 8);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]?.attrs.class).toBe('pc-glyph-icon');
    expect(String(glyphs[0]?.attrs.transform)).toContain('translate(100 8)');
    expect(iconGlyphs('nope', 0, 0)).toEqual([]);
  });
});
