// SPDX-License-Identifier: GPL-3.0-only
// M3-WP1 editor tab strip state — pure reducers (API freeze).
export interface Tab {
  path: string;
  dirty: boolean;
}

export interface TabsState {
  tabs: Tab[];
  /** Index into tabs, or -1 when empty. */
  active: number;
}

export const initialTabs: TabsState = { tabs: [], active: -1 };

export function openTab(s: TabsState, path: string): TabsState {
  const idx = s.tabs.findIndex((t) => t.path === path);
  if (idx !== -1) return { ...s, active: idx };
  return { tabs: [...s.tabs, { path, dirty: false }], active: s.tabs.length };
}

export function closeTab(s: TabsState, index: number): TabsState {
  if (index < 0 || index >= s.tabs.length) return s;
  const tabs = s.tabs.filter((_, i) => i !== index);
  let active = s.active;
  if (active === index) {
    active = tabs.length === 0 ? -1 : Math.min(index, tabs.length - 1);
  } else if (active > index) {
    active -= 1;
  }
  return { tabs, active };
}

export function activateTab(s: TabsState, index: number): TabsState {
  if (index < 0 || index >= s.tabs.length) return s;
  return { ...s, active: index };
}

/** Reorder a tab (drag & drop); no-op when indices are out of range. */
export function moveTab(s: TabsState, from: number, to: number): TabsState {
  if (from === to) return s;
  if (from < 0 || from >= s.tabs.length) return s;
  if (to < 0 || to >= s.tabs.length) return s;
  const tabs = [...s.tabs];
  const moved = tabs.splice(from, 1)[0];
  if (!moved) return s;
  tabs.splice(to, 0, moved);
  const activePath = s.tabs[s.active]?.path;
  return { tabs, active: activePath ? tabs.findIndex((t) => t.path === activePath) : s.active };
}

export function setDirty(s: TabsState, path: string, dirty: boolean): TabsState {
  const idx = s.tabs.findIndex((t) => t.path === path);
  const cur = idx === -1 ? undefined : s.tabs[idx];
  if (!cur || cur.dirty === dirty) return s;
  const tabs = s.tabs.map((t, i) => (i === idx ? { ...t, dirty } : t));
  return { tabs, active: s.active };
}
