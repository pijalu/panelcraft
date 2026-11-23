// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Quick-add places a shape at the centre of the view. Before the fix the second
// quick-add landed exactly on the first one, hiding it until the user dragged
// the shapes apart — the two could not even be connected without that detour.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CanvasController } from './CanvasController';
import { GRID_SIZE } from '../engine/render/snap';

const SVG_NS = 'http://www.w3.org/2000/svg';

let svg: SVGSVGElement;
let ctrl: CanvasController;

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(svg);
  ctrl = new CanvasController(svg);
});

afterEach(() => {
  ctrl.destroy();
  svg.remove();
});

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('implicit placement cascades past occupied spots', () => {
  it('two quick-adds are both fully visible, side by side, on the grid', () => {
    ctrl.quickAdd(1);
    ctrl.quickAdd(2);
    const first = ctrl.snapshot.objects[0]!;
    const second = ctrl.snapshot.objects[1]!;
    expect(overlap(first, second)).toBe(false);
    expect(second.x).toBeGreaterThan(first.x + first.w);
    // The new shape stays at the same height band: reading order, left to right.
    expect(Math.abs(second.y + second.h / 2 - (first.y + first.h / 2))).toBeLessThan(GRID_SIZE);
    for (const o of [first, second]) {
      expect(o.x % GRID_SIZE).toBe(0);
      expect(o.y % GRID_SIZE).toBe(0);
    }
    // Both inside the 800 × 600 view (the centre of the view is 400, 300).
    for (const o of [first, second]) {
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x + o.w).toBeLessThanOrEqual(800);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y + o.h).toBeLessThanOrEqual(600);
    }
  });

  it('keeps a run of quick-adds clear of each other, the first ones inside the view', () => {
    for (let i = 0; i < 12; i++) ctrl.quickAdd((i % 9) + 1);
    const objects = ctrl.snapshot.objects.filter((o): o is NonNullable<typeof o> => o !== undefined);
    // Never on top of another shape, whatever the mix of sizes.
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        expect(overlap(objects[i]!, objects[j]!), `${objects[i]!.id} overlaps ${objects[j]!.id}`).toBe(false);
      }
    }
    // The view is 800 × 600: the first six default-sized shapes fit inside it,
    // so none of them is pushed off-screen while there is still room.
    for (const o of objects.slice(0, 6)) {
      expect(o.x, `${o.id} left`).toBeGreaterThanOrEqual(0);
      expect(o.x + o.w, `${o.id} right`).toBeLessThanOrEqual(800);
      expect(o.y, `${o.id} top`).toBeGreaterThanOrEqual(0);
      expect(o.y + o.h, `${o.id} bottom`).toBeLessThanOrEqual(600);
    }
  });

  it('moves a new shape clear of one already sitting in the centre of the view', () => {
    ctrl.loadState({
      objects: [{ id: 'api', kind: 'system', x: 320, y: 270, w: 160, h: 60, name: 'API' }],
      links: [],
    });
    const id = ctrl.quickAdd(2);
    const added = ctrl.snapshot.objects.find((o) => o.id === id)!;
    const existing = ctrl.snapshot.objects[0]!;
    expect(overlap(added, existing)).toBe(false);
  });

  it('leaves an explicit position (palette drop, paste) exactly where it was asked', () => {
    ctrl.addObject('system', { x: 200, y: 150 });
    ctrl.addObject('system', { x: 200, y: 150 });
    const first = ctrl.snapshot.objects[0]!;
    const second = ctrl.snapshot.objects[1]!;
    expect([second.x, second.y]).toEqual([first.x, first.y]);
  });
});
