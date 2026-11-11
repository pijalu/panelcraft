// SPDX-License-Identifier: GPL-3.0-only
// Deterministic link-label placement. A spatial index keeps collision checks
// local on dense C4 diagrams; route order provides stable tie-breaking.

import type { Polyline } from './router';
import { routeLabelPoint, sampleRoute } from './routePath';
import type { Point, Rect } from './viewport';
import type { SceneLink } from './scenegraph';
import type { SceneObject } from './shapes';

export interface LabelPlacement {
  point: Point;
  rect: Rect;
}

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

function labelRect(point: Point, text: string): Rect {
  const w = Math.min(240, Math.max(24, text.length * 6 + 8));
  return { x: point.x - w / 2, y: point.y - 2, w, h: 14 };
}

function candidates(base: Point, points: Polyline, text: string): Point[] {
  const width = labelRect(base, text).w;
  const shift = width / 2 + 24;
  const first = points[0]!;
  const next = points[1] ?? first;
  const horizontal = Math.abs(next.x - first.x) >= Math.abs(next.y - first.y);
  const offsets: [number, number][] = [
    [0, 0], [0, -18], [0, 18], [-shift, 0], [shift, 0],
    [-shift, -18], [shift, -18], [-shift, 18], [shift, 18], [0, -36], [0, 36],
  ];
  return offsets.map(([a, b]) => ({
    x: base.x + (horizontal ? a : b),
    y: base.y + (horizontal ? b : a),
  }));
}

interface CollisionContext {
  objects: SpatialIndex<Rect>;
  routes: SpatialIndex<RouteRecord>;
  labels: SpatialIndex<Rect>;
}

function collisionCount(rect: Rect, own: string, context: CollisionContext): number {
  let count = 0;
  count += context.objects.query(rect).filter((o) => intersects(o.bounds, rect)).length;
  count += context.labels.query(rect).filter((l) => intersects(l.bounds, rect)).length;
  count += context.routes.query(rect).filter((r) => r.value.id !== own && routeHitsRect(r.value, rect)).length;
  return count;
}

function placeLabel(link: SceneLink, context: CollisionContext): LabelPlacement {
  const points = sampleRoute(link.points, link.route);
  const base = routeLabelPoint(link.points, link.route);
  let best: LabelPlacement = { point: base, rect: labelRect(base, link.label ?? '') };
  let bestScore = Infinity;
  for (const point of candidates(base, points, link.label ?? '')) {
    const rect = labelRect(point, link.label ?? '');
    const collisions = collisionCount(rect, link.id, context);
    const distance = Math.hypot(point.x - base.x, point.y - base.y);
    const score = collisions * 100000 + distance;
    if (score < bestScore) {
      best = { point, rect };
      bestScore = score;
    }
    if (collisions === 0) break;
  }
  return best;
}

/** Place all labels without unrelated routes, solid objects, or prior labels. */
export function layoutLinkLabels(scene: LabelScene): Map<string, LabelPlacement> {
  const context: CollisionContext = {
    objects: new SpatialIndex<Rect>(),
    routes: new SpatialIndex<RouteRecord>(),
    labels: new SpatialIndex<Rect>(),
  };
  for (const object of scene.objects) {
    if (object.kind !== 'group') context.objects.add(object, object);
  }
  for (const link of scene.links) {
    const points = sampleRoute(link.points, link.route);
    context.routes.add({ id: link.id, points, bounds: boundsOf(points) }, boundsOf(points));
  }
  const placed = new Map<string, LabelPlacement>();
  for (const link of scene.links) {
    if (!link.label) continue;
    const placement = placeLabel(link, context);
    placed.set(link.id, placement);
    context.labels.add(placement.rect, placement.rect);
  }
  return placed;
}
