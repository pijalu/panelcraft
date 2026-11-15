// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP06: unconditional resize size hints. A resize used to describe only a
// size that matched another object, so a free drag left the user guessing — the
// current W × H lived in a distant properties field. This module is the pure
// model: which objects get a hint, what it says and where it sits. The canvas
// controller owns the overlay painting; nothing here reaches the document.

import type { Point, Rect } from './viewport';
import type { ResizeHandle } from './overlay';

/** One object that takes part in the resize interaction. */
export interface SizeTarget {
  id: string;
  rect: Rect;
}

/** A hint to draw: the active object's live size or a peer's unchanged size. */
export interface SizeHint {
  id: string;
  rect: Rect;
  /** Shared `W × H` text (see `sizeText`). */
  label: string;
  /** The object being dragged — it also carries the equal-size match cues. */
  active: boolean;
}

/**
 * The one `W × H` format of the application (the properties panel shows the
 * same string), rounded to whole canvas units.
 */
export function sizeText(rect: { w: number; h: number }): string {
  return `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
}

/**
 * Hints for a drag: the active object first (its live rect), then every other
 * selected object with its unchanged rect. Deduplicated by id, because the
 * active object is usually also part of the selection.
 */
export function sizeHints(active: SizeTarget, others: SizeTarget[]): SizeHint[] {
  const hints: SizeHint[] = [
    { id: active.id, rect: active.rect, label: sizeText(active.rect), active: true },
  ];
  const seen = new Set([active.id]);
  for (const other of others) {
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    hints.push({ id: other.id, rect: other.rect, label: sizeText(other.rect), active: false });
  }
  return hints;
}

/** How far outside the shape a hint sits, in canvas units. */
export const HINT_GAP = 12;

const movesLeft = (h: ResizeHandle): boolean => h === 'nw' || h === 'w' || h === 'sw';
const movesRight = (h: ResizeHandle): boolean => h === 'ne' || h === 'e' || h === 'se';
const movesTop = (h: ResizeHandle): boolean => h === 'nw' || h === 'n' || h === 'ne';
const movesBottom = (h: ResizeHandle): boolean => h === 'sw' || h === 's' || h === 'se';

/**
 * Where the active hint belongs: just outside the edge or corner the user is
 * dragging, so the feedback follows the pointer instead of staying at the
 * top-left corner. `gap` grows the offset when a badge must clear a handle.
 */
export function hintAnchor(rect: Rect, handle: ResizeHandle, gap = HINT_GAP): Point {
  const midX = rect.x + rect.w / 2;
  const midY = rect.y + rect.h / 2;
  const x = movesLeft(handle) ? rect.x - gap : movesRight(handle) ? rect.x + rect.w + gap : midX;
  const y = movesTop(handle) ? rect.y - gap : movesBottom(handle) ? rect.y + rect.h + gap : midY;
  return { x, y };
}

/** Keep a point inside `view` with a margin, so a badge never leaves the canvas. */
export function clampToView(point: Point, view: Rect, margin = 0): Point {
  const minX = view.x + margin;
  const maxX = view.x + view.w - margin;
  const minY = view.y + margin;
  const maxY = view.y + view.h - margin;
  return {
    x: Math.min(Math.max(point.x, minX), maxX),
    y: Math.min(Math.max(point.y, minY), maxY),
  };
}
