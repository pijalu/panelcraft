// SPDX-License-Identifier: GPL-3.0-only
// CX-01 normalized endpoint anchors. Each side owns one quarter of [0, 1):
// top, right, bottom, left. Side-relative fractions survive entity resizing.

import type { Point, Rect } from './viewport';
import type { Side } from './router';

export interface PerimeterProjection {
  t: number;
  point: Point;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Resolve a normalized side-quarter parameter to an exact perimeter point. */
export function perimeterPoint(r: Rect, t: number): Point {
  const normalized = clamp01(t);
  const side = Math.min(3, Math.floor(normalized * 4));
  const fraction = normalized * 4 - side;
  if (side === 0) return { x: r.x + r.w * fraction, y: r.y };
  if (side === 1) return { x: r.x + r.w, y: r.y + r.h * fraction };
  if (side === 2) return { x: r.x + r.w * (1 - fraction), y: r.y + r.h };
  return { x: r.x, y: r.y + r.h * (1 - fraction) };
}

/** Side used for an orthogonal tangent; dominant direction chooses at corners. */
export function perimeterSide(t: number, point: Point, toward: Point): Side {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const corner = Number.isInteger(t * 4);
  if (corner && Math.abs(dx) >= Math.abs(dy)) return t === 0 || t === 0.25 ? 'top' : 'bottom';
  if (corner) return t === 0 || t === 0.75 ? 'left' : 'right';
  if (t < 0.25) return 'top';
  if (t < 0.5) return 'right';
  if (t < 0.75) return 'bottom';
  return 'left';
}

/** Project an inside/outside pointer to the nearest clamped entity perimeter. */
export function projectPerimeter(r: Rect, pointer: Point): PerimeterProjection {
  const x = Math.max(r.x, Math.min(r.x + r.w, pointer.x));
  const y = Math.max(r.y, Math.min(r.y + r.h, pointer.y));
  const candidates: PerimeterProjection[] = [
    { t: 0.25 * clamp01((x - r.x) / r.w), point: { x, y: r.y } },
    { t: 0.25 + 0.25 * clamp01((y - r.y) / r.h), point: { x: r.x + r.w, y } },
    { t: 0.5 + 0.25 * (1 - clamp01((x - r.x) / r.w)), point: { x, y: r.y + r.h } },
    { t: 0.75 + 0.25 * (1 - clamp01((y - r.y) / r.h)), point: { x: r.x, y } },
  ];
  let best = candidates[0]!;
  let distance = Math.hypot(pointer.x - best.point.x, pointer.y - best.point.y);
  for (const candidate of candidates.slice(1)) {
    const next = Math.hypot(pointer.x - candidate.point.x, pointer.y - candidate.point.y);
    if (next < distance) {
      best = candidate;
      distance = next;
    }
  }
  return best;
}
