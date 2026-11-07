// SPDX-License-Identifier: GPL-3.0-only
// Snap + alignment-guide math (M2-WP4, FR-C2). Pure functions; DOM-free.
// Canvas grid defaults to 8 px (4 px token grid × 2); grid rendering and the
// toggle live in the canvas UI layer.

import type { Rect } from './viewport';

export const GRID_SIZE = 8;
export const GUIDE_THRESHOLD_PX = 4;

export interface RectDelta {
  dx: number;
  dy: number;
}

/** Snap a scalar to the nearest grid multiple. */
export function snapToGrid(v: number, grid = GRID_SIZE): number {
  return Math.round(v / grid) * grid || 0; // `|| 0` normalizes -0
}

/** Snap a rect's position (x, y); size preserved. */
export function snapRect(r: Rect, grid = GRID_SIZE): RectDelta {
  return { dx: snapToGrid(r.x, grid) - r.x, dy: snapToGrid(r.y, grid) - r.y };
}

/** Snap a resize so x/y/x2/y2 land on grid (min size = one grid cell). */
export function snapResize(r: Rect, grid = GRID_SIZE): Rect {
  const x = snapToGrid(r.x, grid);
  const y = snapToGrid(r.y, grid);
  const x2 = snapToGrid(r.x + r.w, grid);
  const y2 = snapToGrid(r.y + r.h, grid);
  return { x, y, w: Math.max(grid, x2 - x), h: Math.max(grid, y2 - y) };
}

export interface Guide {
  axis: 'v' | 'h';
  /** Guide line position in canvas coords (x for v, y for h). */
  at: number;
  /** Which edge/center of the static rect produced the guide. */
  source: 'start' | 'center' | 'end';
}

export interface GuideResult {
  dx: number;
  dy: number;
  /** Fired guides this move (≤1 per axis). */
  guides: Guide[];
}

interface Candidate {
  at: number;
  source: Guide['source'];
}

function xCandidates(r: Rect): Candidate[] {
  return [
    { at: r.x, source: 'start' },
    { at: r.x + r.w / 2, source: 'center' },
    { at: r.x + r.w, source: 'end' },
  ];
}

function yCandidates(r: Rect): Candidate[] {
  return [
    { at: r.y, source: 'start' },
    { at: r.y + r.h / 2, source: 'center' },
    { at: r.y + r.h, source: 'end' },
  ];
}

/** Closest static candidate to a moving value, within threshold. */
function closest(
  moving: number[],
  candidates: Candidate[],
  threshold: number,
): { delta: number; guide: Guide } | null {
  let best: { delta: number; guide: Guide } | null = null;
  for (const m of moving) {
    for (const c of candidates) {
      const delta = c.at - m;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, guide: { axis: 'v', at: c.at, source: c.source } };
      }
    }
  }
  return best;
}

/**
 * Alignment guides: compare the moving rect's edges/center against every
 * static rect; snap independently per axis to the closest candidate within
 * threshold. Guides render as hairlines while the snap is active (FR-C2).
 */
export function computeGuides(
  moving: Rect,
  others: Rect[],
  threshold = GUIDE_THRESHOLD_PX,
): GuideResult {
  const result: GuideResult = { dx: 0, dy: 0, guides: [] };

  const vx = closest(
    [moving.x, moving.x + moving.w / 2, moving.x + moving.w],
    others.flatMap(xCandidates),
    threshold,
  );
  if (vx) {
    result.dx = vx.delta;
    result.guides.push({ ...vx.guide, axis: 'v' });
  }

  const hy = closest(
    [moving.y, moving.y + moving.h / 2, moving.y + moving.h],
    others.flatMap(yCandidates),
    threshold,
  );
  if (hy) {
    result.dy = hy.delta;
    result.guides.push({ ...hy.guide, axis: 'h' });
  }
  return result;
}
