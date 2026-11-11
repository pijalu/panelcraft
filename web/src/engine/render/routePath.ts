// SPDX-License-Identifier: GPL-3.0-only
// SVG path geometry for straight, orthogonal and curved routes. Curves are
// sampled back into polylines for deterministic labels and hit-testing.

import { labelPoint, type Polyline, type RouteMode } from './router';
import type { Point } from './viewport';

interface Cubic {
  a: Point;
  b: Point;
  c: Point;
  d: Point;
}

const num = (n: number): string => String(Number(n.toFixed(4)));
const command = (prefix: string, p: Point): string => `${prefix} ${num(p.x)} ${num(p.y)}`;

function endpointCurve(a: Point, d: Point): Cubic {
  const dx = d.x - a.x;
  const dy = d.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const bend = Math.max(40, (horizontal ? Math.abs(dx) : Math.abs(dy)) * 0.45);
  if (horizontal) {
    const sign = Math.sign(dx) || 1;
    return { a, b: { x: a.x + sign * bend, y: a.y }, c: { x: d.x - sign * bend, y: d.y }, d };
  }
  const sign = Math.sign(dy) || 1;
  return { a, b: { x: a.x, y: a.y + sign * bend }, c: { x: d.x, y: d.y - sign * bend }, d };
}

function catmullCurve(points: Polyline, index: number): Cubic {
  const a = points[index]!;
  const d = points[index + 1]!;
  const previous = points[index - 1] ?? a;
  const next = points[index + 2] ?? d;
  return {
    a,
    b: { x: a.x + (d.x - previous.x) / 6, y: a.y + (d.y - previous.y) / 6 },
    c: { x: d.x - (next.x - a.x) / 6, y: d.y - (next.y - a.y) / 6 },
    d,
  };
}

function curves(points: Polyline): Cubic[] {
  if (points.length === 2) return [endpointCurve(points[0]!, points[1]!)];
  return points.slice(0, -1).map((_, index) => catmullCurve(points, index));
}

function cubicPoint(curve: Cubic, t: number): Point {
  const u = 1 - t;
  const weight = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: weight[0]! * curve.a.x + weight[1]! * curve.b.x + weight[2]! * curve.c.x + weight[3]! * curve.d.x,
    y: weight[0]! * curve.a.y + weight[1]! * curve.b.y + weight[2]! * curve.c.y + weight[3]! * curve.d.y,
  };
}

/** Polyline or cubic SVG path for one routed link. */
export function routeToPath(points: Polyline, mode: RouteMode = 'orthogonal'): string {
  if (points.length === 0) return '';
  const first = command('M', points[0]!);
  if (mode !== 'curved' || points.length < 2) {
    return [first, ...points.slice(1).map((p) => command('L', p))].join(' ');
  }
  return [
    first,
    ...curves(points).map((c) => `C ${num(c.b.x)} ${num(c.b.y)} ${num(c.c.x)} ${num(c.c.y)} ${num(c.d.x)} ${num(c.d.y)}`),
  ].join(' ');
}

/** Sample rendered geometry; non-curved routes keep their exact polylines. */
export function sampleRoute(points: Polyline, mode: RouteMode = 'orthogonal'): Polyline {
  if (mode !== 'curved' || points.length < 2) return points;
  const out: Polyline = [points[0]!];
  for (const curve of curves(points)) {
    for (let step = 1; step <= 16; step++) out.push(cubicPoint(curve, step / 16));
  }
  return out;
}

function routeMidpoint(points: Polyline): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const target = lengths.reduce((sum, n) => sum + n, 0) / 2;
  let walked = 0;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (walked + length >= target && length > 0) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const t = (target - walked) / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    walked += length;
  }
  return points[0] ?? { x: 0, y: 0 };
}

/** Label anchor on rendered geometry, preserving legacy orthogonal placement. */
export function routeLabelPoint(points: Polyline, mode: RouteMode = 'orthogonal'): Point {
  return mode === 'curved' ? routeMidpoint(sampleRoute(points, mode)) : labelPoint(points);
}
