// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  availableMenuHeight,
  clampMenuPosition,
  edgeIndex,
  isInside,
  MENU_MARGIN,
  needsScroll,
  placeMenu,
  placeSubmenu,
  rovingIndex,
} from './menuModel';

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

describe('submenu placement', () => {
  const size = { width: 180, height: 200 };

  it('opens to the right of its row when there is room', () => {
    const placed = placeSubmenu({ left: 40, top: 100, right: 260, bottom: 128 }, size, {
      width: 1000,
      height: 700,
    });
    expect(placed.side).toBe('right');
    expect(placed.left).toBe(262);
  });

  it('flips to the left instead of leaving the viewport', () => {
    // Row near the right edge: a fixed `left: 100%` layout put the submenu off-screen.
    const placed = placeSubmenu({ left: 700, top: 100, right: 900, bottom: 128 }, size, {
      width: 920,
      height: 700,
    });
    expect(placed.side).toBe('left');
    expect(placed.left).toBe(700 - 180 - 2);
    expect(placed.left + size.width).toBeLessThanOrEqual(920 - MENU_MARGIN);
  });

  it('clamps vertically at both edges', () => {
    const nearBottom = placeSubmenu({ left: 40, top: 690, right: 260, bottom: 718 }, size, {
      width: 1000,
      height: 720,
    });
    expect(nearBottom.top).toBe(720 - 200 - MENU_MARGIN);
    const nearTop = placeSubmenu({ left: 40, top: 0, right: 260, bottom: 28 }, size, {
      width: 1000,
      height: 720,
    });
    expect(nearTop.top).toBe(MENU_MARGIN);
  });

  it('clamps a menu wider than the remaining room inside the margin', () => {
    const placed = placeSubmenu({ left: 10, top: 40, right: 30, bottom: 68 }, { width: 900, height: 100 }, {
      width: 600,
      height: 400,
    });
    expect(placed.left).toBe(MENU_MARGIN);
  });
});

describe('trigger placement', () => {
  const trigger = { left: 16, top: 8, right: 56, bottom: 40 };

  it('opens below the trigger when the menu fits there', () => {
    const placed = placeMenu(trigger, { width: 240, height: 300 }, { width: 1000, height: 700 });
    expect(placed.side).toBe('below');
    expect(placed.top).toBe(42);
    expect(placed.maxHeight).toBeGreaterThanOrEqual(300);
  });

  it('shrinks and scrolls instead of covering its trigger on a short viewport', () => {
    // 420 px tall window: a 380 px menu cannot fit below the top-left trigger.
    const placed = placeMenu(trigger, { width: 240, height: 380 }, { width: 1000, height: 420 });
    expect(placed.top).toBeGreaterThanOrEqual(trigger.bottom);
    expect(placed.maxHeight).toBeLessThan(380);
    // The surface still ends inside the viewport.
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(420 - MENU_MARGIN + 1);
  });

  it('flips above a trigger near the bottom without overlapping it', () => {
    const low = { left: 40, top: 620, right: 120, bottom: 660 };
    const placed = placeMenu(low, { width: 240, height: 200 }, { width: 1000, height: 700 });
    expect(placed.side).toBe('above');
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(low.top);
  });
});

describe('available height', () => {
  it('takes the larger of the space below and above the surface', () => {
    expect(availableMenuHeight(100, { width: 800, height: 600 })).toBe(600 - 100 - MENU_MARGIN * 2);
    expect(availableMenuHeight(520, { width: 800, height: 600 })).toBe(520 - MENU_MARGIN * 2);
  });

  it('reports when a list has to scroll internally', () => {
    expect(needsScroll(320, 200)).toBe(true);
    expect(needsScroll(200, 200)).toBe(false);
    expect(needsScroll(201, 200)).toBe(false);
    expect(needsScroll(203, 200)).toBe(true);
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
