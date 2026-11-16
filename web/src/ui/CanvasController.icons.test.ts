// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// IR v9 project icons on the canvas: the controller resolves an object's icon
// payload by its *current* name, so picking a different icon in the properties
// panel swaps the drawn glyph immediately.
//
// This is a regression test: the first implementation copied the payload onto the
// canvas object at load time, so after a pick the object kept drawing the old
// project icon (the code view said `icon queue`, the canvas still showed the
// brand mark).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from './CanvasController';
import { iconAssetsOf } from '../engine/render/iconAssets';
import { encodeIconSvg } from '../engine/format/iconSvg';
import { parsePDL } from '../engine/format/parser';
import { docToState } from '../workspace/workspace';
import type { Doc } from '../engine/model/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';

const SRC = `pcd 1.0
icon brand {
  media "image/svg+xml"
  data "${encodeIconSvg(MARK)}"
}
system shop "Webshop" {
  icon brand
}
system plain "Plain"
shop -> plain
`;

let svg: SVGSVGElement;
let ctrl: CanvasController;

const doc = (): Doc => {
  const parsed = parsePDL(SRC).doc;
  if (parsed === null) throw new Error('fixture must parse');
  return parsed;
};

const glyphs = (id: string): Element[] => {
  const group = svg.querySelector(`g.pc-obj[data-id="${id}"]`);
  return group === null ? [] : [...group.querySelectorAll('.pc-glyph-icon')];
};

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(svg);
  ctrl = new CanvasController(svg);
  const d = doc();
  ctrl.loadState(docToState(d));
  ctrl.setIconAssets(iconAssetsOf(d));
});

afterEach(() => {
  ctrl.destroy();
  svg.remove();
});

describe('project icons on the canvas', () => {
  it('draws a declared icon as an embedded image', () => {
    const drawn = glyphs('shop');
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.tagName.toLowerCase()).toBe('image');
    expect(drawn[0]?.getAttribute('href')).toMatch(/^data:image\/svg\+xml;base64,/);
    // an object without an icon draws none
    expect(glyphs('plain')).toEqual([]);
  });

  it('swaps to a built-in icon when the name changes, and back again', () => {
    ctrl.updateObject('shop', { style: { icon: 'queue' } });
    const builtIn = glyphs('shop');
    expect(builtIn.length).toBeGreaterThan(0);
    for (const g of builtIn) expect(g.tagName.toLowerCase()).toBe('path');

    ctrl.updateObject('shop', { style: { icon: 'brand' } });
    const project = glyphs('shop');
    expect(project).toHaveLength(1);
    expect(project[0]?.tagName.toLowerCase()).toBe('image');
  });

  it('draws nothing for a name the document does not deliver', () => {
    ctrl.updateObject('shop', { style: { icon: 'ghost' } });
    expect(glyphs('shop')).toEqual([]);
  });

  it('forgets a payload as soon as the document stops declaring it', () => {
    const d = doc();
    ctrl.setIconAssets(iconAssetsOf({ ...d, icons: [] }));
    expect(glyphs('shop')).toEqual([]);
  });

  it('publishing the same payloads again is not a repaint', () => {
    // Loop guard: the shell publishes from a render effect, so a publish that
    // always repainted would re-enter the effect forever (it did — the App tests
    // hung). Equal content must be a no-op; new content must repaint once.
    const seen: string[] = [];
    const counted = new CanvasController(svg, { onState: () => seen.push('state') });
    const d = doc();
    counted.loadState(docToState(d));
    counted.setIconAssets(iconAssetsOf(d));
    const first = seen.length;
    counted.setIconAssets(iconAssetsOf(d));
    expect(seen.length).toBe(first);
    counted.setIconAssets(iconAssetsOf({ ...d, icons: [] }));
    expect(seen.length).toBe(first + 1);
    counted.destroy();
  });
});
