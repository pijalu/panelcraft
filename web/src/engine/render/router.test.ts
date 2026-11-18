// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  portPoint,
  pickSides,
  routeOrtho,
  routeLink,
  arrowDirection,
  planLink,
  labelPoint,
  polylineLength,
  distanceToPolyline,
  ROUTER_CLEARANCE,
  type Polyline,
} from './router';
import { sampleRoute } from './routePath';

const R = (x: number, y: number, w = 80, h = 40) => ({ x, y, w, h });

describe('anchors + sides', () => {
  it('portPoint centers of each side', () => {
    const r = R(0, 0, 80, 40);
    expect(portPoint(r, 'top')).toEqual({ x: 40, y: 0 });
    expect(portPoint(r, 'bottom')).toEqual({ x: 40, y: 40 });
    expect(portPoint(r, 'left')).toEqual({ x: 0, y: 20 });
    expect(portPoint(r, 'right')).toEqual({ x: 80, y: 20 });
  });

  it('pickSides: horizontal dominance', () => {
    expect(pickSides(R(0, 0), R(300, 10))).toEqual(['right', 'left']);
    expect(pickSides(R(300, 0), R(0, 10))).toEqual(['left', 'right']);
  });

  it('pickSides: vertical dominance', () => {
    expect(pickSides(R(0, 0), R(10, 300))).toEqual(['bottom', 'top']);
    expect(pickSides(R(0, 300), R(10, 0))).toEqual(['top', 'bottom']);
  });
});

describe('routeOrtho (WP6 v1)', () => {
  it('aligned horizontally → straight 2-point route', () => {
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 0) });
    expect(pts).toEqual([
      { x: 80, y: 20 },
      { x: 300, y: 20 },
    ]);
  });

  it('offset vertically → Z route with mid channel', () => {
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 100) });
    expect(pts).toHaveLength(4);
    expect(pts.at(0)).toEqual({ x: 80, y: 20 }); // exit right
    expect(pts.at(3)).toEqual({ x: 300, y: 120 }); // enter left
    expect(pts.at(1)?.x).toBe(pts.at(2)?.x); // vertical channel
    expect(pts.at(1)?.x).toBe((80 + 300) / 2);
    expect(pts.at(1)?.y).toBe(20);
    expect(pts.at(2)?.y).toBe(120);
  });

  it('vertical dominance → horizontal channel at mid y', () => {
    const pts = routeOrtho({ from: R(0, 0), to: R(20, 300) });
    expect(pts.at(0)).toEqual({ x: 40, y: 40 }); // exit bottom
    expect(pts.at(1)?.y).toBe(pts.at(2)?.y);
    expect(pts.at(1)?.y).toBe((40 + 300) / 2);
  });

  it('Customer–Blah obstacle detour enters both automatic endpoints perpendicularly', () => {
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 0), obstacles: [R(160, 0, 40, 40)] });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i - 1]!.x === pts[i]!.x || pts[i - 1]!.y === pts[i]!.y).toBe(true);
    }
    expect(pts[1]!.y).toBe(pts[0]!.y); // right-side exit is horizontal
    expect(pts.at(-2)!.y).toBe(pts.at(-1)!.y); // left-side entry is horizontal
  });

  it('automatic avoidance never chooses a diagonal orthogonal shortcut', () => {
    const pts = routeOrtho({ from: R(0, 0), to: R(120, 40), obstacles: [R(80, 0, 40, 40)] });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i - 1]!.x === pts[i]!.x || pts[i - 1]!.y === pts[i]!.y).toBe(true);
    }
  });

  it('preserves explicit endpoint anchors during obstacle avoidance', () => {
    const pts = routeOrtho({
      from: R(0, 0), to: R(300, 0), obstacles: [R(160, 0, 40, 40)],
      fromAnchor: 0.375, toAnchor: 0.875,
    });
    expect(pts[0]).toEqual({ x: 80, y: 20 });
    expect(pts.at(-1)).toEqual({ x: 300, y: 20 });
  });

  it('channel detours around obstacle (horizontal case)', () => {
    const obstacle = R(160, 0, 40, 40); // sits on mid x=190 channel
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 0), obstacles: [obstacle] });
    // straight run y=20 crosses obstacle (y 0..40, x 160..200) → detour
    expect(pts).toEqual([
      { x: 80, y: 20 }, { x: 92, y: 20 }, { x: 92, y: 52 },
      { x: 288, y: 52 }, { x: 288, y: 20 }, { x: 300, y: 20 },
    ]);
    // Both endpoint legs stay horizontal; only the interior channel detours.
    const ny = pts.at(2)?.y;
    expect(ny).toBe(R(0, 0).h + ROUTER_CLEARANCE); // bottom edge + clearance = 52
    expect(pts.at(3)).toEqual({ x: 288, y: ny });
    // final segment returns to the entry anchor
    expect(pts.at(-1)).toEqual({ x: 300, y: 20 });
  });

  it('detours the whole Z route around an obstacle, including its endpoint legs', () => {
    const obstacle = R(150, 0, 60, 200); // blocks the vertical channel and both legs
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 100), obstacles: [obstacle] });
    expect(pts).toEqual([
      { x: 80, y: 20 }, { x: 92, y: 20 }, { x: 92, y: -24 },
      { x: 288, y: -24 }, { x: 288, y: 120 }, { x: 300, y: 120 },
    ]);
  });

  it('no detour when obstacle clear of channel', () => {
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 100), obstacles: [R(280, 400)] });
    expect(pts).toHaveLength(4);
    expect(pts.at(1)?.x).toBe(190); // untouched mid channel
  });

  it('deterministic: same input → same output', () => {
    const input = { from: R(0, 0), to: R(300, 100), obstacles: [R(150, 0, 60, 200)] };
    expect(routeOrtho(input)).toEqual(routeOrtho(input));
  });
});

describe('route modes', () => {
  it('straight mode joins side anchors diagonally and preserves waypoints', () => {
    expect(routeLink({ from: R(0, 0), to: R(300, 100) }, 'straight')).toEqual([
      { x: 80, y: 20 },
      { x: 300, y: 120 },
    ]);
    expect(routeLink({ from: R(0, 0), to: R(300, 100), waypoints: [[150, 200]] }, 'straight'))
      .toEqual([{ x: 80, y: 20 }, { x: 150, y: 200 }, { x: 300, y: 120 }]);
  });

  it('curved mode uses the same anchors and leaves orthogonal behavior unchanged', () => {
    const input = { from: R(0, 0), to: R(300, 100), obstacles: [R(150, 0, 60, 200)] };
    const curved = routeLink(input, 'curved');
    const straight = routeLink(input, 'straight');
    // The anchors are shared; the curved route adds short stubs at both ends so
    // its tangents leave the source edge and arrive on the target edge.
    expect(curved.at(0)).toEqual(straight.at(0));
    expect(curved.at(-1)).toEqual(straight.at(-1));
    expect(routeLink(input, 'orthogonal')).toEqual(routeOrtho(input));
  });

  it('curved route arrives along the target edge normal, so the arrow points into the entity', () => {
    // Reported shape: the target sits below-right, and the curve used to end by
    // travelling straight down the target's left edge — the arrowhead pointed
    // away from the element instead of into it.
    const from = R(20, 20, 245, 145);
    const to = R(408, 305, 317, 105);
    const plan = planLink({ from, to }, 'curved');
    // The polyline keeps the plain anchors: no invented geometry.
    expect(plan.points).toEqual([{ x: 265, y: 92.5 }, { x: 408, y: 357.5 }]);
    // The end tangent points into the entity (from the left edge, rightwards).
    expect(plan.ends).toEqual({ start: { x: 1, y: 0 }, end: { x: 1, y: 0 } });
    const sampled = sampleRoute(plan.points, 'curved', plan.ends);
    const last = sampled.at(-1)!;
    const prev = sampled.at(-2)!;
    expect(last.x).toBeCloseTo(to.x, 5);
    expect(Math.abs(last.x - prev.x)).toBeGreaterThan(Math.abs(last.y - prev.y));
  });

  it('curved route leaves the source along its edge normal too', () => {
    const from = R(20, 20, 245, 145);
    const to = R(408, 305, 317, 105);
    const plan = planLink({ from, to }, 'curved');
    const sampled = sampleRoute(plan.points, 'curved', plan.ends);
    const first = sampled[0]!;
    const second = sampled[1]!;
    expect(first.x).toBeCloseTo(from.x + from.w, 5);
    expect(Math.abs(second.x - first.x)).toBeGreaterThan(Math.abs(second.y - first.y));
  });

  it('an almost-aligned curved route stays a gentle curve, not a hook', () => {
    // Left-to-right pair at nearly the same height: the end handles follow the
    // horizontal normals, so the curve keeps to a thin band instead of dipping.
    const from = R(0, 0, 100, 60);
    const to = R(300, 10, 100, 60);
    const plan = planLink({ from, to }, 'curved');
    const sampled = sampleRoute(plan.points, 'curved', plan.ends);
    const ys = sampled.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...ys)).toBeLessThanOrEqual(50);
  });
});

describe('link furniture', () => {
  it('arrowDirection: sign of last segment', () => {
    expect(arrowDirection([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual({ x: 1, y: 0 });
    expect(arrowDirection([{ x: 0, y: 0 }, { x: 0, y: -10 }])).toEqual({ x: 0, y: -1 });
    const poly: Polyline = [
      { x: 80, y: 20 },
      { x: 190, y: 20 },
      { x: 190, y: 120 },
      { x: 300, y: 120 },
    ];
    expect(arrowDirection(poly)).toEqual({ x: 1, y: 0 });
  });

  it('labelPoint: midpoint of longest segment', () => {
    const poly: Polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
      { x: 20, y: 100 },
    ];
    expect(labelPoint(poly)).toEqual({ x: 10, y: 50 });
  });

  it('labelPoint: equal short Z-route legs use the channel, not the source shape', () => {
  const poly: Polyline = [
    { x: 448, y: 72 },
    { x: 509, y: 72 },
    { x: 509, y: 62 },
    { x: 570, y: 62 },
  ];
  expect(labelPoint(poly)).toEqual({ x: 509, y: 67 });
});

it('polylineLength sums manhattan segments', () => {
    const poly: Polyline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 100 },
    ];
    expect(polylineLength(poly)).toBe(110);
  });

  it('distanceToPolyline: min over segments', () => {
    const poly: Polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(distanceToPolyline({ x: 50, y: 7 }, poly)).toBe(7);
    expect(distanceToPolyline({ x: 110, y: 5 }, poly)).toBeCloseTo(Math.hypot(10, 5));
  });
});
