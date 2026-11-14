// SPDX-License-Identifier: GPL-3.0-only
// Hit-testing + selection math (M2-WP3, FR-C4). Pure geometry over the scene
// types; the canvas controller maps results to selection state.
//
// Z-order rule: scene arrays are paint order (bottom→top). Picks iterate in
// reverse so the visually topmost element wins. Links sit below objects.

import { distanceToPolyline } from './router';
import type { Polyline } from './router';
import { sampleRoute } from './routePath';
import type { SceneObject } from './shapes';
import type { SceneLink } from './scenegraph';
import { stackObjects } from './stacking';

export interface Pick {
  type: 'object' | 'link';
  id: string;
}

export const LINK_HIT_SLOP_PX = 6;

export function pointInRect(p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

/** All objects containing the point, topmost first (FR-C4 z-order). */
export function hitObjects(objects: SceneObject[], p: { x: number; y: number }): SceneObject[] {
  const hits: SceneObject[] = [];
  const stacked = stackObjects(objects);
  for (let i = stacked.length - 1; i >= 0; i--) {
    const o = stacked[i];
    if (o && pointInRect(p, o)) hits.push(o);
  }
  return hits;
}

/** Topmost object under the point, or null. */
export function hitObject(objects: SceneObject[], p: { x: number; y: number }): SceneObject | null {
  return hitObjects(objects, p)[0] ?? null;
}

/** Rubber-band selection: every object intersecting the band rect (FR-C4). */
export function objectsInBand(
  objects: SceneObject[],
  band: { x: number; y: number; w: number; h: number },
): SceneObject[] {
  return objects.filter((o) => rectsIntersect(o, band));
}

/** Nearest link within slop px of the point (perpendicular hit), or null. */
export function hitLink(
  links: SceneLink[],
  p: { x: number; y: number },
  slop = LINK_HIT_SLOP_PX,
): SceneLink | null {
  let best: SceneLink | null = null;
  let bestDist = Infinity;
  for (let i = links.length - 1; i >= 0; i--) {
    const l = links[i];
    if (!l) continue;
    const d = distanceToPolyline(p, sampleRoute(l.points as Polyline, l.route));
    if (d <= slop && d < bestDist) {
      bestDist = d;
      best = l;
    }
  }
  return best;
}

/**
 * Combined pick: objects win over links (they paint above), z-order decides
 * among overlapping objects. Group boundaries never swallow picks aimed at
 * children — the controller filters them out before calling.
 */
export function pick(
  objects: SceneObject[],
  links: SceneLink[],
  p: { x: number; y: number },
  slop = LINK_HIT_SLOP_PX,
): Pick | null {
  const obj = hitObject(objects, p);
  if (obj) return { type: 'object', id: obj.id };
  const link = hitLink(links, p, slop);
  return link ? { type: 'link', id: link.id } : null;
}
