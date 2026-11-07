// SPDX-License-Identifier: GPL-3.0-only
// Orthogonal link router v1 (M2-WP6, FR-C7/C8). Pure geometry: side anchors,
// Z/L segment generation on the dominant axis, single-obstacle detours.
// Timeboxed per plan: curved-only fallback decided in M2.md if v1 quality
// stalls — see docs/milestones/M2.md router decision note.

import type { Point, Rect } from './viewport';

export type Side = 'top' | 'bottom' | 'left' | 'right';

export const ROUTER_CLEARANCE = 12;

export type Polyline = Point[];

export interface RouteInput {
  from: Rect;
  to: Rect;
  /** Shapes to avoid (excludes endpoints). */
  obstacles?: Rect[];
  clearance?: number;
}

/** Anchor point: center of a rect side. */
export function portPoint(r: Rect, side: Side): Point {
  switch (side) {
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
  }
}

/**
 * Facing side pair by relative displacement (v1 heuristic): dominant axis of
 * center→center picks the sides.
 */
export function pickSides(a: Rect, b: Rect): [Side, Side] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function midChannel(a: Point, b: Point, horizontal: boolean): number {
  return horizontal ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
}

function segIntersectsRect(p1: Point, p2: Point, r: Rect): boolean {
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return minX <= r.x + r.w && maxX >= r.x && minY <= r.y + r.h && maxY >= r.y;
}

function nearestEdge(channel: number, lo: number, hi: number): number {
  // Tie → hi: detour below/right keeps routes visually "after" the obstacle.
  return Math.abs(lo - channel) < Math.abs(hi - channel) ? lo : hi;
}

/**
 * Orthogonal route v1: straight line when anchors align; else a Z shape with
 * the channel at the mid between anchors. If the channel (or straight run)
 * crosses an obstacle, the channel shifts past the obstacle's nearest edge
 * (+ clearance). One detour per link — deterministic and stable (WP6 v1).
 */
export function routeOrtho(input: RouteInput): Polyline {
  const { from, to } = input;
  const obstacles = input.obstacles ?? [];
  const clearance = input.clearance ?? ROUTER_CLEARANCE;
  const [sideA, sideB] = pickSides(from, to);
  const a = portPoint(from, sideA);
  const b = portPoint(to, sideB);
  const horizontal = sideA === 'left' || sideA === 'right';
  const aligned = horizontal ? Math.abs(a.y - b.y) < 1e-9 : Math.abs(a.x - b.x) < 1e-9;

  if (aligned) {
    const hit = obstacles.find((o) => segIntersectsRect(a, b, o));
    if (!hit) return [a, b];
    // Detour the straight run past the obstacle's near edge.
    if (horizontal) {
      const ny = nearestEdge(a.y, hit.y - clearance, hit.y + hit.h + clearance);
      return [a, { x: a.x, y: ny }, { x: b.x, y: ny }, b];
    }
    const nx = nearestEdge(a.x, hit.x - clearance, hit.x + hit.w + clearance);
    return [a, { x: nx, y: a.y }, { x: nx, y: b.y }, b];
  }

  const ch = midChannel(a, b, horizontal);
  const elbow1 = horizontal ? { x: ch, y: a.y } : { x: a.x, y: ch };
  const elbow2 = horizontal ? { x: ch, y: b.y } : { x: b.x, y: ch };
  let points: Polyline = [a, elbow1, elbow2, b];

  const channelCrosses = obstacles.find((o) => segIntersectsRect(elbow1, elbow2, o));
  if (channelCrosses) {
    if (horizontal) {
      const nx = nearestEdge(ch, channelCrosses.x - clearance, channelCrosses.x + channelCrosses.w + clearance);
      points = [a, { x: nx, y: a.y }, { x: nx, y: b.y }, b];
    } else {
      const ny = nearestEdge(ch, channelCrosses.y - clearance, channelCrosses.y + channelCrosses.h + clearance);
      points = [a, { x: a.x, y: ny }, { x: b.x, y: ny }, b];
    }
  }
  return points;
}

/** Index with invariant check — polylines are internal, ≥2 points by contract. */
function at(points: Polyline, i: number): Point {
  const p = points[i];
  if (!p) throw new Error(`router: point ${i} missing (${points.length} points)`);
  return p;
}

/** Unit vector of the last segment → arrowhead orientation (FR-C7). */
export function arrowDirection(points: Polyline): Point {
  const p1 = at(points, points.length - 2);
  const p2 = at(points, points.length - 1);
  return { x: Math.sign(p2.x - p1.x), y: Math.sign(p2.y - p1.y) };
}

/** Label anchor: midpoint of the longest interior segment (stable placement). */
export function labelPoint(points: Polyline): Point {
  let bestLen = -1;
  let best = at(points, 0);
  for (let i = 1; i < points.length; i++) {
    const p1 = at(points, i - 1);
    const p2 = at(points, i);
    const len = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    }
  }
  return best;
}

/** Total polyline length (manhattan) — used by hit-testing width scaling. */
export function polylineLength(points: Polyline): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.abs(at(points, i).x - at(points, i - 1).x) + Math.abs(at(points, i).y - at(points, i - 1).y);
  }
  return len;
}

/** Distance from point to polyline (min over segments) — link hit-testing. */
export function distanceToPolyline(p: Point, points: Polyline): number {
  let min = Infinity;
  for (let i = 1; i < points.length; i++) {
    min = Math.min(min, distToSegment(p, at(points, i - 1), at(points, i)));
  }
  return min;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
