// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  portPoint,
  pickSides,
  routeOrtho,
  arrowDirection,
  labelPoint,
  polylineLength,
  distanceToPolyline,
  ROUTER_CLEARANCE,
  type Polyline,
} from './router';

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

  it('channel detours around obstacle (horizontal case)', () => {
    const obstacle = R(160, 0, 40, 40); // sits on mid x=190 channel
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 0), obstacles: [obstacle] });
    // straight run y=20 crosses obstacle (y 0..40, x 160..200) → detour
    expect(pts).toHaveLength(4);
    const ny = pts.at(1)?.y;
    expect(ny).toBe(R(0, 0).h + ROUTER_CLEARANCE); // bottom edge + clearance = 52
    expect(pts.at(2)).toEqual({ x: 300, y: ny });
    // final segment returns to the entry anchor
    expect(pts.at(3)).toEqual({ x: 300, y: 20 });
  });

  it('channel detours around obstacle on the Z channel (vertical shift)', () => {
    const obstacle = R(150, 0, 60, 200); // blocks vertical channel x=190
    const pts = routeOrtho({ from: R(0, 0), to: R(300, 100), obstacles: [obstacle] });
    expect(pts).toHaveLength(4);
    const nx = pts.at(1)?.x;
    expect(nx).toBe(obstacle.x + obstacle.w + ROUTER_CLEARANCE); // right edge + 12 = 222
    expect(pts.at(2)).toEqual({ x: nx, y: 120 });
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
