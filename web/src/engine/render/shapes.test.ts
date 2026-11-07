// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import { shapeGlyphs, SHAPE_RADIUS, NOTE_FOLD, type SceneObject } from './shapes';

const obj = (kind: SceneObject['kind'], over: Partial<SceneObject> = {}): SceneObject => ({
  id: 'o1',
  kind,
  x: 0,
  y: 0,
  w: 120,
  h: 60,
  name: 'Checkout',
  ...over,
});

const tags = (kind: SceneObject['kind'], over: Partial<SceneObject> = {}) =>
  shapeGlyphs(obj(kind, over)).map((s) => s.tag);

describe('shape glyph set (M2-WP5, FR-C3 kinds)', () => {
  it('system/container/component/system_ext: rounded rect + centered label', () => {
    for (const kind of ['system', 'container', 'component', 'system_ext'] as const) {
      const specs = shapeGlyphs(obj(kind));
      expect(specs.map((s) => s.tag)).toEqual(['rect', 'text']);
      expect(specs[0]?.attrs.rx).toBe(SHAPE_RADIUS);
      expect(specs[0]?.attrs.width).toBe(120);
      expect(specs[0]?.attrs.height).toBe(60);
      const text = specs[1];
      expect(text?.text).toBe('Checkout');
      expect(text?.attrs.class).toBe('pc-label');
    }
  });

  it('person: body rect first, then head circle + shoulder arc + label', () => {
    // document order = paint order: body rect must precede glyph details or
    // they are painted over (vision review r1 defect D2)
    expect(tags('person')).toEqual(['rect', 'circle', 'path', 'text']);
    const specs = shapeGlyphs(obj('person'));
    const head = specs[1];
    expect(head?.tag).toBe('circle');
    expect(head?.attrs.cx).toBe(60); // w/2
    expect(head?.attrs.r).toBe(6);
    const arc = specs[2];
    expect(String(arc?.attrs.d)).toMatch(/^M 50 \d+(\.\d+)? a 10 10 0 0 1 20 0$/);
    expect(arc?.attrs.fill).toBe('none');
  });

  it('datastore: cylinder body + top-ellipse outline + label', () => {
    expect(tags('datastore')).toEqual(['path', 'path', 'text']);
    const specs = shapeGlyphs(obj('datastore'));
    const d = String(specs[0]?.attrs.d);
    // body path: M, top arc (a), V, bottom arc, Z
    expect(d.startsWith('M 0 10')).toBe(true); // ry = min(60*0.2, 10) = 10
    expect(d).toContain('a 60 10 0 0 1 120 0');
    expect(d).toContain(`V ${60 - 10}`);
    expect(d.endsWith('Z')).toBe(true);
    expect(specs[1]?.attrs.class).toBe('pc-glyph');
  });

  it('queue: rect + arrow band glyph + divider line + label', () => {
    expect(tags('queue')).toEqual(['rect', 'path', 'line', 'text']);
    const specs = shapeGlyphs(obj('queue'));
    const band = specs[1];
    expect(String(band?.attrs.d)).toBe('M 108 24 H 116 L 108 36 Z');
    const line = specs[2];
    expect(line?.attrs.x1).toBe(108);
    expect(line?.attrs.y1).toBe(24);
    expect(line?.attrs.y2).toBe(36);
  });

  it('note: folded-corner path sized by NOTE_FOLD', () => {
    expect(tags('note')).toEqual(['path', 'path', 'text']);
    const specs = shapeGlyphs(obj('note'));
    expect(String(specs[0]?.attrs.d)).toBe(
      `M 0 0 H ${120 - NOTE_FOLD} L 120 ${NOTE_FOLD} V 60 H 0 Z`,
    );
  });

  it('group boundary: dashed-class rect + top-left pinned title', () => {
    const specs = shapeGlyphs(obj('group', { w: 300, h: 200 }));
    expect(specs[0]?.attrs.class).toBe('pc-shape pc-shape-boundary');
    expect(specs[0]?.attrs.width).toBe(300);
    const title = specs[1];
    expect(title?.attrs.x).toBe(8);
    expect(title?.attrs.y).toBe(16);
    expect(title?.attrs.class).toBe('pc-label pc-label-title');
  });

  it('name falls back to id', () => {
    const specs = shapeGlyphs(obj('system', { name: undefined }));
    expect(specs[1]?.text).toBe('o1');
  });

  it('theme tokens only: no hard-coded colors in any glyph spec', () => {
    // STYLE-GUIDE contract (M2-WP5): colors live in CSS custom properties.
    for (const kind of [
      'person',
      'system',
      'system_ext',
      'container',
      'component',
      'datastore',
      'queue',
      'note',
      'group',
    ] as const) {
      const specs = shapeGlyphs(obj(kind));
      const colorAttrs = specs.flatMap((s) =>
        Object.entries(s.attrs).filter(([k, v]) => /^(fill|stroke|color)$/.test(k) && String(v).startsWith('#')),
      );
      expect(colorAttrs).toEqual([]);
    }
  });

  it('small shapes clamp fold/head sizes (min() guards)', () => {
    const tiny = shapeGlyphs(obj('note', { w: 20, h: 20 }));
    const f = Math.min(NOTE_FOLD, 20 / 3, 20 / 3);
    expect(String(tiny[0]?.attrs.d)).toBe(`M 0 0 H ${20 - f} L 20 ${f} V 20 H 0 Z`);
    expect(f).toBeLessThan(NOTE_FOLD);
  });
});
