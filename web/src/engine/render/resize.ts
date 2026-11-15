// SPDX-License-Identifier: GPL-3.0-only
// Rect resizing for the eight anchors (F-13; review §3.4 "manual resize").
//
// Pure geometry: the controller feeds pointer positions in canvas units and
// gets back a grid-snapped rect that respects the minimum size. Every kind
// resizes, so the rule cannot live in a per-kind table.

import { snapToGrid } from './snap';
import type { Point, Rect } from './viewport';
import type { ResizeHandle } from './overlay';

export const MIN_SIZE = { w: 48, h: 32 };

const movesLeft = (h: ResizeHandle): boolean => h === 'nw' || h === 'w' || h === 'sw';
const movesRight = (h: ResizeHandle): boolean => h === 'ne' || h === 'e' || h === 'se';
const movesTop = (h: ResizeHandle): boolean => h === 'nw' || h === 'n' || h === 'ne';
const movesBottom = (h: ResizeHandle): boolean => h === 'sw' || h === 's' || h === 'se';

/**
 * Rect after dragging `handle` of `before` to `pointer` (canvas units).
 * Edges that the handle does not own stay put; the dragged edges snap to the
 * grid and stop at the minimum size (no flipping through zero).
 */
export function resizedRect(
  before: Rect,
  handle: ResizeHandle,
  pointer: Point,
  snap = true,
): Rect {
  // UX08-WP05: snapping is a user preference; without it the dragged edge
  // follows the pointer exactly (the minimum size still applies).
  const edge = (v: number): number => (snap ? snapToGrid(v) : v);
  let left = before.x;
  let top = before.y;
  let right = before.x + before.w;
  let bottom = before.y + before.h;

  if (movesLeft(handle)) left = Math.min(edge(pointer.x), right - MIN_SIZE.w);
  if (movesRight(handle)) right = Math.max(edge(pointer.x), left + MIN_SIZE.w);
  if (movesTop(handle)) top = Math.min(edge(pointer.y), bottom - MIN_SIZE.h);
  if (movesBottom(handle)) bottom = Math.max(edge(pointer.y), top + MIN_SIZE.h);

  return { x: left, y: top, w: right - left, h: bottom - top };
}

export const RESIZE_MATCH_THRESHOLD_PX = 4;

export interface ResizeCandidate {
  id: string;
  label?: string;
  rect: Rect;
}

export interface ResizeCue {
  dimension: 'width' | 'height';
  value: number;
  candidate: ResizeCandidate;
}

export interface ResizeCueResult {
  rect: Rect;
  cues: ResizeCue[];
}

function closerDimension(
  next: ResizeCue & { distance: number },
  best: (ResizeCue & { distance: number }) | null,
): boolean {
  if (best === null) return true;
  if (next.distance !== best.distance) return next.distance < best.distance;
  if (next.value !== best.value) return next.value < best.value;
  return next.candidate.id < best.candidate.id;
}

function nearestDimension(
  current: number,
  dimension: ResizeCue['dimension'],
  candidates: ResizeCandidate[],
  threshold: number,
): ResizeCue | null {
  let best: (ResizeCue & { distance: number }) | null = null;
  for (const candidate of candidates) {
    const value = dimension === 'width' ? candidate.rect.w : candidate.rect.h;
    const minimum = dimension === 'width' ? MIN_SIZE.w : MIN_SIZE.h;
    const distance = Math.abs(value - current);
    if (!Number.isFinite(value) || value < minimum || distance > threshold) continue;
    const next = { dimension, value, candidate, distance };
    if (closerDimension(next, best)) best = next;
  }
  return best;
}

/**
 * Grid-first resize with transient equal-size snapping. The nearest candidate
 * within 4 canvas units wins; exact ties prefer the smaller dimension, then
 * lexical id. Only edges owned by the active handle move.
 */
export function resizedRectWithCues(
  before: Rect,
  handle: ResizeHandle,
  pointer: Point,
  candidates: ResizeCandidate[],
  threshold = RESIZE_MATCH_THRESHOLD_PX,
  snap = true,
): ResizeCueResult {
  const rect = resizedRect(before, handle, pointer, snap);
  const cues: ResizeCue[] = [];
  if (movesLeft(handle) || movesRight(handle)) {
    const match = nearestDimension(rect.w, 'width', candidates, threshold);
    if (match) {
      cues.push(match);
      if (movesLeft(handle)) rect.x = before.x + before.w - match.value;
      rect.w = match.value;
    }
  }
  if (movesTop(handle) || movesBottom(handle)) {
    const match = nearestDimension(rect.h, 'height', candidates, threshold);
    if (match) {
      cues.push(match);
      if (movesTop(handle)) rect.y = before.y + before.h - match.value;
      rect.h = match.value;
    }
  }
  return { rect, cues };
}
