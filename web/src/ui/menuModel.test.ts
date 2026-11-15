// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { clampMenuPosition, edgeIndex, isInside, MENU_MARGIN, rovingIndex } from './menuModel';

describe('menu positioning', () => {
  it('keeps a fitting menu below the trigger', () => {
    const point = clampMenuPosition(
      { left: 20, top: 40 },
      { width: 200, height: 120 },
      { width: 800, height: 600 },
    );
    expect(point).toEqual({ left: 20, top: 40 });
  });

  it('flips above the trigger when there is no room below', () => {
    const point = clampMenuPosition(
      { left: 20, top: 560 },
      { width: 200, height: 120 },
      { width: 800, height: 600 },
    );
    expect(point.top).toBe(440);
  });

  it('clamps both axes inside the viewport margin', () => {
    const point = clampMenuPosition(
      { left: 780, top: -40 },
      { width: 200, height: 100 },
      { width: 800, height: 600 },
    );
    expect(point.left).toBe(800 - 200 - MENU_MARGIN);
    expect(point.top).toBe(MENU_MARGIN);
  });
});

describe('roving focus', () => {
  it('wraps forwards and backwards', () => {
    const enabled = [true, true, true];
    expect(rovingIndex(enabled, 2, 1)).toBe(0);
    expect(rovingIndex(enabled, 0, -1)).toBe(2);
  });

  it('skips disabled entries', () => {
    expect(rovingIndex([true, false, true], 0, 1)).toBe(2);
    expect(rovingIndex([true, false, true], 2, 1)).toBe(0);
  });

  it('returns -1 when nothing is enabled', () => {
    expect(rovingIndex([false, false], 0, 1)).toBe(-1);
    expect(edgeIndex([false, false], 'first')).toBe(-1);
  });

  it('resolves first and last enabled entries', () => {
    expect(edgeIndex([false, true, true], 'first')).toBe(1);
    expect(edgeIndex([true, true, false], 'last')).toBe(1);
  });
});

describe('outside detection', () => {
  it('ignores non-node targets', () => {
    expect(isInside(null, [])).toBe(false);
  });
});
