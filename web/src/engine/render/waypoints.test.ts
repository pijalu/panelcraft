// SPDX-License-Identifier: GPL-3.0-only
// F-19 explicit waypoints: the router passes through them with orthogonal
// elbows, and the polyline keeps the port anchors.

import { describe, expect, it } from 'vitest';
import { routeOrtho } from './router';

const A = { x: 0, y: 0, w: 100, h: 60 };
const B = { x: 400, y: 200, w: 100, h: 60 };

describe('routeOrtho with waypoints (F-19)', () => {
  it('passes through every waypoint in order', () => {
    const wps: [number, number][] = [
      [200, 30],
      [300, 150],
    ];
    const pts = routeOrtho({ from: A, to: B, waypoints: wps });
    for (const wp of wps) {
      expect(pts.some((p) => p.x === wp[0] && p.y === wp[1])).toBe(true);
    }
    // …in the order given
    const idx = wps.map((wp) => pts.findIndex((p) => p.x === wp[0] && p.y === wp[1]));
    expect(idx[0]).toBeLessThan(idx[1]!);
  });

  it('keeps every segment axis-aligned (orthogonal elbows)', () => {
    const pts = routeOrtho({ from: A, to: B, waypoints: [[200, 30]] });
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      expect(p.x === q.x || p.y === q.y).toBe(true);
    }
  });

  it('ignores obstacles when the user stated the path', () => {
    const pts = routeOrtho({
      from: A,
      to: B,
      obstacles: [{ x: 180, y: 0, w: 40, h: 200 }],
      waypoints: [[200, 30]],
    });
    expect(pts.some((p) => p.x === 200 && p.y === 30)).toBe(true);
  });

  it('falls back to the automatic route without waypoints', () => {
    const withWp = routeOrtho({ from: A, to: B, waypoints: [] });
    const auto = routeOrtho({ from: A, to: B });
    expect(withWp).toEqual(auto);
  });
});
