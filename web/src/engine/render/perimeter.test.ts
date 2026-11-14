// SPDX-License-Identifier: GPL-3.0-only
// CX-01 normalized side-quarter endpoint anchors and pointer projection.

import { describe, expect, it } from 'vitest';
import { perimeterPoint, projectPerimeter } from './perimeter';

const RECT = { x: 100, y: 200, w: 200, h: 100 };

describe('normalized entity perimeter anchors (CX-01)', () => {
  it.each([
    [0, { x: 100, y: 200 }],
    [0.125, { x: 200, y: 200 }],
    [0.25, { x: 300, y: 200 }],
    [0.375, { x: 300, y: 250 }],
    [0.5, { x: 300, y: 300 }],
    [0.625, { x: 200, y: 300 }],
    [0.75, { x: 100, y: 300 }],
    [0.875, { x: 100, y: 250 }],
  ])('resolves side-quarter parameter %s', (t, point) => {
    expect(perimeterPoint(RECT, t)).toEqual(point);
  });

  it('preserves side and fractional side position after resize', () => {
    expect(perimeterPoint({ x: 0, y: 0, w: 400, h: 40 }, 0.125)).toEqual({ x: 200, y: 0 });
    expect(perimeterPoint({ x: 0, y: 0, w: 400, h: 40 }, 0.375)).toEqual({ x: 400, y: 20 });
  });

  it.each([
    [{ x: 180, y: 150 }, 0.1, { x: 180, y: 200 }],
    [{ x: 340, y: 240 }, 0.35, { x: 300, y: 240 }],
    [{ x: 160, y: 350 }, 0.675, { x: 160, y: 300 }],
    [{ x: 40, y: 260 }, 0.85, { x: 100, y: 260 }],
  ])('projects any pointer onto the nearest side', (pointer, t, point) => {
    const result = projectPerimeter(RECT, pointer);
    expect(result.t).toBeCloseTo(t, 10);
    expect(result.point).toEqual(point);
  });

  it('clamps side fractions to corners and breaks inside ties from the top', () => {
    expect(projectPerimeter(RECT, { x: 400, y: 100 })).toEqual({ t: 0.25, point: { x: 300, y: 200 } });
    expect(projectPerimeter(RECT, { x: 200, y: 250 })).toEqual({ t: 0.125, point: { x: 200, y: 200 } });
  });
});
