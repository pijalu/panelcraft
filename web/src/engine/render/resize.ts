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
export function resizedRect(before: Rect, handle: ResizeHandle, pointer: Point): Rect {
  let left = before.x;
  let top = before.y;
  let right = before.x + before.w;
  let bottom = before.y + before.h;

  if (movesLeft(handle)) left = Math.min(snapToGrid(pointer.x), right - MIN_SIZE.w);
  if (movesRight(handle)) right = Math.max(snapToGrid(pointer.x), left + MIN_SIZE.w);
  if (movesTop(handle)) top = Math.min(snapToGrid(pointer.y), bottom - MIN_SIZE.h);
  if (movesBottom(handle)) bottom = Math.max(snapToGrid(pointer.y), top + MIN_SIZE.h);

  return { x: left, y: top, w: right - left, h: bottom - top };
}
