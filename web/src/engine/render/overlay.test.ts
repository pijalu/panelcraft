// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest';
import { drawSegmentHandles } from './overlay';
import type { Rect } from './viewport';

const SVG_NS = 'http://www.w3.org/2000/svg';
let overlay: SVGGElement;

beforeEach(() => {
  overlay = document.createElementNS(SVG_NS, 'g') as SVGGElement;
});

function paint(axis: 'h' | 'v', label: Rect): SVGRectElement {
  drawSegmentHandles(overlay, [
    { from: 1, to: 1, mid: { x: 100, y: 100 }, axis, editable: true },
  ], 'L1', () => 'Slide segment', label);
  return overlay.querySelector('.pc-segment') as SVGRectElement;
}

function bounds(handle: SVGRectElement): Rect {
  return {
    x: Number(handle.getAttribute('x')),
    y: Number(handle.getAttribute('y')),
    w: Number(handle.getAttribute('width')),
    h: Number(handle.getAttribute('height')),
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe('segment handle label clearance', () => {
  it('moves a colliding horizontal handle to the nearest clear side of a short label', () => {
    const label = { x: 90, y: 90, w: 40, h: 20 };
    const handle = bounds(paint('h', label));
    expect(overlaps(handle, label)).toBe(false);
    expect(handle.y + handle.h / 2).toBe(100);
    expect(handle.x + handle.w / 2).toBeLessThan(label.x);
  });

  it('moves a colliding vertical handle clear of a wrapped label on the same channel', () => {
    const label = { x: 80, y: 85, w: 180, h: 46 };
    const handle = bounds(paint('v', label));
    expect(overlaps(handle, label)).toBe(false);
    expect(handle.x + handle.w / 2).toBe(100);
    expect(handle.y + handle.h / 2).toBeLessThan(label.y);
  });

  it('keeps an already clear midpoint unchanged', () => {
    const handle = bounds(paint('h', { x: 200, y: 200, w: 30, h: 20 }));
    expect(handle).toEqual({ x: 95.5, y: 95.5, w: 9, h: 9 });
  });

  it('keeps exactly one handle for each editable non-diagonal channel', () => {
    drawSegmentHandles(overlay, [
      { from: 0, to: 0, mid: { x: 0, y: 0 }, axis: 'h', editable: false },
      { from: 1, to: 1, mid: { x: 100, y: 100 }, axis: 'h', editable: true },
      { from: 2, to: 2, mid: { x: 200, y: 200 }, axis: 'v', editable: true },
      { from: 3, to: 3, mid: { x: 300, y: 300 }, axis: 'diag', editable: true },
    ], 'L1', () => 'Slide segment', { x: 80, y: 80, w: 40, h: 40 });
    expect(overlay.querySelectorAll('.pc-segment')).toHaveLength(2);
  });
});
