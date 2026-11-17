// SPDX-License-Identifier: GPL-3.0-only
// F-19 explicit waypoints: the router passes through them with orthogonal
// elbows, and the polyline keeps the port anchors.

import { describe, expect, it } from 'vitest';
import { routeOrtho, planLink, crossingEntities, type RouteInput } from './router';

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

  it('doglegs a leg around a third-party entity instead of crossing it', () => {
    // The waypoint is a legal point between the two ports: it is honoured, and
    // the leg that would otherwise cut the entity in half bends around it.
    const obstacle = { x: 180, y: 0, w: 40, h: 200 };
    const pts = routeOrtho({ from: A, to: B, obstacles: [obstacle], waypoints: [[200, 220]] });
    expect(pts.some((p) => p.x === 200 && p.y === 220)).toBe(true);
    expect(crossingEntities(pts, { from: A, to: B, obstacles: [obstacle],
      waypoints: [[200, 220]] })).toEqual([]);
  });

  it('skips a waypoint inside an entity and reports it', () => {
    // No route can honour this point without painting over the shape and its
    // label, so the point is skipped (never relocated) and diagnosed.
    const obstacle = { x: 180, y: 0, w: 40, h: 200 };
    const input: RouteInput = { from: A, to: B, obstacles: [obstacle], waypoints: [[200, 30]] };
    const pts = routeOrtho(input);
    expect(pts.some((p) => p.x === 200 && p.y === 30)).toBe(false);
    expect(crossingEntities(pts, input)).toEqual([]);
    expect(planLink(input).skips).toEqual([
      { reason: 'inside-entity', index: 0, point: { x: 200, y: 30 }, rect: obstacle },
    ]);
  });

  it('falls back to the automatic route without waypoints', () => {
    const withWp = routeOrtho({ from: A, to: B, waypoints: [] });
    const auto = routeOrtho({ from: A, to: B });
    expect(withWp).toEqual(auto);
  });

  it('elbows continue the incoming direction, not the waypoint index', () => {
    // Second leg arrives at w2 vertically, so the w2→b elbow must go
    // vertical-first too: adding or removing an earlier waypoint must not
    // flip downstream elbows (parity indexing did).
    const wps: [number, number][] = [
      [200, 30],
      [200, 150],
    ];
    const pts = routeOrtho({ from: A, to: B, waypoints: wps });
    const i2 = pts.findIndex((p) => p.x === 200 && p.y === 150);
    expect(i2).toBeGreaterThan(0);
    const after = pts[i2 + 1]!;
    // incoming to w2 is vertical (x stays 200), so the next move turns
    // horizontal only at w2: the elbow after w2 shares w2's x.
    expect(after.x).toBe(200);
  });

  it('leaves the source port outward before turning to an inward waypoint', () => {
    // A is left of B → port on A's right side. A waypoint placed left of A
    // must not make the first leg dive back through A: the route pays a
    // short outward stub first, exactly like an explicit anchor does.
    const pts = routeOrtho({ from: A, to: B, waypoints: [[-60, 30]] });
    const a = pts[0]!;
    expect(a).toEqual({ x: 100, y: 30 });
    const first = pts[1]!;
    expect(first.x).toBeGreaterThan(100); // stub goes right, not through A
    expect(first.y).toBe(30);
  });

  it('enters the target port outward, not through the shape', () => {
    // Waypoint above B while the picked side is B's left: the final leg must
    // approach the left port horizontally, not drop in from above the port.
    const pts = routeOrtho({ from: A, to: B, waypoints: [[430, 60]] });
    const b = pts.at(-1)!;
    expect(b).toEqual({ x: 400, y: 230 });
    const before = pts.at(-2)!;
    expect(before.y).toBe(230); // horizontal approach into the left port
    expect(before.x).toBeLessThan(400);
  });
});
