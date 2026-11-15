// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP09 route editing: the pure geometry behind every bend gesture. The
// canvas owns selection, undo and rendering; this module only turns a rendered
// polyline into a different rendered polyline, so straight/curved routes keep
// their own semantics and the router stays untouched.
import type { Point, Rect } from './viewport';

/** A rendered segment; `editable` means both ends are interior (movable). */
export interface RouteSegment {
  index: number;
  a: Point;
  b: Point;
  axis: 'h' | 'v' | 'diag';
  mid: Point;
  editable: boolean;
}

/** An interior vertex: the visible "bend" handle of a route. */
export interface RouteApex {
  index: number;
  point: Point;
}

const EPS = 0.01;
const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;

const axisOf = (a: Point, b: Point): RouteSegment['axis'] => {
  if (Math.abs(a.y - b.y) < EPS) return 'h';
  if (Math.abs(a.x - b.x) < EPS) return 'v';
  return 'diag';
};

/** Every segment of the rendered polyline, with its handle position. */
export function segments(points: readonly Point[]): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    out.push({
      index: i,
      a,
      b,
      axis: axisOf(a, b),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      // A segment that owns an endpoint cannot slide: the anchor is semantic.
      editable: i >= 1 && i + 1 <= points.length - 2,
    });
  }
  return out;
}

/**
 * UX08-WP09 snapping: line an orthogonal channel up with a corner, a side
 * midpoint or the centre of any other entity. `axis` is the channel's own
 * orientation — a horizontal segment slides on y, a vertical one on x.
 */
export interface ChannelSnap {
  value: number;
  /** True when an entity line produced the value (grid snapping is separate). */
  snapped: boolean;
}

/** Lines one rect contributes on an axis: both edges plus the centre. */
function linesOf(rects: readonly Rect[], axis: 'h' | 'v'): number[] {
  return rects.flatMap((r) =>
    axis === 'h' ? [r.y, r.y + r.h / 2, r.y + r.h] : [r.x, r.x + r.w / 2, r.x + r.w],
  );
}

/**
 * Snap a channel coordinate to the closest entity line within `threshold` (in
 * canvas units — the caller divides a screen-space threshold by the zoom).
 */
export function snapChannel(
  value: number,
  axis: 'h' | 'v',
  rects: readonly Rect[],
  threshold: number,
): ChannelSnap {
  let best: number | null = null;
  for (const line of linesOf(rects, axis)) {
    const delta = Math.abs(line - value);
    if (delta > threshold) continue;
    if (best === null || delta < Math.abs(best - value)) best = line;
  }
  return best === null ? { value, snapped: false } : { value: best, snapped: true };
}

/** Interior vertices (bends) — the ones a user may drag or delete. */
export function apexes(points: readonly Point[]): RouteApex[] {
  return points.slice(1, Math.max(1, points.length - 1)).map((point, i) => ({
    index: i + 1,
    point,
  }));
}

/**
 * Store a rendered route as explicit waypoints: the interior vertices only. The
 * ends belong to the entities, so they are never written to the document.
 */
export function materialize(points: readonly Point[]): Point[] {
  return canonicalize(points).slice(1, Math.max(1, points.length - 1));
}

/**
 * Split `segIndex` at `at` into a dogleg: two coincident interior points the
 * caller can then pull apart. The pointer is projected onto the segment so the
 * result stays axis-aligned.
 */
export function insertBend(points: readonly Point[], segIndex: number, at: Point): Point[] {
  const target = segments(points).find((s) => s.index === segIndex);
  if (!target || points.length < 2) return [...points];
  const insertAt =
    target.axis === 'h'
      ? { x: at.x, y: target.a.y }
      : target.axis === 'v'
        ? { x: target.a.x, y: at.y }
        : { x: at.x, y: at.y };
  return [...points.slice(0, segIndex + 1), insertAt, { ...insertAt }, ...points.slice(segIndex + 1)];
}

/**
 * Split one segment by adding a bend at the pointer, so the piece can then be
 * pulled into an L. Unlike [`insertBend`] this keeps the new vertex: an
 * explicitly requested bend is intent, not the redundant collinear point
 * [`canonicalize`] removes after a move.
 */
export function splitSegment(points: readonly Point[], segIndex: number, at: Point): Point[] {
  const target = segments(points).find((s) => s.index === segIndex);
  if (!target) return [...points];
  const bend: Point =
    target.axis === 'h'
      ? { x: at.x, y: target.a.y }
      : target.axis === 'v'
        ? { x: target.a.x, y: at.y }
        : { x: at.x, y: at.y };
  return [...points.slice(0, segIndex + 1), bend, ...points.slice(segIndex + 1)];
}

/** A maximal run of collinear segments the user can slide as one channel. */
export interface RouteChannel {
  /** First segment index of the run. */
  from: number;
  /** Last segment index of the run. */
  to: number;
  axis: 'h' | 'v';
  /** Perpendicular coordinate (y for a horizontal channel). */
  at: number;
  /** Handle position: the midpoint of the run's longest segment. */
  mid: Point;
  /** Both ends of the run are interior vertices — the channel can slide. */
  editable: boolean;
}

const lengthOf = (s: RouteSegment): number => Math.abs(s.b.x - s.a.x) + Math.abs(s.b.y - s.a.y);

const perpendicularOf = (s: RouteSegment): number => (s.axis === 'h' ? s.a.y : s.a.x);

/**
 * Group segments into channels. Consecutive collinear segments are one channel
 * — a run split by a waypoint is still one slide, and a leg that doubles back
 * on the same channel must not produce two stacked handles.
 */
export function channels(points: readonly Point[]): RouteChannel[] {
  const list = segments(points);
  const out: RouteChannel[] = [];
  let i = 0;
  while (i < list.length) {
    const first = list[i]!;
    if (first.axis === 'diag') {
      i++;
      continue;
    }
    const at = perpendicularOf(first);
    let last = i;
    while (
      last + 1 < list.length &&
      list[last + 1]!.axis === first.axis &&
      perpendicularOf(list[last + 1]!) === at
    ) {
      last++;
    }
    const longest = list
      .slice(i, last + 1)
      .reduce((best, segment) => (lengthOf(segment) > lengthOf(best) ? segment : best));
    out.push({
      from: i,
      to: last,
      axis: first.axis,
      at,
      mid: longest.mid,
      // A run that reaches either end of the route owns an endpoint anchor, and
      // an anchor is semantic: it cannot slide.
      editable: i >= 1 && last + 1 <= points.length - 2,
    });
    i = last + 1;
  }
  return out;
}

/**
 * Slide one channel: every vertex of its run moves on the perpendicular axis,
 * so the run keeps its direction and the neighbouring legs only change length.
 */
export function moveChannel(
  points: readonly Point[],
  from: number,
  delta: number,
): Point[] | null {
  const channel = channels(points).find((c) => c.from === from);
  if (!channel || !channel.editable) return null;
  const key = channel.axis === 'h' ? 'y' : 'x';
  return points.map((point, i) =>
    i >= channel.from && i <= channel.to + 1 ? { ...point, [key]: point[key] + delta } : point,
  );
}

/** Move one interior vertex (free 2-D, as a bend drag is). */
export function moveBend(points: readonly Point[], index: number, to: Point): Point[] {
  if (index < 1 || index > points.length - 2) return [...points];
  return points.map((point, i) => (i === index ? { x: to.x, y: to.y } : point));
}

/** Remove one interior vertex; endpoints are never removable. */
export function deleteBend(points: readonly Point[], index: number): Point[] {
  if (index < 1 || index > points.length - 2) return [...points];
  return canonicalize(points.filter((_, i) => i !== index));
}

/**
 * Slide an interior segment sideways: both of its vertices move on the axis
 * perpendicular to it, so the segment keeps its direction and the neighbouring
 * segments only change length. Null when the segment owns an endpoint.
 */
export function moveSegment(points: readonly Point[], segIndex: number, delta: number): Point[] | null {
  const target = segments(points).find((s) => s.index === segIndex);
  if (!target || !target.editable) return null;
  const key = target.axis === 'h' ? 'y' : target.axis === 'v' ? 'x' : null;
  if (key === null) return null; // a diagonal has no channel to slide
  return points.map((point, i) =>
    i === segIndex || i === segIndex + 1 ? { ...point, [key]: point[key] + delta } : point,
  );
}

/**
 * Drop duplicate and redundant collinear vertices, keeping both ends. This is
 * what stops an edit from leaving invisible points behind in the document.
 */
export function canonicalize(points: readonly Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const last = deduped.at(-1);
    if (last === undefined || !same(last, point)) deduped.push({ x: point.x, y: point.y });
  }
  if (deduped.length <= 2) return deduped;
  const out: Point[] = [deduped[0]!];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = out.at(-1)!;
    const cur = deduped[i]!;
    const next = deduped[i + 1]!;
    const collinear = axisOf(prev, cur) === axisOf(cur, next) && axisOf(prev, cur) !== 'diag';
    if (!collinear) out.push(cur);
  }
  out.push(deduped.at(-1)!);
  return out;
}
