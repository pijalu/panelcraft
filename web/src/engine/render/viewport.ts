// SPDX-License-Identifier: GPL-3.0-only
// Viewport transform model (M2-WP1, FR-C1): affine pan/zoom between screen
// (CSS px, device pixels of the svg viewBox) and canvas (diagram) space.
// Pure math — no DOM. k = zoom scale; (x, y) = canvas origin in screen px.

export const ZOOM_MIN = 0.1; // 10 %
export const ZOOM_MAX = 4; // 400 %

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export const IDENTITY: Transform = { x: 0, y: 0, k: 1 };

export function clampZoom(k: number): number {
  if (!Number.isFinite(k)) return IDENTITY.k;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

/** canvas → screen */
export function apply(t: Transform, p: Point): Point {
  return { x: t.x + p.x * t.k, y: t.y + p.y * t.k };
}

/** screen → canvas */
export function invert(t: Transform, s: Point): Point {
  return { x: (s.x - t.x) / t.k, y: (s.y - t.y) / t.k };
}

export function applyRect(t: Transform, r: Rect): Rect {
  const a = apply(t, { x: r.x, y: r.y });
  return { x: a.x, y: a.y, w: r.w * t.k, h: r.h * t.k };
}

export function invertRect(t: Transform, r: Rect): Rect {
  const a = invert(t, { x: r.x, y: r.y });
  return { x: a.x, y: a.y, w: r.w / t.k, h: r.h / t.k };
}

/** Pan by screen-space deltas. */
export function panBy(t: Transform, dx: number, dy: number): Transform {
  return { ...t, x: t.x + dx, y: t.y + dy };
}

/** Zoom by `factor` around a fixed screen point (wheel/pinch anchor, FR-C1). */
export function zoomAt(t: Transform, anchor: Point, factor: number): Transform {
  const k = clampZoom(t.k * factor);
  // Keep the canvas point under the anchor stationary: origin' = anchor - c*k'
  // where c = (anchor - origin) / k.
  const cx = (anchor.x - t.x) / t.k;
  const cy = (anchor.y - t.y) / t.k;
  return { x: anchor.x - cx * k, y: anchor.y - cy * k, k };
}

export interface Size {
  w: number;
  h: number;
}

/** Fit a canvas rect into a viewport (screen px) with symmetric padding. */
export function fitRect(r: Rect, view: Size, padding = 32): Transform {
  const vw = Math.max(1, view.w - padding * 2);
  const vh = Math.max(1, view.h - padding * 2);
  const k = clampZoom(Math.min(vw / Math.max(r.w, 1e-6), vh / Math.max(r.h, 1e-6)));
  const x = view.w / 2 - (r.x + r.w / 2) * k;
  const y = view.h / 2 - (r.y + r.h / 2) * k;
  return { x, y, k };
}

/** Union of rects (empty input → null). */
export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Wheel input → zoom factor (FR-C1). Trackpads emit small deltas; mice emit
 * 100-ish steps. Exponential response keeps feel consistent across devices.
 */
export function wheelZoomFactor(deltaY: number): number {
  const step = Math.min(50, Math.abs(deltaY)) * Math.sign(deltaY);
  return Math.pow(2, -step / 500);
}

export interface WheelPanDelta {
  dx: number;
  dy: number;
}

/**
 * Two-finger scroll pans; ctrl/cmd+wheel (pinch gesture) zooms.
 * FR-C1 mapping used by the canvas controller.
 */
export function wheelGesture(e: {
  deltaY: number;
  deltaX: number;
  ctrlKey: boolean;
  metaKey: boolean;
}): { kind: 'zoom'; factor: number } | { kind: 'pan'; delta: WheelPanDelta } {
  if (e.ctrlKey || e.metaKey) return { kind: 'zoom', factor: wheelZoomFactor(e.deltaY) };
  return { kind: 'pan', delta: { dx: -e.deltaX, dy: -e.deltaY } };
}

/**
 * Keyboard map skeleton (FR-C1/§10). Actions are ids resolved by the canvas
 * controller; the map stays data so it can be re-bound later (M7 a11y pass).
 */
export type CanvasAction =
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'fit-selection'
  | 'fit-diagram'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'escape'
  | 'grid-toggle';

export const KEYMAP: Readonly<Record<string, CanvasAction>> = Object.freeze({
  ArrowLeft: 'pan-left',
  ArrowRight: 'pan-right',
  ArrowUp: 'pan-up',
  ArrowDown: 'pan-down',
  '=': 'zoom-in',
  '+': 'zoom-in',
  '-': 'zoom-out',
  '0': 'zoom-reset',
  '1': 'fit-diagram',
  Delete: 'delete',
  Backspace: 'delete',
  Escape: 'escape',
  g: 'grid-toggle',
});

export function actionFor(key: string, mod: boolean): CanvasAction | null {
  if (mod && key === 'z') return 'undo';
  if (mod && key === 'Z') return 'redo';
  if (mod && key === 'y') return 'redo';
  if (mod && key === 'a') return null; // select-all handled by selection layer
  return KEYMAP[key] ?? null;
}

export const PAN_STEP_PX = 40;
export const ZOOM_STEP = 1.2;
