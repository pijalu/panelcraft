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
   * Explicit user waypoints. Orthogonal routes plan the whole path and
   * may skip an authored bend with a structured reason; straight and curved
   * routes pass the authored points through unchanged. The authored array is
   * never modified, printed or reordered by routing.
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
 * orthogonal elbows. An authored waypoint is authoritative, but a *leg* is not
 * exempt from geometry: each leg picks the readable shape that crosses no entity
 * rectangle, so an intentional detour is preserved instead of being flattened
 * into the automatic route. A leg that would leave or enter a port through its
 * own entity pays a short outward stub first (the same contract explicit anchors
 * get). Elbows continue the incoming direction — never an index parity — so a
 * local edit cannot flip the shape of the whole route.
 */
function routeThroughWaypoints(input: RouteInput): Polyline {
  const ends = routeEndpoints(input);
  const waypoints = (input.waypoints ?? []).map(([x, y]) => ({ x, y }));
  const { anchors, stubB } = waypointAnchors(input, ends, waypoints);
  const rects = entityRects(input);
  const clearance = input.clearance ?? ROUTER_CLEARANCE;

  const out: Polyline = [anchors[0]!];
  const startAxis: Axis = horizontalSide(ends.sideA) ? 'h' : 'v';
  let incoming: Move = { axis: startAxis, sign: 1 };
  for (let i = 1; i < anchors.length; i++) {
    const p = out[out.length - 1]!;
    const q = anchors[i]!;
    const last = i === anchors.length - 1;
    const leg = routeLeg({
      from: p, to: q, rects, clearance, incoming,
      ...(i === 1 ? { firstAxis: startAxis } : {}),
      // Final leg with no stub: arrive along the target's port side.
      ...(last && !stubB ? { lastAxis: horizontalSide(ends.sideB) ? 'h' : 'v' } : {}),
    });
    out.push(...leg.points.slice(1));
    incoming = leg.exit;
  }
  return compact(out);
}

type Axis = 'h' | 'v';

/** One orthogonal move: which axis, and in which direction. */
interface Move {
  axis: Axis;
  sign: number;
}

interface LegRequest {
  from: Point;
  to: Point;
  rects: Rect[];
  clearance: number;
  /** How the previous leg arrived, so this one does not retrace it. */
  incoming: Move;
  /** Axis the first move must take (a port's outward normal). */
  firstAxis?: Axis;
  /** Axis the last move must take (into a port). */
  lastAxis?: Axis;
}

interface LegResult {
  points: Polyline;
  /** Direction of the last segment, so the next leg can continue it. */
  exit: Move;
}

const axisOf = (a: Point, b: Point): Axis => (a.y === b.y ? 'h' : 'v');

/** Direction of one segment. */
function moveOf(a: Point, b: Point): Move {
  return a.y === b.y
    ? { axis: 'h', sign: Math.sign(b.x - a.x) }
    : { axis: 'v', sign: Math.sign(b.y - a.y) };
}

/** Direction of the final segment of a leg. */
const exitOf = (points: Polyline): Move => moveOf(points[points.length - 2]!, points[points.length - 1]!);

/** True when `move` walks back along `previous`. */
function retraces(move: Move, previous: Move): boolean {
  return move.axis === previous.axis && move.sign === -previous.sign;
}

/** Move axes of a polyline, in order, with zero-length steps dropped. */
function axes(points: Polyline): Axis[] {
  const out: Axis[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.x === points[i - 1]!.x && points[i]!.y === points[i - 1]!.y) continue;
    out.push(axisOf(points[i - 1]!, points[i]!));
  }
  return out;
}

/** One leg's obstacle-crossing count over entity rectangles (perimeter is free). */
function legCrossings(points: Polyline, rects: Rect[]): number {
  return points.slice(1).reduce((total, point, index) => total +
    rects.filter((rect) => segmentEntersRect(points[index]!, point, insetRect(rect))).length, 0);
}

function insetRect(r: Rect): Rect {
  const inset = 0.5;
  return { x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, h: r.h - 2 * inset };
}

/** Channels a leg may route through: just outside each entity edge. */
function legChannels(rects: Rect[], axis: 'x' | 'y', clearance: number): number[] {
  const values = rects.flatMap((r) => axis === 'x'
    ? [r.x - clearance, r.x + r.w + clearance]
    : [r.y - clearance, r.y + r.h + clearance]);
  return [...new Set(values)];
}

/** Orthogonal leg shapes, most direct first, around the given channels. */
function legCandidates(req: LegRequest): Polyline[] {
  const { from: a, to: b } = req;
  const shapes: Polyline[] = [];
  if (a.x === b.x || a.y === b.y) shapes.push([a, b]);
  shapes.push([a, { x: b.x, y: a.y }, b], [a, { x: a.x, y: b.y }, b]);
  for (const x of legChannels(req.rects, 'x', req.clearance)) {
    shapes.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  }
  for (const y of legChannels(req.rects, 'y', req.clearance)) {
    shapes.push([a, { x: a.x, y }, { x: b.x, y }, b]);
  }
  const usable = shapes
    .map(compact)
    .filter((points) => points.length > 1)
    .filter((points) => {
      const moves = axes(points);
      if (req.firstAxis !== undefined && moves[0] !== req.firstAxis) return false;
      if (req.lastAxis !== undefined && moves[moves.length - 1] !== req.lastAxis) return false;
      return true;
    });
  // A leg that turns is preferred over one that retraces the previous segment:
  // going back along the line it just came down draws the connector over itself.
  // A stable sort keeps the written order for equal scores, so adding a waypoint
  // cannot flip an earlier elbow.
  const rank = (points: Polyline): number =>
    retraces(moveOf(points[0]!, points[1]!), req.incoming) ? 1 : 0;
  return usable.sort((p, q) => rank(p) - rank(q));
}

/**
 * Route one leg around entity rectangles. Crossings dominate, then reversals,
 * then length, then the candidate order (which keeps the incoming direction).
 * When every shape conflicts the first — most direct — one wins: a documented
 * minimal-conflict result instead of an unexplained loop.
 */
function routeLeg(req: LegRequest): LegResult {
  let best = compact([req.from, req.to]);
  let bestScore = Infinity;
  for (const candidate of legCandidates(req)) {
    // Doubling back over the previous segment is what a reader sees as a loop,
    // so it costs the same as a reversal even though this leg looks straight.
    const back = retraces(moveOf(candidate[0]!, candidate[1]!), req.incoming) ? 1000 : 0;
    const score = legCrossings(candidate, req.rects) * 100000 + back +
      reversals(candidate) * 1000 + pathLength(candidate);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return { points: best, exit: exitOf(best) };
}

const horizontalSide = (side: Side): boolean => side === 'left' || side === 'right';

/** Every rectangle a route may never be drawn through: endpoints plus obstacles. */
function entityRects(input: RouteInput): Rect[] {
  return [input.from, input.to, ...(input.obstacles ?? [])];
}

/** Strict interior test — the boundary belongs to the shape's perimeter. */
function insideRect(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
}

/** Why an authored bend was not drawn. */
export type WaypointSkipReason = 'inside-entity' | 'causes-reversal';

interface WaypointSkipBase {
  index: number;
  point: Point;
}

/** One authored bend the planner skipped, carrying its stable authored index. */
export type WaypointSkip = (WaypointSkipBase & { reason: 'inside-entity'; rect: Rect }) |
  (WaypointSkipBase & { reason: 'causes-reversal' });

/** The drawn polyline and the bends it skipped, from one deterministic plan. */
export interface RoutePlan {
  points: Polyline;
  skips: WaypointSkip[];
}

interface AuthoredBend {
  index: number;
  point: Point;
}

interface RouteCandidate extends RoutePlan {
  kept: AuthoredBend[];
  dropped: number[];
  crossings: number;
  reversals: number;
  length: number;
}

const authoredBends = (input: RouteInput): AuthoredBend[] =>
  (input.waypoints ?? []).map(([x, y], index) => ({ index, point: { x, y } }));

/** A bend inside an entity is impossible to draw, not merely unhelpful. */
function insideSkip(bend: AuthoredBend, rects: Rect[]): WaypointSkip | undefined {
  const rect = rects.find((candidate) => insideRect(bend.point, candidate));
  return rect ? { reason: 'inside-entity', index: bend.index, point: bend.point, rect } : undefined;
}

/** Score one whole kept-bend set; crossings are a hard constraint later on. */
function routeCandidate(input: RouteInput, kept: AuthoredBend[]): RouteCandidate {
  const keptIndices = new Set(kept.map((bend) => bend.index));
  const dropped = (input.waypoints ?? [])
    .map((_, index) => index)
    .filter((index) => !keptIndices.has(index));
  const points = kept.length === 0
    ? routeAuto(input)
    : routeThroughWaypoints({
        ...input,
        waypoints: kept.map(({ point }) => [point.x, point.y] as [number, number]),
      });
  return {
    points, skips: [], kept, dropped,
    crossings: crossingEntities(points, input).length,
    reversals: reversals(points),
    length: pathLength(points),
  };
}

/** Equal score keeps the earlier authored bends; index order is the last tie. */
function preferredDrop(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? -1;
    const right = b[i] ?? -1;
    if (left !== right) return right > left;
  }
  return false;
}

/** Crossings, full-path reversals, drops, length, then authored indices. */
function betterCandidate(a: RouteCandidate, b: RouteCandidate): boolean {
  if (a.crossings !== b.crossings) return a.crossings < b.crossings;
  if (a.reversals !== b.reversals) return a.reversals < b.reversals;
  if (a.dropped.length !== b.dropped.length) return a.dropped.length < b.dropped.length;
  if (a.length !== b.length) return a.length < b.length;
  return preferredDrop(a.dropped, b.dropped);
}

/** Search relaxation: a shorter step is worth taking to reach fewer reversals. */
function searchImproves(trial: RouteCandidate, current: RouteCandidate): boolean {
  if (trial.crossings !== current.crossings) return trial.crossings < current.crossings;
  if (trial.reversals !== current.reversals) return trial.reversals < current.reversals;
  return trial.length < current.length;
}

/** Pick the next relaxed step deterministically when several bends qualify. */
function betterStep(a: RouteCandidate, b: RouteCandidate): boolean {
  if (a.crossings !== b.crossings) return a.crossings < b.crossings;
  if (a.reversals !== b.reversals) return a.reversals < b.reversals;
  if (a.length !== b.length) return a.length < b.length;
  return preferredDrop(a.dropped, b.dropped);
}

/**
 * Greedy single-bend removal with a relaxed search step: a bend may be dropped
 * when it shortens a crossing-neutral route, because the next step can then
 * remove a reversal that no single drop could reach. Each step drops exactly one
 * bend, so at most `bends.length` steps run, with at most that many whole-route
 * candidates per step: O(n²) scored routes. The returned candidate is the best
 * one seen under the documented score, not merely the last one visited.
 */
function simplifyBends(input: RouteInput, bends: AuthoredBend[]): RouteCandidate {
  let current = routeCandidate(input, bends);
  let best = current;
  for (;;) {
    let next: RouteCandidate | undefined;
    for (const bend of current.kept) {
      const trial = routeCandidate(input, current.kept.filter((kept) => kept !== bend));
      if (betterCandidate(trial, best)) best = trial;
      if (searchImproves(trial, current) && (next === undefined || betterStep(trial, next))) next = trial;
    }
    if (next === undefined) return best;
    current = next;
  }
}

/**
 * One pure orthogonal planner: keep the authored order, drop only bends that
 * cannot be drawn or that make the whole path reverse, and report each drop.
 * Nothing here edits the authored waypoint array or the document that owns it.
 */
export function planExplicitRoute(input: RouteInput): RoutePlan {
  const bends = authoredBends(input);
  if (bends.length === 0) return { points: routeAuto(input), skips: [] };
  const rects = entityRects(input);
  // A single authored bend is the user's chosen detour, even when it doubles
  // back on the direct path; there is no second bend to simplify against.
  if (bends.length === 1) {
    const only = bends[0]!;
    const skip = insideSkip(only, rects);
    return skip
      ? { points: routeAuto(input), skips: [skip] }
      : { points: routeThroughWaypoints({ ...input, waypoints: [[only.point.x, only.point.y]] }), skips: [] };
  }
  const inside = bends.flatMap((bend) => insideSkip(bend, rects) ?? []);
  const kept = bends.filter((bend) => !inside.some((skip) => skip.index === bend.index));
  const best = simplifyBends(input, kept);
  const insideByIndex = new Map(inside.map((skip) => [skip.index, skip]));
  const skips = best.dropped.map((index): WaypointSkip => {
    const known = insideByIndex.get(index);
    if (known) return known;
    const bend = bends[index];
    if (!bend) throw new Error(`router: authored waypoint ${index} missing`);
    return { reason: 'causes-reversal', index, point: bend.point };
  });
  return { points: best.points, skips };
}

/**
 * Entity rectangles a polyline is drawn through. The rectangles are inset by
 * half a unit so a route that merely touches a perimeter — the port it leaves
 * from, the clearance stub it pays — is not a crossing.
 */
export function crossingEntities(points: Polyline, input: RouteInput): Rect[] {
  const rects = entityRects(input);
  return rects.filter((rect) => points.slice(1).some((point, index) =>
    segmentEntersRect(points[index]!, point, insetRect(rect))));
}

/** Liang–Barsky clip: true when the segment spends length inside `r`. */
function segmentEntersRect(a: Point, b: Point, r: Rect): boolean {
  if (r.w <= 0 || r.h <= 0) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ];
  let enter = 0;
  let exit = 1;
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
    if (enter > exit) return false;
  }
  return exit - enter > 1e-6;
}

const inwardOf = (from: Point, to: Point, normal: Point): boolean =>
  (to.x - from.x) * normal.x + (to.y - from.y) * normal.y < 0;

/** Anchor list with an outward stub where a leg would dive through its entity. */
function waypointAnchors(
  input: RouteInput,
  ends: RouteEndpoints,
  waypoints: Point[],
): { anchors: Point[]; stubB: boolean } {
  const clearance = input.clearance ?? ROUTER_CLEARANCE;
  const nA = outward(ends.sideA);
  const nB = outward(ends.sideB);
  const anchors: Point[] = [ends.a];
  if (inwardOf(ends.a, waypoints[0]!, nA)) {
    anchors.push({ x: ends.a.x + nA.x * clearance, y: ends.a.y + nA.y * clearance });
  }
  anchors.push(...waypoints);
  const last = waypoints.at(-1)!;
  const stubB = inwardOf(ends.b, last, nB);
  if (stubB) anchors.push({ x: ends.b.x + nB.x * clearance, y: ends.b.y + nB.y * clearance });
  anchors.push(ends.b);
  return { anchors, stubB };
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

function stubbedRoute(a: Point, b: Point, sideA: Side, sideB: Side, channel: number, clearance: number): Polyline {
  const normalA = outward(sideA);
  const normalB = outward(sideB);
  const outerA = { x: a.x + normalA.x * clearance, y: a.y + normalA.y * clearance };
  const outerB = { x: b.x + normalB.x * clearance, y: b.y + normalB.y * clearance };
  if (horizontalSide(sideA)) {
    return [a, outerA, { x: outerA.x, y: channel }, { x: outerB.x, y: channel }, outerB, b];
  }
  return [a, outerA, { x: channel, y: outerA.y }, { x: channel, y: outerB.y }, outerB, b];
}

/**
 * Orthogonal route: the whole explicit path is planned when waypoints exist,
 * otherwise the automatic Z/detour route runs. Straight and curved modes keep
 * every authored point verbatim.
 *
 * An authored bend is honoured unless it lies inside an entity or dropping it
 * removes a whole-path direction reversal without adding crossings. Every skip
 * is returned with a reason and its authored index; the document text stays
 * exactly as written. Canvas and CLI both use the returned polyline.
 */
export function routeOrtho(input: RouteInput): Polyline {
  return input.waypoints !== undefined && input.waypoints.length > 0
    ? planExplicitRoute(input).points
    : routeAuto(input);
}

/** One route plan using the visual mode; orthogonal remains the default. */
export function planLink(input: RouteInput, mode: RouteMode = 'orthogonal'): RoutePlan {
  if (input.allowOverlap) {
    return planLink({ ...input, obstacles: [], routes: [], allowOverlap: false }, mode);
  }
  if (mode === 'orthogonal') {
    return input.waypoints !== undefined && input.waypoints.length > 0
      ? planExplicitRoute(input)
      : { points: routeAuto(input), skips: [] };
  }
  const { a, b } = routeEndpoints(input);
  return {
    points: [a, ...(input.waypoints ?? []).map(([x, y]) => ({ x, y })), b],
    skips: [],
  };
}

/** Route one link using its visual mode; orthogonal remains the default. */
export function routeLink(input: RouteInput, mode: RouteMode = 'orthogonal'): Polyline {
  return planLink(input, mode).points;
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
      return stubbedRoute(a, b, sideA, sideB, ny, clearance);
    }
    const nx = nearestEdge(a.x, hit.x - clearance, hit.x + hit.w + clearance);
    return stubbedRoute(a, b, sideA, sideB, nx, clearance);
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

function sharedApproach(point: Point, route: RouteObstacle): boolean {
  return samePoint(point, route.points[0]!) || samePoint(point, route.points[route.points.length - 1]!);
}

function routeConflictCount(points: Polyline, routes: RouteObstacle[]): number {
  const ends = [points[0]!, points[points.length - 1]!];
  let conflicts = 0;
  for (let i = 1; i < points.length; i++) {
    for (const route of routes) {
      for (let j = 1; j < route.points.length; j++) {
        const a = points[i - 1]!;
        const b = points[i]!;
        const c = route.points[j - 1]!;
        const d = route.points[j]!;
        const approach = points.length > 4 && (i <= 2 || i >= points.length - 2) &&
          sharedApproach(i <= 2 ? points[0]! : points[points.length - 1]!, route);
        if (segmentsTouch(a, b, c, d) && !sharedEndpoint(a, b, c, d, ends) && !approach) conflicts++;
      }
    }
  }
  return conflicts;
}

/**
 * Interior conflicts, including the route's own endpoints. An automatic route
 * has to leave and reach its ports without cutting through either shape — the
 * port and the clearance stub only touch the perimeter, which the inset
 * rectangles deliberately allow.
 */
function entityConflictCount(points: Polyline, input: RouteInput): number {
  const rects = entityRects(input).map(insetRect);
  return points.slice(1).reduce((total, point, index) => total +
    rects.filter((rect) => segmentEntersRect(points[index]!, point, rect)).length, 0);
}

function pathLength(points: Polyline): number {
  return points.slice(1).reduce((total, point, index) => total +
    Math.abs(point.x - points[index]!.x) + Math.abs(point.y - points[index]!.y), 0);
}

/**
 * Direction changes along one axis: a route that runs right, back left, then
 * right again reads as a loop. Counted per axis so an ordinary Z or an
 * obstacle detour (one turn each) stays at zero.
 */
function reversals(points: Polyline): number {
  let total = 0;
  for (const axis of ['x', 'y'] as const) {
    let sign = 0;
    for (let i = 1; i < points.length; i++) {
      const step = Math.sign(points[i]![axis] - points[i - 1]![axis]);
      if (step === 0) continue;
      if (sign !== 0 && step !== sign) total++;
      sign = step;
    }
  }
  return total;
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

function appendStubbedCandidates(candidates: Polyline[], a: Point, b: Point, input: RouteInput): void {
  const [sideA, sideB] = pickSides(input.from, input.to);
  const clearance = input.clearance ?? ROUTER_CLEARANCE;
  const axis = horizontalSide(sideA) ? 'y' : 'x';
  for (const channel of routeChannels(input, axis)) {
    candidates.push(stubbedRoute(a, b, sideA, sideB, channel, clearance));
  }
}

function validAutomaticCandidate(points: Polyline, input: RouteInput): boolean {
  const [sideA, sideB] = pickSides(input.from, input.to);
  if (points.length < 2) return false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  const first = points[1]!;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const last = points[points.length - 2]!;
  return inwardOf(first, a, outward(sideA)) && inwardOf(last, b, outward(sideB));
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
  if (input.fromAnchor !== undefined || input.toAnchor !== undefined) return candidates;
  appendStubbedCandidates(candidates, a, b, input);
  return candidates.map(compact).filter((points) => validAutomaticCandidate(points, input));
}

function routeScore(points: Polyline, input: RouteInput): number {
  const routes = input.routes ?? [];
  // Ordered so a crossing outranks everything, a shared line with another
  // connector outranks shape, and the readability terms only break ties.
  return entityConflictCount(points, input) * 100000 +
    routeConflictCount(points, routes) * 10000 +
    reversals(points) * 1000 +
    pathLength(points);
}

function avoidRouteConflicts(base: Polyline, input: RouteInput): Polyline {
  if (entityConflictCount(base, input) === 0 && routeConflictCount(base, input.routes ?? []) === 0 &&
    reversals(base) === 0) return base;
  return routeCandidates(base, input).reduce((best, candidate) =>
    routeScore(candidate, input) < routeScore(best, input) ? candidate : best, base);
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
