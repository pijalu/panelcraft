// SPDX-License-Identifier: GPL-3.0-only
// Deterministic link-label placement. A spatial index keeps collision checks
// local on dense C4 diagrams; route order provides stable tie-breaking.

import type { Polyline } from './router';
import { routeLabelPoint, sampleRoute } from './routePath';
import { stubMeasurer, wrapLabel, type TextMeasurer } from './measure';
import type { Point, Rect } from './viewport';
import type { SceneLink } from './scenegraph';
import type { SceneObject } from './shapes';

/**
 * UX08-WP10: one placed label. `rect` is the box used for *both* collision
 * scoring and paint, so what was scored is exactly what a reader sees.
 */
export interface LabelPlacement {
  /** Box centre (paint position). */
  point: Point;
  /** Box used for collision scoring and paint. */
  rect: Rect;
  /** Wrapped lines, bounded in width and count. */
  lines: string[];
  /** Full content — assistive tech and exports never lose text. */
  text: string;
  /** Route point this label belongs to (leader target). */
  anchor: Point;
  /** True when displacement is large enough that ownership needs a leader. */
  leader: boolean;
}

export interface LabelLayoutOptions {
  measure?: TextMeasurer;
  /** Wrapping bound for one label box, in canvas units. */
  maxWidth?: number;
  maxLines?: number;
}

export const LABEL_MAX_WIDTH = 180;
export const LABEL_MAX_LINES = 3;
export const LABEL_LINE_HEIGHT = 14;
export const LABEL_PAD_X = 6;
export const LABEL_PAD_Y = 2;
/** Distance from the route line to the label box; reads as "belongs to it". */
const NORMAL_GAP = 12;
/** Displacement (canvas units) beyond which a leader is drawn. */
const LEADER_MIN = 20;

interface LabelScene {
  objects: SceneObject[];
  links: SceneLink[];
}

interface RouteRecord {
  id: string;
  points: Polyline;
  bounds: Rect;
}

interface Bounded<T> {
  value: T;
  bounds: Rect;
}

const CELL = 128;

function cells(rect: Rect): string[] {
  const out: string[] = [];
  const x0 = Math.floor(rect.x / CELL);
  const x1 = Math.floor((rect.x + rect.w) / CELL);
  const y0 = Math.floor(rect.y / CELL);
  const y1 = Math.floor((rect.y + rect.h) / CELL);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${x}:${y}`);
  return out;
}

class SpatialIndex<T> {
  private grid = new Map<string, Bounded<T>[]>();

  add(value: T, bounds: Rect): void {
    const item = { value, bounds };
    for (const cell of cells(bounds)) {
      const bucket = this.grid.get(cell) ?? [];
      bucket.push(item);
      this.grid.set(cell, bucket);
    }
  }

  query(rect: Rect): Bounded<T>[] {
    const found = new Set<Bounded<T>>();
    for (const cell of cells(rect)) {
      for (const item of this.grid.get(cell) ?? []) found.add(item);
    }
    return [...found];
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function boundsOf(points: Polyline): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Smallest rectangle containing every given rectangle (empty → zero size). */
function unionOf(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  const bounds = {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
  };
  return intersects(bounds, rect);
}

function routeHitsRect(route: RouteRecord, rect: Rect): boolean {
  if (!intersects(route.bounds, rect)) return false;
  return route.points.slice(1).some((p, i) => segmentHitsRect(route.points[i]!, p, rect));
}

/** Wrapped box for one label: bounded width and line count, measured text. */
interface LabelBox {
  lines: string[];
  w: number;
  h: number;
}

function wrapBox(
  text: string,
  measure: TextMeasurer,
  maxWidth: number,
  maxLines: number,
): LabelBox {
  const lines = wrapLabel(text, measure, maxWidth, maxLines);
  const widest = Math.max(24, ...lines.map((line) => measure.measure(line).w));
  return {
    lines,
    w: Math.min(maxWidth, widest) + 2 * LABEL_PAD_X,
    h: lines.length * LABEL_LINE_HEIGHT + 2 * LABEL_PAD_Y,
  };
}

function boxRect(point: Point, box: LabelBox): Rect {
  return { x: point.x - box.w / 2, y: point.y - box.h / 2, w: box.w, h: box.h };
}

/** A paint position plus the route point it is associated with. */
interface Candidate {
  point: Point;
  anchor: Point;
}

/** An axis-aligned run of the route a label may slide along. */
interface Run {
  start: Point;
  /** Unit vector along the run. */
  dir: Point;
  /** Unit normal, canonicalised so side `-1` always means the same way. */
  normal: Point;
  /** Half the box measured along the run (support function of the box). */
  halfAlong: number;
  /** Half the box measured across the run. */
  halfAcross: number;
  /** Distances from `start` where the whole box still fits inside the run. */
  positions: number[];
}

const ALONG_FRACTIONS = [0.5, 0.15, 0.85, 0.05, 0.95];
const MIN_RUN = 0.5;
/** Sampled curves can carry dozens of sub-segments; cap the work per label. */
const MAX_RUNS = 24;

/** Canonical normal: horizontal runs offset downwards, vertical ones rightwards. */
function normalOf(dir: Point): Point {
  const normal = { x: -dir.y, y: dir.x };
  const flip = normal.y < 0 || (normal.y === 0 && normal.x < 0);
  return flip ? { x: -normal.x, y: -normal.y } : normal;
}

/**
 * Positions are sampled from the span where the whole box still fits inside the
 * run, so a wide label slides along its own route instead of hanging over the
 * neighbours. A run shorter than the box only offers its midpoint.
 */
function runOf(a: Point, b: Point, box: LabelBox): Run | null {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < MIN_RUN) return null;
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const normal = normalOf(dir);
  const halfAlong = (Math.abs(dir.x) * box.w + Math.abs(dir.y) * box.h) / 2;
  const halfAcross = (Math.abs(normal.x) * box.w + Math.abs(normal.y) * box.h) / 2;
  const room = length - 2 * halfAlong;
  return {
    start: a,
    dir,
    normal,
    halfAlong,
    halfAcross,
    positions: room > 0
      ? ALONG_FRACTIONS.map((f) => halfAlong + room * f)
      : [length / 2],
  };
}

/**
 * Offsets escalate: a blocker sitting on the route forces the label further out
 * until it clears the band, instead of settling for an overlap. Slide along the
 * run before moving further away: a label that can clear a conflict sideways
 * stays on its own route line.
 */
function runCandidates(run: Run): Candidate[] {
  const out: Candidate[] = [];
  const gap = run.halfAcross + NORMAL_GAP;
  for (const step of [1, 2, 3]) {
    for (const along of run.positions) {
      for (const side of [-1, 1]) {
        const anchor = {
          x: run.start.x + run.dir.x * along,
          y: run.start.y + run.dir.y * along,
        };
        const offset = side * gap * step;
        out.push({
          point: { x: anchor.x + run.normal.x * offset, y: anchor.y + run.normal.y * offset },
          anchor,
        });
      }
    }
  }
  return out;
}

/**
 * UX08-WP10 candidates: the stable route anchor first (so an unobstructed label
 * never moves), then positions *along* each run of the route with a normal
 * offset on both sides. Sampling the whole route is what rescues a label from a
 * blocker that swallows every near-midpoint offset; working in run-local
 * coordinates keeps straight, orthogonal and sampled-curve routes identical.
 */
function candidates(base: Point, points: Polyline, box: LabelBox): Candidate[] {
  const out: Candidate[] = [{ point: base, anchor: base }];
  const runs = points.length - 1;
  const stride = runs > MAX_RUNS ? Math.ceil(runs / MAX_RUNS) : 1;
  for (let i = 1; i < points.length; i += stride) {
    const run = runOf(points[i - 1]!, points[i]!, box);
    if (run) out.push(...runCandidates(run));
  }
  return out;
}

interface CollisionContext {
  objects: SpatialIndex<Rect>;
  routes: SpatialIndex<RouteRecord>;
  labels: SpatialIndex<Rect>;
  /** Bounds of everything the diagram contains: objects plus routes. */
  frame: Rect;
}

function collisionCount(rect: Rect, own: string, context: CollisionContext): number {
  let count = 0;
  count += context.objects.query(rect).filter((o) => intersects(o.bounds, rect)).length;
  count += context.labels.query(rect).filter((l) => intersects(l.bounds, rect)).length;
  count += context.routes.query(rect).filter((r) => r.value.id !== own && routeHitsRect(r.value, rect)).length;
  return count;
}

/**
 * Distance the box sticks out of the diagram frame, or 0 when it fits. A label
 * that hangs outside the drawn content is the one case fit-to-view cannot help
 * with, so the placement prefers the inward side of an edge-hugging route.
 */
function overshoot(rect: Rect, frame: Rect): number {
  const left = frame.x - rect.x;
  const top = frame.y - rect.y;
  const right = rect.x + rect.w - (frame.x + frame.w);
  const bottom = rect.y + rect.h - (frame.y + frame.h);
  return Math.max(0, left) + Math.max(0, top) + Math.max(0, right) + Math.max(0, bottom);
}

function placeLabel(
  link: SceneLink,
  context: CollisionContext,
  options: Required<LabelLayoutOptions>,
): LabelPlacement {
  const text = link.label ?? '';
  const points = sampleRoute(link.points, link.route, link.ends);
  const base = routeLabelPoint(link.points, link.route);
  const box = wrapBox(text, options.measure, options.maxWidth, options.maxLines);
  const make = (candidate: Candidate): LabelPlacement => {
    const distance = Math.hypot(candidate.point.x - candidate.anchor.x, candidate.point.y - candidate.anchor.y);
    return {
      point: candidate.point,
      rect: boxRect(candidate.point, box),
      lines: box.lines,
      text,
      anchor: candidate.anchor,
      leader: distance > LEADER_MIN,
    };
  };
  let best = make({ point: base, anchor: base });
  let bestScore = Infinity;
  for (const candidate of candidates(base, points, box)) {
    const placement = make(candidate);
    const collisions = collisionCount(placement.rect, link.id, context);
    const distance = Math.hypot(
      candidate.point.x - candidate.anchor.x,
      candidate.point.y - candidate.anchor.y,
    );
    // Deterministic and strictly ordered: objects overwhelm everything, then
    // staying inside the drawn frame, and only then the distance from the
    // route, which keeps an unobstructed label on its stable anchor.
    const escape = overshoot(placement.rect, context.frame) > 0 ? 100000 : 0;
    const score = collisions * 1000000 + escape + distance;
    if (score < bestScore) {
      best = placement;
      bestScore = score;
    }
    if (collisions === 0 && escape === 0) break;
  }
  return best;
}

/** Place all labels without unrelated routes, solid objects, or prior labels. */
export function layoutLinkLabels(
  scene: LabelScene,
  options: LabelLayoutOptions = {},
): Map<string, LabelPlacement> {
  const resolved: Required<LabelLayoutOptions> = {
    measure: options.measure ?? stubMeasurer,
    maxWidth: options.maxWidth ?? LABEL_MAX_WIDTH,
    maxLines: options.maxLines ?? LABEL_MAX_LINES,
  };
  const context: CollisionContext = {
    objects: new SpatialIndex<Rect>(),
    routes: new SpatialIndex<RouteRecord>(),
    labels: new SpatialIndex<Rect>(),
    frame: { x: 0, y: 0, w: 0, h: 0 },
  };
  const boxes: Rect[] = [];
  for (const object of scene.objects) {
    if (object.kind === 'group') continue;
    context.objects.add(object, object);
    boxes.push(object);
  }
  for (const link of scene.links) {
    const points = sampleRoute(link.points, link.route, link.ends);
    const bounds = boundsOf(points);
    context.routes.add({ id: link.id, points, bounds }, bounds);
    boxes.push(bounds);
  }
  context.frame = unionOf(boxes);
  const placed = new Map<string, LabelPlacement>();
  for (const link of scene.links) {
    if (!link.label) continue;
    const placement = placeLabel(link, context, resolved);
    placed.set(link.id, placement);
    context.labels.add(placement.rect, placement.rect);
  }
  return placed;
}
