// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP05: the two grid preferences are independent and survive a reload.
// These tests also pin the migration contract: a document written before the
// setting existed keeps snapping and shows no grid.
import { describe, expect, it } from 'vitest';
import {
  defaultGrid,
  gridVisible,
  GRID_TYPES,
  normaliseGrid,
  setGridSnap,
  setGridType,
  toggleGridVisibility,
} from './grid';

describe('canvas grid settings', () => {
  it('defaults to no grid and snapping on', () => {
    const grid = defaultGrid();
    expect(grid.type).toBe('off');
    expect(grid.snap).toBe(true);
    expect(gridVisible(grid)).toBe(false);
  });

  it('offers exactly the three visible states', () => {
    expect(GRID_TYPES).toEqual(['off', 'dots', 'lines']);
  });

  it('migrates a missing or corrupt record to the safe default', () => {
    for (const stored of [undefined, null, 42, 'lines', {}, { type: 'plaid' }, { snap: 'yes' }]) {
      const grid = normaliseGrid(stored);
      expect(grid.type).toBe('off');
      expect(grid.snap).toBe(true);
    }
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
