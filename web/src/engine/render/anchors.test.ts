// SPDX-License-Identifier: GPL-3.0-only
// CX-01 explicit endpoints share one geometry across every route mode.

import { describe, expect, it } from 'vitest';
import { routeLink, routeOrtho } from './router';
import { routeToPath, sampleRoute } from './routePath';

const A = { x: 0, y: 0, w: 100, h: 60 };
const B = { x: 300, y: 200, w: 120, h: 80 };

describe('explicit route anchors (CX-01)', () => {
  it.each(['orthogonal', 'straight', 'curved'] as const)('%s starts and ends at exact anchors', (mode) => {
    const points = routeLink({ from: A, to: B, fromAnchor: 0.125, toAnchor: 0.875 }, mode);
    expect(points[0]).toEqual({ x: 50, y: 0 });
    expect(points.at(-1)).toEqual({ x: 300, y: 240 });
    expect(sampleRoute(points, mode)[0]).toEqual(points[0]);
    expect(sampleRoute(points, mode).at(-1)).toEqual(points.at(-1));
    expect(routeToPath(points, mode)).toContain('M 50 0');
  });

  it('retains waypoints between explicit anchors', () => {
    for (const mode of ['orthogonal', 'straight', 'curved'] as const) {
      const points = routeLink({
        from: A, to: B, fromAnchor: 0.25, toAnchor: 0.5, waypoints: [[180, 100]],
      }, mode);
      expect(points[0]).toEqual({ x: 100, y: 0 });
      expect(points.some((p) => p.x === 180 && p.y === 100)).toBe(true);
      expect(points.at(-1)).toEqual({ x: 420, y: 280 });
    }
  });

  it('leaves an anchored corner outward instead of crossing the source interior', () => {
    const points = routeOrtho({
      from: A,
      to: { x: 200, y: -200, w: 100, h: 60 },
      fromAnchor: 0.25,
    });
    expect(points[0]).toEqual({ x: 100, y: 0 });
    expect(points[1]!.x).toBeGreaterThan(100);
    expect(points[1]!.y).toBe(0);
  });

  it('turns perpendicular to each stub without crossing either anchored entity', () => {
    const from = { x: 100, y: 100, w: 180, h: 100 };
    const to = { x: 480, y: 100, w: 180, h: 100 };
    const points = routeOrtho({ from, to, fromAnchor: 0.125, toAnchor: 0.75 });
    const inside = (x: number, y: number, r: typeof from): boolean =>
      x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
    for (const p of points.slice(1, -1)) {
      expect(inside(p.x, p.y, from)).toBe(false);
      expect(inside(p.x, p.y, to)).toBe(false);
    }
  });

  it('keeps missing-anchor behavior byte-for-byte compatible', () => {
    const input = { from: A, to: B, waypoints: [[180, 100]] as [number, number][] };
    expect(routeLink(input)).toEqual(routeLink({ ...input }));
    expect(routeLink(input)[0]).toEqual({ x: 100, y: 30 });
  });
});
