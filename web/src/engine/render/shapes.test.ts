// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  shapeGlyphs, CONTENT_PAD, LABEL_ASCENT, contentBox, SHAPE_RADIUS, NOTE_FOLD, type SceneObject,
} from './shapes';

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

const ALL_KINDS: SceneObject['kind'][] = [
  'person', 'system', 'system_ext', 'container', 'component', 'datastore', 'queue', 'note', 'group',
];

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
    // UX08-WP07: the head is centred in the person's own top band.
    expect(head?.attrs.cx).toBe(60); // w/2
    expect(head?.attrs.r).toBe(6);
    const arc = specs[2];
    expect(String(arc?.attrs.d)).toMatch(/^M 50 \d+(\.\d+)? a 10 10 0 0 1 20 0$/);
    expect(arc?.attrs.class).toBe('pc-glyph');
    expect(arc?.attrs.fill).toBeUndefined();
  });

  it('datastore: cylinder body + top-ellipse outline + label', () => {
    expect(tags('datastore')).toEqual(['path', 'path', 'text']);
    const specs = shapeGlyphs(obj('datastore', { h: 64 }));
    const d = String(specs[0]?.attrs.d);
    // body path: M, top arc (a), V, bottom arc, Z
    expect(d.startsWith('M 0 10')).toBe(true); // ry = min(60*0.2, 10) = 10
    expect(d).toContain('a 60 10 0 0 1 120 0');
    expect(d).toContain(`V ${64 - contentBox(obj('datastore', { h: 64 })).glyphTop - 10}`);
    expect(d.endsWith('Z')).toBe(true);
    expect(specs[1]?.attrs.class).toBe('pc-glyph pc-glyph-outline');
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

  it('keeps person and datastore labels below/above their glyph regions', () => {
    for (const labelLines of [['Customer'], ['Preferred', 'Customer']]) {
      const person = shapeGlyphs(obj('person', { h: 120, labelLines }));
      const head = person.find((s) => s.tag === 'circle')!;
      const shoulder = person.find((s) => s.tag === 'path' && s.attrs.class === 'pc-glyph')!;
      const texts = person.filter((s) => s.tag === 'text');
      const blockTop = Number(texts[0]?.attrs.y) - LABEL_ASCENT;
      const shoulderParts = /M \S+ (\S+) a (\S+)/.exec(String(shoulder.attrs.d))!;
      const glyphBottom = Number(shoulderParts[1]); // arc starts at the bottom-left endpoint
      expect(blockTop - glyphBottom).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(Number(head.attrs.cy)).toBeLessThan(blockTop);

      const datastore = shapeGlyphs(obj('datastore', { h: 120, labelLines }));
      const top = datastore[1]!;
      const labels = datastore.filter((s) => s.tag === 'text');
      const ry = /a 60 (\S+) 0/.exec(String(top.attrs.d))!;
      const dataTop = Number(labels[0]?.attrs.y) - LABEL_ASCENT;
      expect(dataTop - 8).toBeGreaterThanOrEqual(2 * Number(ry[1]) + 4);
    }
  });

  it('reserves horizontal regions for queue, note, and imported badges', () => {
    const cases: Array<[SceneObject['kind'], Partial<SceneObject>, number]> = [
      ['queue', {}, 16],
      ['note', {}, 16],
      ['system', { ghost: true }, 52],
    ];
    for (const [kind, over, reserve] of cases) {
      const text = shapeGlyphs(obj(kind, over)).find((s) => s.tag === 'text' && s.attrs.class === 'pc-label')!;
      expect(Number(text.attrs.x)).toBe((120 - reserve) / 2);
    }
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

});

// UX08-WP07: one content box drives the icon band, the glyph band and the label
// region — icon at the top center, label block centred in what is left.
describe('content box (UX08-WP07)', () => {
  const ICON_KINDS: SceneObject['kind'][] = [
    'person', 'system', 'system_ext', 'container', 'component', 'datastore', 'queue', 'note',
  ];

  it('puts every icon at the top center of its shape', () => {
    for (const kind of ICON_KINDS) {
      for (const h of [96, 140]) {
        const box = contentBox(obj(kind, { icon: 'cloud', h }));
        expect(box.icon, kind).not.toBeNull();
        const icon = box.icon!;
        expect(icon.x + icon.size / 2, `${kind} icon center x`).toBeCloseTo(120 / 2, 6);
        expect(icon.y, `${kind} icon top`).toBe(CONTENT_PAD.top);
        expect(icon.size, `${kind} icon fits`).toBeLessThanOrEqual(h / 3 + 1e-9);
      }
    }
  });

  it('centres the whole label block in the region between icon and bottom padding', () => {
    for (const kind of ICON_KINDS) {
      for (const labelLines of [['Customer'], ['Preferred', 'Customer Experience']]) {
        const object = obj(kind, { icon: 'cloud', h: 140, labelLines });
        const box = contentBox(object);
        const texts = shapeGlyphs(object).filter((s) => s.tag === 'text' && s.attrs.class === 'pc-label');
        expect(texts, kind).toHaveLength(labelLines.length);
        const blockTop = Number(texts[0]?.attrs.y) - LABEL_ASCENT;
        const blockBottom = Number(texts.at(-1)?.attrs.y) + (16 - LABEL_ASCENT);
        const blockCenter = (blockTop + blockBottom) / 2;
        expect(blockCenter, `${kind} label block center y`).toBeCloseTo(
          (box.label.top + box.label.bottom) / 2, 6,
        );
        // …and that region starts below the icon band.
        expect(box.label.top).toBeGreaterThanOrEqual(CONTENT_PAD.top + box.icon!.size);
        expect(box.label.bottom).toBeLessThanOrEqual(140 - CONTENT_PAD.bottom);
        // Horizontal center of the label region.
        for (const text of texts) {
          expect(Number(text.attrs.x), `${kind} label center x`).toBeCloseTo(
            Math.max(box.label.left + 4, (box.label.left + box.label.right) / 2), 6,
          );
        }
      }
    }
  });

  it('keeps the label region clear of built-in glyph bands', () => {
    for (const kind of ICON_KINDS) {
      const box = contentBox(obj(kind, { icon: 'cloud', h: 140 }));
      expect(box.label.top, `${kind} label top`).toBeGreaterThan(box.glyphTop + box.glyphHeight - 1e-9);
    }
  });

  it('moves the icon beside the label when the box cannot stack it', () => {
    for (const kind of ICON_KINDS) {
      const box = contentBox(obj(kind, { icon: 'cloud', h: 32 }));
      expect(box.icon, kind).not.toBeNull();
      const icon = box.icon!;
      // Inline fallback: icon at the left padding, label region to its right.
      expect(icon.x, `${kind} inline icon x`).toBe(CONTENT_PAD.x);
      expect(box.label.left, `${kind} label clears the icon`).toBeGreaterThanOrEqual(
        icon.x + icon.size,
      );
      // …and nothing is cropped: the icon stays inside the shape.
      expect(icon.y, `${kind} inline icon top`).toBeGreaterThanOrEqual(0);
      expect(icon.y + icon.size, `${kind} inline icon bottom`).toBeLessThanOrEqual(32);
    }
  });

  it('groups keep their top-left title instead of a centred block', () => {
    const group = shapeGlyphs(obj('group', { icon: 'cloud' })).find((s) => s.tag === 'text')!;
    expect(Number(group.attrs.x)).toBe(8);
    expect(Number(group.attrs.y)).toBe(16);
    // The icon is still centred; the boundary title keeps its own corner.
    const icon = contentBox(obj('group', { icon: 'cloud' })).icon!;
    expect(icon.x + icon.size / 2).toBeCloseTo(60, 6);
  });
});

// UX08-WP07 vision review: `fill: 'none'` written as an attribute is overridden
// by the stylesheet's `.pc-glyph` fill, so unfilled strokes need a class.
describe('glyph fills (UX08-WP07)', () => {
  it('opts unfilled glyph strokes out of the shared fill by class, not attribute', () => {
    const outlined = (kind: SceneObject['kind']): number =>
      shapeGlyphs(obj(kind)).filter((s) => s.attrs.class === 'pc-glyph pc-glyph-outline').length;
    expect(outlined('person'), 'person: filled like its head').toBe(0);
    expect(outlined('datastore'), 'datastore: lid ellipse').toBe(1);
    expect(outlined('note'), 'note: corner fold').toBe(1);
    // The defect was visible in both themes: shoulders, lid and fold rendered as
    // filled muted blobs (a light lid on a dark body in dark theme).
    for (const kind of ALL_KINDS) {
      for (const spec of shapeGlyphs(obj(kind))) {
        expect(spec.attrs.fill, `${kind} ${spec.tag}`).toBeUndefined();
      }
    }
  });
});

describe('tiny shapes (M2-WP5)', () => {
  it('clamp fold/head sizes (min() guards)', () => {
    const tiny = shapeGlyphs(obj('note', { w: 20, h: 20 }));
    const f = Math.min(NOTE_FOLD, 20 / 3, 20 / 3);
    expect(String(tiny[0]?.attrs.d)).toBe(`M 0 0 H ${20 - f} L 20 ${f} V 20 H 0 Z`);
    expect(f).toBeLessThan(NOTE_FOLD);
  });
});
