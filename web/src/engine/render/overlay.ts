// SPDX-License-Identifier: GPL-3.0-only
// Overlay primitives (M2-WP4/6): rubber band, alignment guides, link ghost,
// edge halos, resize handle. The canvas controller paints into the renderer's
// overlay layer; all coordinates are canvas-space (the world transform maps
// them to screen). One owner at a time: clearOverlay() between mode switches.

import type { Point, Rect } from './viewport';
import type { Guide } from './snap';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag: string): SVGElement {
  return document.createElementNS(SVG_NS, tag) as unknown as SVGElement;
}

export function clearOverlay(overlay: SVGGElement): void {
  overlay.textContent = '';
}

export function drawRubberBand(overlay: SVGGElement, r: Rect): SVGRectElement {
  const rect = el('rect') as SVGRectElement;
  rect.setAttribute('class', 'pc-rubber');
  rect.setAttribute('x', String(r.x));
  rect.setAttribute('y', String(r.y));
  rect.setAttribute('width', String(r.w));
  rect.setAttribute('height', String(r.h));
  overlay.appendChild(rect);
  return rect;
}

export function drawGuides(overlay: SVGGElement, guides: Guide[], extent = 100000): void {
  for (const g of guides) {
    const line = el('line') as SVGLineElement;
    line.setAttribute('class', 'pc-guide');
    if (g.axis === 'v') {
      line.setAttribute('x1', String(g.at));
      line.setAttribute('y1', String(-extent));
      line.setAttribute('x2', String(g.at));
      line.setAttribute('y2', String(extent));
    } else {
      line.setAttribute('x1', String(-extent));
      line.setAttribute('y1', String(g.at));
      line.setAttribute('x2', String(extent));
      line.setAttribute('y2', String(g.at));
    }
    overlay.appendChild(line);
  }
}

export function drawGhostLink(overlay: SVGGElement, from: Point, to: Point): SVGPathElement {
  const path = el('path') as SVGPathElement;
  path.setAttribute('class', 'pc-ghost');
  path.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
  overlay.appendChild(path);
  return path;
}

export const HALO_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type HaloSide = (typeof HALO_SIDES)[number];

/** Edge-midpoint halo handles on a rect (link drag sources, FR-C7). */
export function drawHalos(overlay: SVGGElement, r: Rect, id: string): void {
  const centers: Record<HaloSide, Point> = {
    top: { x: r.x + r.w / 2, y: r.y },
    right: { x: r.x + r.w, y: r.y + r.h / 2 },
    bottom: { x: r.x + r.w / 2, y: r.y + r.h },
    left: { x: r.x, y: r.y + r.h / 2 },
  };
  for (const side of HALO_SIDES) {
    const c = centers[side];
    const circle = el('circle') as SVGCircleElement;
    circle.setAttribute('class', 'pc-halo');
    circle.setAttribute('data-id', id);
    circle.setAttribute('data-side', side);
    circle.setAttribute('cx', String(c.x));
    circle.setAttribute('cy', String(c.y));
    circle.setAttribute('r', '5');
    overlay.appendChild(circle);
  }
}

/** The eight resize anchors (F-13: every kind resizes, not just groups). */
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

/**
 * Anchors sit just OUTSIDE the rect: the link halos are on the edges, so an
 * on-border handle would swallow the halo click (S1 regression). 8 px keeps
 * both targets ≥3 px apart while staying visually attached to the shape.
 */
export const HANDLE_OFFSET = 8;

/** Anchor point of one handle in canvas space (offset outside the rect). */
export function handlePoint(r: Rect, handle: ResizeHandle): Point {
  const left = r.x - HANDLE_OFFSET;
  const right = r.x + r.w + HANDLE_OFFSET;
  const top = r.y - HANDLE_OFFSET;
  const bottom = r.y + r.h + HANDLE_OFFSET;
  const midX = r.x + r.w / 2;
  const midY = r.y + r.h / 2;
  switch (handle) {
    case 'nw': return { x: left, y: top };
    case 'n': return { x: midX, y: top };
    case 'ne': return { x: right, y: top };
    case 'e': return { x: right, y: midY };
    case 'se': return { x: right, y: bottom };
    case 's': return { x: midX, y: bottom };
    case 'sw': return { x: left, y: bottom };
    case 'w': return { x: left, y: midY };
  }
}

/** Draw the eight resize handles of `r` (one undo per drag; controller-owned). */
export function drawResizeHandle(overlay: SVGGElement, r: Rect, id: string): void {
  for (const handle of RESIZE_HANDLES) {
    const p = handlePoint(r, handle);
    const rect = el('rect') as SVGRectElement;
    rect.setAttribute('class', 'pc-resize-handle');
    rect.setAttribute('data-id', id);
    rect.setAttribute('data-handle', handle);
    rect.setAttribute('x', String(p.x - 4));
    rect.setAttribute('y', String(p.y - 4));
    rect.setAttribute('width', '8');
    rect.setAttribute('height', '8');
    overlay.appendChild(rect);
  }
}
