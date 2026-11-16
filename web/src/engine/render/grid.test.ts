// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP05: the two grid preferences are independent and survive a reload.
// These tests also pin the migration contract: a profile that never chose a grid
// gets the visible default, while an explicit choice (including `off`) is kept.
import { describe, expect, it } from 'vitest';
import {
  defaultGrid,
  gridVisible,
  GRID_TYPES,
  GRID_VERSION,
  normaliseGrid,
  setGridSnap,
  setGridType,
  toggleGridVisibility,
} from './grid';

describe('canvas grid settings', () => {
  it('defaults to a subtle visible dots grid with snapping on', () => {
    const grid = defaultGrid();
    expect(grid.type).toBe('dots');
    expect(grid.snap).toBe(true);
    expect(gridVisible(grid)).toBe(true);
    expect(grid.version).toBe(GRID_VERSION);
  });

  it('offers exactly the three visible states', () => {
    expect(GRID_TYPES).toEqual(['off', 'dots', 'lines']);
  });

  it('treats a missing or corrupt record as "never chose" and uses the default', () => {
    for (const stored of [undefined, null, 42, 'lines', {}, { type: 'plaid' }, { snap: 'yes' }]) {
      const grid = normaliseGrid(stored);
      expect(grid.type).toBe('dots');
      expect(grid.snap).toBe(true);
    }
  });

  it('keeps an explicit saved choice, including off, when migrating a v1 record', () => {
    // A record only exists once the user changed something, so a present type is
    // a choice: the new default must not overwrite it.
    for (const type of ['off', 'dots', 'lines'] as const) {
      const grid = normaliseGrid({ version: 1, type, snap: true, last: 'dots' });
      expect(grid.type).toBe(type);
      expect(grid.version).toBe(GRID_VERSION);
      expect(gridVisible(grid)).toBe(type !== 'off');
    }
    // Snapping alone was changed in v1: the untouched type keeps the v1
    // behaviour of the stored value, and snapping stays off.
    expect(normaliseGrid({ version: 1, type: 'off', snap: false })).toMatchObject({
      type: 'off',
      snap: false,
      version: GRID_VERSION,
    });
  });

  it('keeps snapping while the grid is hidden', () => {
    const lines = setGridType(defaultGrid(), 'lines');
    const off = setGridType(lines, 'off');
    expect(off.snap).toBe(true);
    expect(off.last).toBe('lines');
  });

  it('does not couple visibility and snapping in either direction', () => {
    const withGrid = setGridType(defaultGrid(), 'lines');
    expect(setGridSnap(withGrid, false)).toMatchObject({ type: 'lines', snap: false });
    const unsnapped = setGridSnap(defaultGrid(), false);
    expect(setGridType(unsnapped, 'dots')).toMatchObject({ type: 'dots', snap: false });
  });

  it('restores the last visible type when toggled back on', () => {
    let grid = setGridType(defaultGrid(), 'lines');
    grid = toggleGridVisibility(grid);
    expect(grid.type).toBe('off');
    grid = toggleGridVisibility(grid);
    expect(grid.type).toBe('lines');
  });

  it('remembers a non-off type even when the stored type is off', () => {
    expect(normaliseGrid({ type: 'off', last: 'lines', snap: true })).toMatchObject({
      type: 'off',
      last: 'lines',
    });
    expect(normaliseGrid({ type: 'dots', last: 'off', snap: true })).toMatchObject({
      type: 'dots',
      last: 'dots',
    });
  });
});
