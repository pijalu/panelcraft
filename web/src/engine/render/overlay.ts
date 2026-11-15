// SPDX-License-Identifier: GPL-3.0-only
// Overlay primitives (M2-WP4/6): rubber band, alignment guides, link ghost,
// edge halos, resize handle. The canvas controller paints into the renderer's
// overlay layer; all coordinates are canvas-space (the world transform maps
// them to screen). One owner at a time: clearOverlay() between mode switches.

import type { Point, Rect } from './viewport';
import type { Polyline } from './router';
import type { Guide } from './snap';
import type { ResizeCue } from './resize';
import { HINT_GAP, type SizeHint } from './sizeHints';

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

/** CX-01: selected link endpoints; hollow start and filled end are distinct. */
export function drawEndpointHandles(
  overlay: SVGGElement,
  points: Polyline,
  linkId: string,
  labels: { from: string; to: string },
): void {
  const endpoints = [
    { end: 'from', point: points[0] },
    { end: 'to', point: points.at(-1) },
  ] as const;
  for (const endpoint of endpoints) {
    if (!endpoint.point) continue;
    const circle = el('circle') as SVGCircleElement;
    circle.setAttribute('class', 'pc-endpoint');
    circle.setAttribute('data-link', linkId);
    circle.setAttribute('data-end', endpoint.end);
    circle.setAttribute('data-testid', `endpoint-${endpoint.end}`);
    circle.setAttribute('cx', String(endpoint.point.x));
    circle.setAttribute('cy', String(endpoint.point.y));
    circle.setAttribute('r', '5');
    circle.setAttribute('role', 'button');
    circle.setAttribute('aria-label', labels[endpoint.end]);
    overlay.appendChild(circle);
  }
}

/** F-19: draggable handles for a link's explicit waypoints. */
export function drawWaypointHandles(overlay: SVGGElement, points: Polyline, linkId: string): void {
  points.forEach((p, i) => {
    const circle = el('circle') as SVGCircleElement;
    circle.setAttribute('class', 'pc-waypoint');
    circle.setAttribute('data-link', linkId);
    circle.setAttribute('data-wp-index', String(i));
    circle.setAttribute('cx', String(p.x));
    circle.setAttribute('cy', String(p.y));
    circle.setAttribute('r', '5');
    overlay.appendChild(circle);
  });
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

function drawResizeCue(overlay: SVGGElement, cue: ResizeCue): void {
  const { rect } = cue.candidate;
  const width = cue.dimension === 'width';
  const group = el('g') as SVGGElement;
  group.setAttribute('class', `pc-resize-cue pc-resize-cue-${cue.dimension}`);
  group.setAttribute('data-testid', `resize-cue-${cue.dimension}`);
  group.setAttribute('data-match-id', cue.candidate.id);
  group.setAttribute('aria-hidden', 'true');
  const path = el('path') as SVGPathElement;
  path.setAttribute('class', 'pc-resize-cue-line');
  path.setAttribute('d', width
    ? `M ${rect.x} ${rect.y - 12} v 4 M ${rect.x} ${rect.y - 12} h ${rect.w} M ${rect.x + rect.w} ${rect.y - 12} v 4`
    : `M ${rect.x - 12} ${rect.y} h 4 M ${rect.x - 12} ${rect.y} v ${rect.h} M ${rect.x - 12} ${rect.y + rect.h} h 4`);
  group.appendChild(path);
  const label = el('text') as SVGTextElement;
  label.setAttribute('class', 'pc-resize-cue-label');
  label.setAttribute('x', String(width ? rect.x + rect.w / 2 : rect.x - 20));
  label.setAttribute('y', String(width ? rect.y - 20 : rect.y + rect.h / 2));
  if (!width) {
    label.setAttribute('transform', `rotate(-90 ${rect.x - 20} ${rect.y + rect.h / 2})`);
  }
  label.textContent = `${width ? 'W' : 'H'} = ${cue.value}`;
  group.appendChild(label);
  overlay.appendChild(group);
}

/** Resize-only dimension brackets; the canvas owns their ARIA description. */
export function drawResizeCues(overlay: SVGGElement, cues: ResizeCue[]): void {
  for (const cue of cues) drawResizeCue(overlay, cue);
}

/**
 * UX08-WP06: unconditional size badges. The active object's badge sits next to
 * the dragged handle (it changes every frame); the others sit above their own
 * unchanged rect. Same class prefix, so one CSS block styles them all, and the
 * active one is marked separately — it must not be confused with an equal-size
 * match cue, which is a bracket with a leader line.
 */
export function drawSizeHints(
  overlay: SVGGElement,
  hints: SizeHint[],
  active: { handle: ResizeHandle; anchor: Point } | null,
  /** World zoom, so the badges keep a constant *screen* size. */
  zoom = 1,
): void {
  for (const hint of hints) {
    if (hint.active && active === null) continue;
    const at = hint.active && active !== null
      ? active.anchor
      : { x: hint.rect.x + hint.rect.w / 2, y: hint.rect.y - HINT_GAP / zoom };
    drawSizeHint(overlay, hint, at, zoom);
  }
}

function drawSizeHint(overlay: SVGGElement, hint: SizeHint, at: Point, zoom: number): void {
  const s = 1 / (zoom > 0 ? zoom : 1);
  const height = HINT_HEIGHT * s;
  const pad = HINT_PAD * s;
  const group = el('g') as SVGGElement;
  group.setAttribute('class', hint.active ? 'pc-size-hint pc-size-hint-active' : 'pc-size-hint');
  group.setAttribute('data-id', hint.id);
  group.setAttribute('data-testid', hint.active ? 'size-hint-active' : `size-hint-${hint.id}`);
  group.setAttribute('aria-hidden', 'true');
  group.setAttribute('transform', `translate(${at.x} ${at.y})`);
  const w = hint.label.length * HINT_CHAR_WIDTH * s + pad * 2;
  const rect = el('rect') as SVGRectElement;
  rect.setAttribute('class', 'pc-size-hint-bg');
  rect.setAttribute('x', String(-w / 2));
  rect.setAttribute('y', String(-height / 2));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(height));
  rect.setAttribute('rx', String(3 * s));
  group.appendChild(rect);
  const label = el('text') as SVGTextElement;
  label.setAttribute('class', 'pc-size-hint-label');
  label.setAttribute('text-anchor', 'middle');
  label.setAttribute('y', String(height / 2 - 4 * s));
  // Overlay geometry is canvas-space: divide the type size by the zoom so the
  // badge stays the 11 px UI token on screen instead of shrinking with it.
  label.setAttribute('font-size', `${11 * s}px`);
  label.textContent = hint.label;
  group.appendChild(label);
  overlay.appendChild(group);
}

/** Badge metrics in canvas units (a 11 px UI token at 100 % zoom). */
export const HINT_HEIGHT = 16;
export const HINT_PAD = 5;
export const HINT_CHAR_WIDTH = 6.6;
