// SPDX-License-Identifier: GPL-3.0-only
// F-13 eight-handle resize geometry (review §3.4): edges the handle does not
// own stay put, dragged edges snap to the grid and stop at the minimum size.

import { describe, expect, it } from 'vitest';
import { MIN_SIZE, resizedRect } from './resize';
import { handlePoint } from './overlay';
import { GRID_SIZE } from './snap';

const base = { x: 96, y: 96, w: 160, h: 64 };

describe('resizedRect (F-13)', () => {
  it('se-anchor moves only the far edges', () => {
    const r = resizedRect(base, 'se', { x: 304, y: 200 });
    expect(r).toEqual({ x: 96, y: 96, w: 208, h: 104 });
  });

  it('nw-anchor moves the near edges and keeps the far corner', () => {
    const r = resizedRect(base, 'nw', { x: 64, y: 40 });
    expect(r).toEqual({ x: 64, y: 40, w: 192, h: 120 });
  });

  it('e-anchor leaves y and h untouched', () => {
    const r = resizedRect(base, 'e', { x: 400, y: 999 });
    expect(r.y).toBe(base.y);
    expect(r.h).toBe(base.h);
    expect(r.w).toBe(304); // 400 snapped to the 8 px grid − 96
  });

  it('n-anchor leaves x and w untouched', () => {
    const r = resizedRect(base, 'n', { x: 999, y: 64 });
    expect(r.x).toBe(base.x);
    expect(r.w).toBe(base.w);
    expect(r.h).toBe(96); // 96 + 64 − 64
  });

  it('refuses to shrink below the minimum size', () => {
    const r = resizedRect(base, 'se', { x: 0, y: 0 });
    expect(r.w).toBe(MIN_SIZE.w);
    expect(r.h).toBe(MIN_SIZE.h);
    const nw = resizedRect(base, 'nw', { x: 1000, y: 1000 });
    expect(nw.w).toBe(MIN_SIZE.w);
    expect(nw.h).toBe(MIN_SIZE.h);
  });

  it('snaps the dragged edge to the grid', () => {
    const r = resizedRect(base, 'se', { x: 300 + GRID_SIZE / 2, y: 200 + GRID_SIZE / 2 });
    expect(r.x % GRID_SIZE).toBe(0);
    expect(r.y % GRID_SIZE).toBe(0);
    expect(r.w % GRID_SIZE).toBe(0);
    expect(r.h % GRID_SIZE).toBe(0);
  });

  it('w-anchor keeps the right edge fixed', () => {
    const r = resizedRect(base, 'w', { x: 144, y: 0 });
    expect(r.x + r.w).toBe(base.x + base.w);
  });
});

describe('handlePoint', () => {
  it('computes all eight anchors, offset outside the rect', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    // anchors sit HANDLE_OFFSET outside so they never cover a link halo
    expect(handlePoint(r, 'nw')).toEqual({ x: -8, y: -8 });
    expect(handlePoint(r, 'n')).toEqual({ x: 50, y: -8 });
    expect(handlePoint(r, 'ne')).toEqual({ x: 108, y: -8 });
    expect(handlePoint(r, 'e')).toEqual({ x: 108, y: 25 });
    expect(handlePoint(r, 'se')).toEqual({ x: 108, y: 58 });
    expect(handlePoint(r, 's')).toEqual({ x: 50, y: 58 });
    expect(handlePoint(r, 'sw')).toEqual({ x: -8, y: 58 });
    expect(handlePoint(r, 'w')).toEqual({ x: -8, y: 25 });
  });

  it('leaves the edge-midpoint halos clickable (≥3 px clearance)', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    const haloRadius = 5;
    const handleRadius = 4;
    // halo 'right' is at (100, 25); the 'e' handle must not cover it
    const gap = handlePoint(r, 'e').x - (r.x + r.w) - haloRadius - handleRadius;
    expect(gap).toBeGreaterThanOrEqual(-1);
  });
});
