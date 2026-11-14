// SPDX-License-Identifier: GPL-3.0-only
// Pure mini-map projection: canvas bounds + camera → a fixed CSS-pixel surface.
import { unionRects, type Point, type Rect, type Size, type Transform } from '../engine/render/viewport';

export interface MiniMapLayout {
  bounds: Rect;
  scale: number;
  offset: Point;
  objects: Rect[];
  viewport: Rect;
}

export function visibleCanvasRect(t: Transform, view: Size): Rect {
  return { x: -t.x / t.k, y: -t.y / t.k, w: view.w / t.k, h: view.h / t.k };
}

function project(r: Rect, bounds: Rect, scale: number, offset: Point): Rect {
  return {
    x: offset.x + (r.x - bounds.x) * scale,
    y: offset.y + (r.y - bounds.y) * scale,
    w: Math.max(1, r.w * scale),
    h: Math.max(1, r.h * scale),
  };
}

export function buildMiniMap(
  objects: Rect[], t: Transform, view: Size, map: Size, routes: Point[][] = [],
): MiniMapLayout {
  const viewport = visibleCanvasRect(t, view);
  const routeBounds = routes.flatMap((points) => points.map((point) => ({ x: point.x, y: point.y, w: 0, h: 0 })));
  const content = unionRects([...objects, ...routeBounds, viewport]) ?? viewport;
  const padding = 24 / t.k;
  const bounds = {
    x: content.x - padding,
    y: content.y - padding,
    w: Math.max(1, content.w + padding * 2),
    h: Math.max(1, content.h + padding * 2),
  };
  const scale = Math.min(map.w / bounds.w, map.h / bounds.h);
  const offset = {
    x: (map.w - bounds.w * scale) / 2,
    y: (map.h - bounds.h * scale) / 2,
  };
  return {
    bounds,
    scale,
    offset,
    objects: objects.map((r) => project(r, bounds, scale, offset)),
    viewport: project(viewport, bounds, scale, offset),
  };
}

export function miniMapPointToCanvas(layout: MiniMapLayout, point: Point): Point {
  return {
    x: layout.bounds.x + (point.x - layout.offset.x) / layout.scale,
    y: layout.bounds.y + (point.y - layout.offset.y) / layout.scale,
  };
}
