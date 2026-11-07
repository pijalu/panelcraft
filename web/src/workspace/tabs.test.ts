// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  initialTabs, openTab, closeTab, activateTab, moveTab, setDirty,
} from './tabs';

describe('tabs', () => {
  it('opens new tabs at the end and activates them; reopening focuses', () => {
    let s = openTab(initialTabs, 'a.pcd');
    s = openTab(s, 'b.pcd');
    expect(s.tabs.map((t) => t.path)).toEqual(['a.pcd', 'b.pcd']);
    expect(s.active).toBe(1);
    s = openTab(s, 'a.pcd');
    expect(s.tabs).toHaveLength(2);
    expect(s.active).toBe(0);
  });

  it('closing the active tab focuses the neighbor; empty strip → -1', () => {
    let s = openTab(openTab(openTab(initialTabs, 'a.pcd'), 'b.pcd'), 'c.pcd');
    s = closeTab(s, 2); // active → clamped to last remaining
    expect(s.active).toBe(1);
    s = closeTab(s, 1);
    expect(s.active).toBe(0);
    s = closeTab(s, 0);
    expect(s.tabs).toHaveLength(0);
    expect(s.active).toBe(-1);
  });

  it('closing a tab left of active shifts focus; right of active keeps it', () => {
    let s = openTab(openTab(openTab(initialTabs, 'a.pcd'), 'b.pcd'), 'c.pcd');
    expect(s.active).toBe(2);
    s = closeTab(s, 0); // close left of active → focus shifts
    expect(s.tabs.map((t) => t.path)).toEqual(['b.pcd', 'c.pcd']);
    expect(s.active).toBe(1); // still c
    s = closeTab(s, 1); // close the active tab → clamp to neighbor
    expect(s.active).toBe(0);
    expect(s.tabs.map((t) => t.path)).toEqual(['b.pcd']);
  });

  it('out-of-range close/activate are no-ops', () => {
    let s = openTab(initialTabs, 'a.pcd');
    const before = s;
    s = closeTab(s, 5);
    s = activateTab(s, -1);
    s = activateTab(s, 9);
    expect(s).toEqual(before);
  });

  it('reorders tabs and keeps the active tab focused', () => {
    let s = openTab(openTab(openTab(initialTabs, 'a.pcd'), 'b.pcd'), 'c.pcd');
    s = activateTab(s, 1); // b
    s = moveTab(s, 1, 0);
    expect(s.tabs.map((t) => t.path)).toEqual(['b.pcd', 'a.pcd', 'c.pcd']);
    expect(s.active).toBe(0);
    s = moveTab(s, 2, 0);
    expect(s.tabs.map((t) => t.path)).toEqual(['c.pcd', 'b.pcd', 'a.pcd']);
    expect(s.active).toBe(1); // still b
    expect(moveTab(s, 0, 0)).toBe(s); // no-op returns same state
  });

  it('tracks dirty flags per path; no-op when unchanged / unknown path', () => {
    let s = openTab(openTab(initialTabs, 'a.pcd'), 'b.pcd');
    s = setDirty(s, 'a.pcd', true);
    expect(s.tabs[0]?.dirty).toBe(true);
    expect(setDirty(s, 'a.pcd', true)).toBe(s);
    expect(setDirty(s, 'ghost.pcd', true)).toBe(s);
    s = setDirty(s, 'a.pcd', false);
    expect(s.tabs[0]?.dirty).toBe(false);
  });
});
