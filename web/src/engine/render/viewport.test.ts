// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  screenRectToCanvas,
  IDENTITY,
  ZOOM_MIN,
  ZOOM_MAX,
  apply,
  invert,
  applyRect,
  invertRect,
  panBy,
  zoomAt,
  fitRect,
  unionRects,
  clampZoom,
  wheelZoomFactor,
  wheelGesture,
  actionFor,
  PAN_STEP_PX,
  ZOOM_STEP,
} from './viewport';

describe('flow camera coordinate mapping', () => {
  it('subtracts the SVG page offset before applying the world viewport', () => {
    const element = { x: 408, y: 154, w: 120, h: 72 };
    const svgOrigin = { x: 368, y: 114 };
    expect(screenRectToCanvas(element, svgOrigin, IDENTITY)).toEqual({ x: 40, y: 40, w: 120, h: 72 });
  });

  it('maps a panned and zoomed element into canvas coordinates', () => {
    const element = { x: 508, y: 234, w: 240, h: 144 };
    const svgOrigin = { x: 368, y: 114 };
    const viewport = { x: 20, y: -10, k: 2 };
    expect(screenRectToCanvas(element, svgOrigin, viewport)).toEqual({ x: 60, y: 65, w: 120, h: 72 });
  });
});

describe('viewport transforms', () => {
  it('round-trips screen⇄canvas', () => {
    const t = { x: 120, y: -40, k: 1.5 };
    const p = { x: 33, y: 12 };
    expect(invert(t, apply(t, p))).toEqual({ x: 33, y: 12 });
    expect(apply(t, invert(t, { x: 500, y: -17 }))).toEqual({ x: 500, y: -17 });
  });

  it('apply/invert are consistent for rects', () => {
    const t = { x: 10, y: 20, k: 0.5 };
    const r = { x: 8, y: 4, w: 100, h: 50 };
    expect(invertRect(t, applyRect(t, r))).toEqual(r);
  });

  it('identity transform maps 1:1', () => {
    expect(apply(IDENTITY, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
  });

  it('panBy shifts origin', () => {
    expect(panBy({ x: 1, y: 2, k: 1 }, 3, -3)).toEqual({ x: 4, y: -1, k: 1 });
  });
});

describe('zoom clamping (FR-C1 10%–400%)', () => {
  it('clamps to limits', () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('zoomAt keeps anchor point stationary', () => {
    const t = { x: 100, y: 100, k: 1 };
    const anchor = { x: 400, y: 300 };
    const t2 = zoomAt(t, anchor, 2);
    expect(apply(t2, invert(t, anchor))).toEqual(anchor);
    expect(t2.k).toBe(2);
  });

  it('zoomAt clamps and keeps anchor at limit', () => {
    const t = { x: 0, y: 0, k: ZOOM_MAX };
    const anchor = { x: 50, y: 50 };
    const t2 = zoomAt(t, anchor, 10);
    expect(t2.k).toBe(ZOOM_MAX);
  });

  it('wheelZoomFactor: zoom in for negative deltaY, symmetric out', () => {
    const inn = wheelZoomFactor(-100);
    const out = wheelZoomFactor(100);
    expect(inn).toBeGreaterThan(1);
    expect(Math.abs(Math.log2(inn) + Math.log2(out))).toBeLessThan(1e-12);
    expect(wheelZoomFactor(-1000)).toBe(Math.pow(2, 0.1)); // step cap 50
  });

  it('wheelGesture: pinch (ctrl/cmd) zooms, plain wheel pans', () => {
    expect(wheelGesture({ deltaY: -120, deltaX: 0, ctrlKey: true, metaKey: false }).kind).toBe('zoom');
    expect(wheelGesture({ deltaY: -120, deltaX: 0, ctrlKey: false, metaKey: true }).kind).toBe('zoom');
    const pan = wheelGesture({ deltaY: 40, deltaX: 10, ctrlKey: false, metaKey: false });
    expect(pan).toEqual({ kind: 'pan', delta: { dx: -10, dy: -40 } });
  });
});

describe('fitRect + union', () => {
  it('fits rect into viewport with padding, centered', () => {
    const t = fitRect({ x: 0, y: 0, w: 400, h: 200 }, { w: 800, h: 400 }, 40);
    // both axes constrained by height: (400-80)/200 = 1.6? no: (400-80)/400? —
    // vw=720, vh=320 → k=min(720/400, 320/200)=1.6; center maps rect center to view center
    expect(t.k).toBeCloseTo(1.6);
    const center = apply(t, { x: 200, y: 100 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(200);
  });

  it('clamps fit zoom into range for tiny/huge scenes', () => {
    expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 1000, h: 1000 }).k).toBeLessThanOrEqual(ZOOM_MAX);
    const big = fitRect({ x: 0, y: 0, w: 100000, h: 100000 }, { w: 800, h: 600 });
    expect(big.k).toBeGreaterThanOrEqual(ZOOM_MIN);
  });

  it('unionRects covers all, empty → null', () => {
    expect(unionRects([])).toBeNull();
    const u = unionRects([
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 5, w: 10, h: 10 },
    ]);
    expect(u).toEqual({ x: 0, y: 0, w: 30, h: 15 });
  });
});

describe('keyboard map (FR-C1/§10 skeleton)', () => {
  it('maps nav/zoom keys', () => {
    expect(actionFor('ArrowLeft', false)).toBe('pan-left');
    expect(actionFor('=', false)).toBe('zoom-in');
    expect(actionFor('0', false)).toBe('zoom-reset');
    expect(actionFor('g', false)).toBe('grid-toggle');
    expect(actionFor('Delete', false)).toBe('delete');
    expect(actionFor('Escape', false)).toBe('escape');
  });

  it('mod+z undo, mod+shift+z / mod+y redo, plain z unbound', () => {
    expect(actionFor('z', true)).toBe('undo');
    expect(actionFor('Z', true)).toBe('redo');
    expect(actionFor('y', true)).toBe('redo');
    expect(actionFor('z', false)).toBeNull();
    expect(actionFor('q', false)).toBeNull();
  });

  it('exports step constants used by the canvas controller', () => {
    expect(PAN_STEP_PX).toBe(40);
    expect(ZOOM_STEP).toBe(1.2);
  });
});
