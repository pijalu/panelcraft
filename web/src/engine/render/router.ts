// SPDX-License-Identifier: GPL-3.0-only
// Orthogonal link router v1 (M2-WP6, FR-C7/C8). Pure geometry: side anchors,
// Z/L segment generation on the dominant axis, object and connector detours.
// Timeboxed per plan: curved-only fallback decided in M2.md if v1 quality
// stalls — see docs/milestones/M2.md router decision note.

import type { Point, Rect } from './viewport';
import { perimeterPoint, perimeterSide } from './perimeter';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type RouteMode = 'orthogonal' | 'straight' | 'curved';

export const ROUTER_CLEARANCE = 12;

export type Polyline = Point[];
export interface RouteObstacle {
  id: string;
  points: Point[];
}

export interface RouteInput {
  from: Rect;
  to: Rect;
  /** Shapes to avoid (excludes endpoints). */
  obstacles?: Rect[];
  routes?: RouteObstacle[];
  allowOverlap?: boolean;
  clearance?: number;
  /**
   * Explicit user waypoints (F-19). When present the route passes through them
   * with orthogonal elbows and obstacle avoidance is skipped — the user has
   * stated the intended path.
   */
  waypoints?: [number, number][];
  /** Optional normalized side-quarter perimeter anchors (CX-01, IR v4). */
  fromAnchor?: number;
  toAnchor?: number;
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

/**
 * Route through explicit waypoints: port → each waypoint → port, joined by
 * orthogonal elbows (alternating horizontal-first / vertical-first so a zig-zag
 * stays readable). Obstacles are deliberately ignored (F-19).
 */
function routeThroughWaypoints(input: RouteInput): Polyline {
  const { a, b } = routeEndpoints(input);
  const anchors: Point[] = [
    a,
    ...(input.waypoints ?? []).map(([x, y]) => ({ x, y })),
    b,
  ];
  const out: Polyline = [anchors[0]!];
  for (let i = 1; i < anchors.length; i++) {
    const p = out[out.length - 1]!;
    const q = anchors[i]!;
    if (Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5) {
      out.push(q);
      continue;
    }
    const elbow: Point = i % 2 === 1 ? { x: q.x, y: p.y } : { x: p.x, y: q.y };
    out.push(elbow, q);
  }
  return out;
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
  if (input.waypoints !== undefined && input.waypoints.length > 0) {
    return routeThroughWaypoints(input); // F-19: user-stated path wins
  }
  return routeAuto(input);
}

/** Route one link using its visual mode; orthogonal remains the default. */
export function routeLink(input: RouteInput, mode: RouteMode = 'orthogonal'): Polyline {
  if (input.allowOverlap) return routeLink({ ...input, obstacles: [], routes: [], allowOverlap: false }, mode);
  if (mode === 'orthogonal') return routeOrtho(input);
  const { a, b } = routeEndpoints(input);
  return [
    a,
    ...(input.waypoints ?? []).map(([x, y]) => ({ x, y })),
    b,
  ];
}

interface RouteEndpoints {
  a: Point;
  b: Point;
  sideA: Side;
  sideB: Side;
  explicit: boolean;
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function routeEndpoints(input: RouteInput): RouteEndpoints {
  const [autoA, autoB] = pickSides(input.from, input.to);
  const a = input.fromAnchor === undefined
    ? portPoint(input.from, autoA) : perimeterPoint(input.from, input.fromAnchor);
  const b = input.toAnchor === undefined
    ? portPoint(input.to, autoB) : perimeterPoint(input.to, input.toAnchor);
  const sideA = input.fromAnchor === undefined
    ? autoA : perimeterSide(input.fromAnchor, a, center(input.to));
  const sideB = input.toAnchor === undefined
    ? autoB : perimeterSide(input.toAnchor, b, center(input.from));
  return { a, b, sideA, sideB, explicit: input.fromAnchor !== undefined || input.toAnchor !== undefined };
}

function outward(side: Side): Point {
  if (side === 'left') return { x: -1, y: 0 };
  if (side === 'right') return { x: 1, y: 0 };
  if (side === 'top') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function compact(points: Polyline): Polyline {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
}

/** Explicit anchors leave their entities outward before joining orthogonal channels. */
function routeAnchoredAuto(input: RouteInput, ends: RouteEndpoints): Polyline {
  const clearance = input.clearance ?? ROUTER_CLEARANCE;
  const normalA = outward(ends.sideA);
  const normalB = outward(ends.sideB);
  const outerA = { x: ends.a.x + normalA.x * clearance, y: ends.a.y + normalA.y * clearance };
  const outerB = { x: ends.b.x + normalB.x * clearance, y: ends.b.y + normalB.y * clearance };
  const channelX = (outerA.x + outerB.x) / 2;
  const channelY = (outerA.y + outerB.y) / 2;
  const horizontalA = ends.sideA === 'left' || ends.sideA === 'right';
  const horizontalB = ends.sideB === 'left' || ends.sideB === 'right';
  const elbowA = horizontalA ? { x: outerA.x, y: channelY } : { x: channelX, y: outerA.y };
  const elbowB = horizontalB ? { x: outerB.x, y: channelY } : { x: channelX, y: outerB.y };
  const center = { x: channelX, y: channelY };
  return compact([ends.a, outerA, elbowA, center, elbowB, outerB, ends.b]);
}

/** Automatic orthogonal route with obstacle detours for automatic endpoints. */
function routeLegacyAuto(input: RouteInput): Polyline {
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

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  return p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (Math.abs(abC) < 1e-9 && onSegment(c, a, b)) ||
    (Math.abs(abD) < 1e-9 && onSegment(d, a, b)) ||
    (Math.abs(cdA) < 1e-9 && onSegment(a, c, d)) ||
    (Math.abs(cdB) < 1e-9 && onSegment(b, c, d));
}

function sharedEndpoint(a: Point, b: Point, c: Point, d: Point, ends: Point[]): boolean {
  const pairs = [[a, c], [a, d], [b, c], [b, d]];
  return pairs.some(([p, q]) => samePoint(p!, q!) && ends.some((end) => samePoint(p!, end))) &&
    (Math.abs(orientation(a, b, c)) > 1e-9 || Math.abs(orientation(a, b, d)) > 1e-9);
}

function routeConflictCount(points: Polyline, routes: RouteObstacle[]): number {
  const ends = [points[0]!, points[points.length - 1]!];
  let conflicts = 0;
  for (let i = 1; i < points.length; i++) {
    for (const route of routes) {
      for (let j = 1; j < route.points.length; j++) {
        if (segmentsTouch(points[i - 1]!, points[i]!, route.points[j - 1]!, route.points[j]!) &&
          !sharedEndpoint(points[i - 1]!, points[i]!, route.points[j - 1]!, route.points[j]!, ends)) conflicts++;
      }
    }
  }
  return conflicts;
}

function objectConflictCount(points: Polyline, obstacles: Rect[]): number {
  return points.slice(1).reduce((total, point, index) => total +
    obstacles.filter((rect) => segIntersectsRect(points[index]!, point, rect)).length, 0);
}

function pathLength(points: Polyline): number {
  return points.slice(1).reduce((total, point, index) => total +
    Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y), 0);
}

function shiftedChannel(points: Polyline, segment: number, channel: number): Polyline {
  const copy = points.map((point) => ({ ...point }));
  const horizontal = points[segment - 1]!.y === points[segment]!.y;
  if (points.length === 2) {
    return horizontal
      ? [copy[0]!, { x: copy[0]!.x, y: channel }, { x: copy[1]!.x, y: channel }, copy[1]!]
      : [copy[0]!, { x: channel, y: copy[0]!.y }, { x: channel, y: copy[1]!.y }, copy[1]!];
  }
  if (horizontal) {
    copy[segment - 1]!.y = channel;
    copy[segment]!.y = channel;
  } else {
    copy[segment - 1]!.x = channel;
    copy[segment]!.x = channel;
  }
  return compact(copy);
}

function routeChannels(input: RouteInput, axis: 'x' | 'y'): number[] {
  const clearance = (input.clearance ?? ROUTER_CLEARANCE) * 2;
  const values = (input.routes ?? []).flatMap((route) => route.points.flatMap((point) =>
    [point[axis] - clearance, point[axis] + clearance]));
  values.push(...(input.obstacles ?? []).flatMap((rect) => axis === 'x'
    ? [rect.x - clearance, rect.x + rect.w + clearance]
    : [rect.y - clearance, rect.y + rect.h + clearance]));
  return [...new Set(values)].sort((a, b) => a - b).slice(0, 48);
}

function appendDirectCandidates(candidates: Polyline[], a: Point, b: Point, input: RouteInput): void {
  for (const y of routeChannels(input, 'y')) {
    candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
  }
  for (const x of routeChannels(input, 'x')) {
    candidates.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  }
}

function appendChannelCandidates(candidates: Polyline[], base: Polyline, input: RouteInput): void {
  if (base.length === 2 && base[0]!.x !== base[1]!.x && base[0]!.y !== base[1]!.y) {
    appendDirectCandidates(candidates, base[0]!, base[1]!, input);
    return;
  }
  const first = base.length === 2 ? 1 : 2;
  const last = base.length === 2 ? 1 : base.length - 2;
  for (let segment = first; segment <= last; segment++) {
    const horizontal = base[segment - 1]!.y === base[segment]!.y;
    for (const channel of routeChannels(input, horizontal ? 'y' : 'x')) {
      candidates.push(shiftedChannel(base, segment, channel));
    }
  }
}

function routeCandidates(base: Polyline, input: RouteInput): Polyline[] {
  const candidates = [base];
  appendChannelCandidates(candidates, base, input);
  const a = base[0]!;
  const b = base[base.length - 1]!;
  if (base.length > 2 && input.fromAnchor === undefined && input.toAnchor === undefined) {
    const direct = [a, b];
    candidates.push(direct);
    appendChannelCandidates(candidates, direct, input);
  }
  return candidates;
}

function avoidRouteConflicts(base: Polyline, input: RouteInput): Polyline {
  const obstacles = input.obstacles ?? [];
  const routes = input.routes ?? [];
  if (objectConflictCount(base, obstacles) === 0 && routeConflictCount(base, routes) === 0) return base;
  return routeCandidates(base, input).reduce((best, candidate) => {
    const score = objectConflictCount(candidate, obstacles) * 100000 +
      routeConflictCount(candidate, routes) * 10000 + pathLength(candidate);
    const bestScore = objectConflictCount(best, obstacles) * 100000 +
      routeConflictCount(best, routes) * 10000 + pathLength(best);
    return score < bestScore ? candidate : best;
  }, base);
}

function routeAuto(input: RouteInput): Polyline {
  const ends = routeEndpoints(input);
  const base = ends.explicit ? routeAnchoredAuto(input, ends) : routeLegacyAuto(input);
  return avoidRouteConflicts(base, input);
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

function horizontalZLabel(a: Point, b: Point, c: Point, d: Point): Point | null {
  if (a.y !== b.y || c.y !== d.y || b.x !== c.x) return null;
  const legs = Math.min(Math.abs(b.x - a.x), Math.abs(d.x - c.x));
  if (Math.abs(c.y - b.y) > legs) return null;
  return { x: b.x, y: (a.y + d.y) / 2 };
}

function verticalZLabel(a: Point, b: Point, c: Point, d: Point): Point | null {
  if (a.x !== b.x || c.x !== d.x || b.y !== c.y) return null;
  const legs = Math.min(Math.abs(b.y - a.y), Math.abs(d.y - c.y));
  if (Math.abs(c.x - b.x) > legs) return null;
  return { x: (a.x + d.x) / 2, y: b.y };
}

/** Center labels across short Z-route channels instead of inside an endpoint. */
function zRouteLabel(points: Polyline): Point | null {
  if (points.length !== 4) return null;
  const [a, b, c, d] = points;
  if (!a || !b || !c || !d) return null;
  return horizontalZLabel(a, b, c, d) ?? verticalZLabel(a, b, c, d);
}

/** Label anchor: midpoint of the longest interior segment (stable placement). */
export function labelPoint(points: Polyline): Point {
  const z = zRouteLabel(points);
  if (z) return z;
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
