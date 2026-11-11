// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { buildMiniMap, miniMapPointToCanvas, visibleCanvasRect } from './miniMapGeometry';

const objects = [
  { x: 0, y: 0, w: 100, h: 60 },
  { x: 500, y: 300, w: 160, h: 80 },
];

describe('mini-map geometry', () => {
  it('derives the visible canvas rect from the real viewport transform', () => {
    expect(visibleCanvasRect({ x: -100, y: 50, k: 2 }, { w: 800, h: 600 })).toEqual({
      x: 50, y: -25, w: 400, h: 300,
    });
  });

  it('contains all objects and the viewport, with finite letterboxing', () => {
    const map = buildMiniMap(objects, { x: 0, y: 0, k: 1 }, { w: 800, h: 600 }, { w: 180, h: 120 });
    expect(map.bounds.x).toBeLessThan(0);
    expect(map.bounds.y).toBeLessThan(0);
    expect(map.viewport.w).toBeGreaterThan(0);
    expect(map.viewport.h).toBeGreaterThan(0);
    expect(map.objects).toHaveLength(2);
    for (const r of [...map.objects, map.viewport]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(180);
      expect(r.y + r.h).toBeLessThanOrEqual(120);
    }
  });

  it('maps pointer positions back into canvas coordinates', () => {
    const map = buildMiniMap(objects, { x: 0, y: 0, k: 1 }, { w: 800, h: 600 }, { w: 180, h: 120 });
    const first = map.objects[0]!;
    const point = miniMapPointToCanvas(map, { x: first.x + first.w / 2, y: first.y + first.h / 2 });
    expect(point.x).toBeCloseTo(50);
    expect(point.y).toBeCloseTo(30);
  });

  it('keeps an empty diagram navigable', () => {
    const map = buildMiniMap([], { x: 10, y: 20, k: 1 }, { w: 800, h: 600 }, { w: 180, h: 120 });
    expect(map.objects).toEqual([]);
    expect(map.viewport.w).toBeGreaterThan(100);
    expect(Number.isFinite(map.viewport.x)).toBe(true);
  });
});
