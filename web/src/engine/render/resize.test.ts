// SPDX-License-Identifier: GPL-3.0-only
// F-13 eight-handle resize geometry (review §3.4): edges the handle does not
// own stay put, dragged edges snap to the grid and stop at the minimum size.

import { describe, expect, it } from 'vitest';
import {
  MIN_SIZE,
  RESIZE_MATCH_THRESHOLD_PX,
  resizedRect,
  resizedRectWithCues,
  type ResizeCandidate,
} from './resize';
import { handlePoint } from './overlay';
import { GRID_SIZE } from './snap';

const base = { x: 96, y: 96, w: 160, h: 64 };

describe('resizedRect (F-13)', () => {
  it('se-anchor moves only the far edges', () => {
    const r = resizedRect(base, 'se', { x: 304, y: 200 });
    expect(r).toEqual({ x: 96, y: 96, w: 208, h: 104 });
  });

  it('nw-anchor moves the near edges and keeps the far corner', () => {
    const r = resizedRect(base, 'nw', { x: 64, y: 40 });
    expect(r).toEqual({ x: 64, y: 40, w: 192, h: 120 });
  });

  it('e-anchor leaves y and h untouched', () => {
    const r = resizedRect(base, 'e', { x: 400, y: 999 });
    expect(r.y).toBe(base.y);
    expect(r.h).toBe(base.h);
    expect(r.w).toBe(304); // 400 snapped to the 8 px grid − 96
  });

  it('n-anchor leaves x and w untouched', () => {
    const r = resizedRect(base, 'n', { x: 999, y: 64 });
    expect(r.x).toBe(base.x);
    expect(r.w).toBe(base.w);
    expect(r.h).toBe(96); // 96 + 64 − 64
  });

  it('refuses to shrink below the minimum size', () => {
    const r = resizedRect(base, 'se', { x: 0, y: 0 });
    expect(r.w).toBe(MIN_SIZE.w);
    expect(r.h).toBe(MIN_SIZE.h);
    const nw = resizedRect(base, 'nw', { x: 1000, y: 1000 });
    expect(nw.w).toBe(MIN_SIZE.w);
    expect(nw.h).toBe(MIN_SIZE.h);
  });

  it('snaps the dragged edge to the grid', () => {
    const r = resizedRect(base, 'se', { x: 300 + GRID_SIZE / 2, y: 200 + GRID_SIZE / 2 });
    expect(r.x % GRID_SIZE).toBe(0);
    expect(r.y % GRID_SIZE).toBe(0);
    expect(r.w % GRID_SIZE).toBe(0);
    expect(r.h % GRID_SIZE).toBe(0);
  });

  it('w-anchor keeps the right edge fixed', () => {
    const r = resizedRect(base, 'w', { x: 144, y: 0 });
    expect(r.x + r.w).toBe(base.x + base.w);
  });
});

describe('UX-06 equal-size resize cues', () => {
  const before = { x: 100, y: 100, w: 120, h: 60 };
  const candidate = (id: string, w: number, h: number): ResizeCandidate => ({
    id,
    label: id.toUpperCase(),
    rect: { x: 400, y: 300, w, h },
  });

  it('snaps and cues width only for a horizontal handle', () => {
    const result = resizedRectWithCues(before, 'e', { x: 296, y: 0 }, [candidate('wide', 200, 100)]);
    expect(result.rect).toEqual({ x: 100, y: 100, w: 200, h: 60 });
    expect(result.cues.map((cue) => cue.dimension)).toEqual(['width']);
  });

  it('snaps and cues height only for a vertical handle', () => {
    const result = resizedRectWithCues(before, 's', { x: 0, y: 196 }, [candidate('tall', 200, 100)]);
    expect(result.rect).toEqual({ x: 100, y: 100, w: 120, h: 100 });
    expect(result.cues.map((cue) => cue.dimension)).toEqual(['height']);
  });

  it('cues both dimensions and keeps the opposite corner fixed', () => {
    const result = resizedRectWithCues(before, 'nw', { x: 20, y: 60 }, [candidate('both', 200, 100)]);
    expect(result.rect).toEqual({ x: 20, y: 60, w: 200, h: 100 });
    expect(result.rect.x + result.rect.w).toBe(before.x + before.w);
    expect(result.rect.y + result.rect.h).toBe(before.y + before.h);
    expect(result.cues.map((cue) => cue.dimension)).toEqual(['width', 'height']);
  });

  it('chooses the nearest candidate independently for each dimension', () => {
    const result = resizedRectWithCues(before, 'se', { x: 296, y: 192 }, [
      candidate('far', 200, 96),
      candidate('near', 198, 94),
    ]);
    expect(result.rect.w).toBe(198);
    expect(result.rect.h).toBe(94);
    expect(result.cues.map((cue) => cue.candidate.id)).toEqual(['near', 'near']);
  });

  it('uses smaller dimensions then lexical ids for deterministic ties', () => {
    const result = resizedRectWithCues(before, 'se', { x: 300, y: 200 }, [
      candidate('z', 208, 104),
      candidate('a', 200, 96),
      candidate('b', 200, 96),
    ]);
    expect(result.rect.w).toBe(200);
    expect(result.rect.h).toBe(96);
    expect(result.cues.map((cue) => cue.candidate.id)).toEqual(['a', 'a']);
  });

  it('honors the inclusive threshold and returns no match beyond it', () => {
    const at = resizedRectWithCues(before, 'e', { x: 300, y: 0 }, [
      candidate('edge', 204 + RESIZE_MATCH_THRESHOLD_PX, 100),
    ]);
    expect(at.rect.w).toBe(208);
    expect(at.cues).toHaveLength(1);
    const beyond = resizedRectWithCues(before, 'e', { x: 300, y: 0 }, [
      candidate('outside', 204 + RESIZE_MATCH_THRESHOLD_PX + 0.1, 100),
    ]);
    expect(beyond.rect).toEqual(resizedRect(before, 'e', { x: 300, y: 0 }));
    expect(beyond.cues).toEqual([]);
  });

  it.each([
    ['nw', { x: 20, y: 60 }, { x: 20, y: 60, w: 200, h: 100 }, ['width', 'height']],
    ['n', { x: 0, y: 60 }, { x: 100, y: 60, w: 120, h: 100 }, ['height']],
    ['ne', { x: 300, y: 60 }, { x: 100, y: 60, w: 200, h: 100 }, ['width', 'height']],
    ['e', { x: 300, y: 0 }, { x: 100, y: 100, w: 200, h: 60 }, ['width']],
    ['se', { x: 300, y: 200 }, { x: 100, y: 100, w: 200, h: 100 }, ['width', 'height']],
    ['s', { x: 0, y: 200 }, { x: 100, y: 100, w: 120, h: 100 }, ['height']],
    ['sw', { x: 20, y: 200 }, { x: 20, y: 100, w: 200, h: 100 }, ['width', 'height']],
    ['w', { x: 20, y: 0 }, { x: 20, y: 100, w: 200, h: 60 }, ['width']],
  ] as const)('%s handle preserves unowned edges', (handle, pointer, expected, dimensions) => {
    const result = resizedRectWithCues(before, handle, pointer, [candidate('match', 200, 100)]);
    expect(result.rect).toEqual(expected);
    expect(result.cues.map((cue) => cue.dimension)).toEqual(dimensions);
  });

  it('never snaps below minimum size but can match the minimum exactly', () => {
    const tooSmall = resizedRectWithCues(before, 'se', { x: 0, y: 0 }, [candidate('small', 40, 24)]);
    expect(tooSmall.rect).toMatchObject(MIN_SIZE);
    expect(tooSmall.cues).toEqual([]);
    const minimum = resizedRectWithCues(before, 'se', { x: 0, y: 0 }, [
      candidate('minimum', MIN_SIZE.w, MIN_SIZE.h),
    ]);
    expect(minimum.rect).toMatchObject(MIN_SIZE);
    expect(minimum.cues).toHaveLength(2);
  });
});

describe('handlePoint', () => {
  it('computes all eight anchors, offset outside the rect', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    // anchors sit HANDLE_OFFSET outside so they never cover a link halo
    expect(handlePoint(r, 'nw')).toEqual({ x: -8, y: -8 });
    expect(handlePoint(r, 'n')).toEqual({ x: 50, y: -8 });
    expect(handlePoint(r, 'ne')).toEqual({ x: 108, y: -8 });
    expect(handlePoint(r, 'e')).toEqual({ x: 108, y: 25 });
    expect(handlePoint(r, 'se')).toEqual({ x: 108, y: 58 });
    expect(handlePoint(r, 's')).toEqual({ x: 50, y: 58 });
    expect(handlePoint(r, 'sw')).toEqual({ x: -8, y: 58 });
    expect(handlePoint(r, 'w')).toEqual({ x: -8, y: 25 });
  });

  it('leaves the edge-midpoint halos clickable (≥3 px clearance)', () => {
    const r = { x: 0, y: 0, w: 100, h: 50 };
    const haloRadius = 5;
    const handleRadius = 4;
    // halo 'right' is at (100, 25); the 'e' handle must not cover it
    const gap = handlePoint(r, 'e').x - (r.x + r.w) - haloRadius - handleRadius;
    expect(gap).toBeGreaterThanOrEqual(-1);
  });
});
