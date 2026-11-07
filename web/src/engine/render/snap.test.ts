// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  GRID_SIZE,
  GUIDE_THRESHOLD_PX,
  snapToGrid,
  snapRect,
  snapResize,
  computeGuides,
} from './snap';

describe('snap-to-grid (FR-C2)', () => {
  it('snaps to nearest multiple (ties round up)', () => {
    expect(snapToGrid(7, 8)).toBe(8);
    expect(snapToGrid(4, 8)).toBe(8); // 0.5 rounds up
    expect(snapToGrid(12, 8)).toBe(16); // 1.5 rounds up
    expect(snapToGrid(13, 8)).toBe(16);
    expect(snapToGrid(16, 8)).toBe(16);
    expect(snapToGrid(-3, 8)).toBe(0);
    expect(snapToGrid(5, 10)).toBe(10);
  });

  it('default grid is 8', () => {
    expect(GRID_SIZE).toBe(8);
    expect(snapToGrid(9)).toBe(8);
  });

  it('snapRect returns minimal delta', () => {
    expect(snapRect({ x: 10, y: 5, w: 40, h: 40 })).toEqual({ dx: -2, dy: 3 });
    expect(snapRect({ x: 16, y: 24, w: 40, h: 40 })).toEqual({ dx: 0, dy: 0 });
  });

  it('snapResize lands all edges on grid, keeps ≥1 cell', () => {
    expect(snapResize({ x: 3, y: 6, w: 41, h: 39 })).toEqual({ x: 0, y: 8, w: 48, h: 40 });
    expect(snapResize({ x: 0, y: 0, w: 2, h: 2 })).toEqual({ x: 0, y: 0, w: 8, h: 8 });
  });
});

describe('alignment guides (FR-C2)', () => {
  it('no guides when far apart', () => {
    const r = computeGuides({ x: 0, y: 0, w: 40, h: 40 }, [{ x: 500, y: 500, w: 40, h: 40 }]);
    expect(r.guides).toEqual([]);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
  });

  it('edge-to-edge vertical snap within threshold', () => {
    const moving = { x: 100, y: 0, w: 40, h: 40 }; // x2 = 140
    const staticRect = { x: 143, y: 300, w: 40, h: 40 }; // delta = 3 ✓
    const r = computeGuides(moving, [staticRect]);
    expect(r.dx).toBe(3);
    expect(r.guides).toContainEqual({ axis: 'v', at: 143, source: 'start' });
    expect(r.dy).toBe(0);
  });

  it('moving center snaps to static edge (closest anchor pair)', () => {
    const moving = { x: 0, y: 0, w: 40, h: 40 }; // anchors x 0/20/40
    const r = computeGuides(moving, [{ x: 23, y: 300, w: 40, h: 40 }]);
    // closest pair: moving center 20 → static left edge 23 (delta 3)
    expect(r.dx).toBe(3);
    expect(r.guides).toEqual([{ axis: 'v', at: 23, source: 'start' }]);
  });

  it('center-to-center alignment detects unique minimum', () => {
    const moving = { x: 0, y: 0, w: 40, h: 40 }; // cx 20
    const r = computeGuides(moving, [{ x: 23, y: 300, w: 34, h: 40 }]); // cx 40, x2 57
    // unique min: moving x2 40 ↔ static center 40 → already aligned (dx 0)
    expect(r.dx).toBe(0);
    expect(r.guides).toEqual([{ axis: 'v', at: 40, source: 'center' }]);
  });

  it('horizontal guide on y axis', () => {
    const moving = { x: 0, y: 50, w: 40, h: 40 }; // candidates y 50/70/90
    const r = computeGuides(moving, [{ x: 300, y: 88, w: 40, h: 40 }]); // 88 vs 90 → dy −2
    expect(r.dy).toBe(-2);
    expect(r.guides).toEqual([{ axis: 'h', at: 88, source: 'start' }]);
  });

  it('closest candidate wins within threshold', () => {
    const moving = { x: 0, y: 0, w: 40, h: 40 };
    const others = [
      { x: 43, y: 300, w: 40, h: 40 }, // delta 3 from x2=40 → picks this
      { x: -3, y: 300, w: 40, h: 40 }, // delta 3 from x=0 — tie; first found kept
    ];
    const r = computeGuides(moving, others);
    expect(Math.abs(r.dx)).toBe(3);
    expect(r.guides).toHaveLength(1);
  });

  it('both axes can fire at once', () => {
    const moving = { x: 0, y: 0, w: 40, h: 40 };
    const r = computeGuides(moving, [{ x: 2, y: -2, w: 40, h: 40 }]);
    expect(r.dx).toBe(2);
    expect(r.dy).toBe(-2);
    expect(r.guides).toHaveLength(2);
  });

  it('threshold is 4 px by default, larger deltas ignored', () => {
    expect(GUIDE_THRESHOLD_PX).toBe(4);
    const r = computeGuides({ x: 0, y: 0, w: 40, h: 40 }, [{ x: 6, y: 300, w: 40, h: 40 }]);
    expect(r.dx).toBe(0);
    expect(r.guides).toEqual([]);
  });

  it('custom threshold respected', () => {
    const r = computeGuides(
      { x: 0, y: 0, w: 40, h: 40 }, // candidates 0/20/40
      [{ x: 52, y: 300, w: 40, h: 40 }], // 52 vs 40 → delta 12
      14,
    );
    expect(r.dx).toBe(12);
  });
});
