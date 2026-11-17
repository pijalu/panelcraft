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
  // Keep each handle inside its own segment. An unclamped neighbour-based
  // handle can sit past the endpoint (the reported curve overshot the target
  // edge), while the direction — which is what the arrowhead follows — is
  // unchanged by shortening it.
  const limit = Math.hypot(d.x - a.x, d.y - a.y) / 3;
  return {
    a,
    b: clampHandle(a, { x: a.x + (d.x - previous.x) / 6, y: a.y + (d.y - previous.y) / 6 }, limit),
    c: clampHandle(d, { x: d.x - (next.x - a.x) / 6, y: d.y - (next.y - a.y) / 6 }, limit),
    d,
  };
}

/** Pull a handle back towards `anchor` until it sits within `limit`. */
function clampHandle(anchor: Point, handle: Point, limit: number): Point {
  const dx = handle.x - anchor.x;
  const dy = handle.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (length <= limit || length === 0) return handle;
  const k = limit / length;
  return { x: anchor.x + dx * k, y: anchor.y + dy * k };
}

/** Unit direction of travel at each end, for the curve's end handles. */
export interface Ends {
  start: Point;
  end: Point;
}

/** Handle length used along a supplied end tangent (never longer than a third
 *  of the segment it belongs to). */
function endHandle(from: Point, to: Point, direction: Point): Point {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const length = Math.min(span / 3, Math.max(18, span * 0.25));
  return { x: from.x + direction.x * length, y: from.y + direction.y * length };
}

/** Replace the first/last handle with one along the supplied end tangents.
 *  A two-point route is a single cubic, so one pass must set both handles. */
function withEnds(cubics: Cubic[], ends: Ends): Cubic[] {
  const last = cubics.length - 1;
  return cubics.map((cubic, index) => {
    let out = cubic;
    if (index === 0) out = { ...out, b: endHandle(cubic.a, cubic.d, ends.start) };
    if (index === last) out = { ...out, c: endHandle(cubic.d, cubic.a, { x: -ends.end.x, y: -ends.end.y }) };
    return out;
  });
}

function curves(points: Polyline, ends?: Ends): Cubic[] {
  const built = points.length === 2
    ? [endpointCurve(points[0]!, points[1]!)]
    : points.slice(0, -1).map((_, index) => catmullCurve(points, index));
  return ends === undefined ? built : withEnds(built, ends);
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
export function routeToPath(points: Polyline, mode: RouteMode = 'orthogonal', ends?: Ends): string {
  if (points.length === 0) return '';
  const first = command('M', points[0]!);
  if (mode !== 'curved' || points.length < 2) {
    return [first, ...points.slice(1).map((p) => command('L', p))].join(' ');
  }
  return [
    first,
    ...curves(points, ends).map((c) => `C ${num(c.b.x)} ${num(c.b.y)} ${num(c.c.x)} ${num(c.c.y)} ${num(c.d.x)} ${num(c.d.y)}`),
  ].join(' ');
}

/** Sample rendered geometry; non-curved routes keep their exact polylines. */
export function sampleRoute(points: Polyline, mode: RouteMode = 'orthogonal', ends?: Ends): Polyline {
  if (mode !== 'curved' || points.length < 2) return points;
  const out: Polyline = [points[0]!];
  for (const curve of curves(points, ends)) {
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
