// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from './Menu';
import { buildAppMenu, type AppMenuActions, type AppMenuContext } from './appMenuEntries';
import { closePanel, defaultLayout, type PanelId } from './uiLayout';

function actions(): AppMenuActions {
  return {
    importFiles: vi.fn(),
    importZip: vi.fn(),
    exportCurrent: vi.fn(),
    exportWorkspaceZip: vi.fn(),
    openPanel: vi.fn(),
    resetLayout: vi.fn(),
    setTheme: vi.fn(),
    history: vi.fn(),
    present: vi.fn(),
    snapshots: vi.fn(),
    clearData: vi.fn(),
    setPrivate: vi.fn(),
  };
}

function context(overrides: Partial<AppMenuContext> = {}): AppMenuContext {
  return {
    activePath: 'main.pcd',
    theme: 'system',
    privateMode: false,
    layout: defaultLayout(1600),
    actions: actions(),
    ...overrides,
  };
}

function find(entries: MenuEntry[], testId: string): MenuEntry {
  const pending = [...entries];
  while (pending.length > 0) {
    const entry = pending.shift();
    if (entry === undefined) break;
    if (entry.kind === 'separator') continue;
    if (entry.testId === testId) return entry;
    if (entry.kind === 'submenu') pending.push(...entry.items);
  }
  throw new Error(`menu entry ${testId} not found`);
}

function select(entries: MenuEntry[], testId: string): void {
  const entry = find(entries, testId);
  if (entry.kind !== 'item') throw new Error('only action entries have onSelect');
  entry.onSelect();
}

describe('application menu model', () => {
  it('groups every former header action in Jakob-friendly order', () => {
    const entries = buildAppMenu(context());
    const ids = entries.flatMap((entry) => (entry.kind === 'separator' ? [] : [entry.id]));
    expect(ids.slice(0, 4)).toEqual(['import-files', 'import-zip', 'export-current', 'export-zip']);
    expect(ids).toContain('history');
    expect(ids.indexOf('history')).toBeGreaterThan(ids.indexOf('present'));
    expect(ids.indexOf('snapshots')).toBeGreaterThan(ids.indexOf('history'));
  });

  it('disables export and present without an active file', () => {
    const entries = buildAppMenu(context({ activePath: null }));
    expect(find(entries, 'tb-export-pcd')).toHaveProperty('disabled', true);
    expect(find(entries, 'app-menu-present')).toHaveProperty('disabled', true);
  });

  it('exports the requested current-file format', () => {
    const ctx = context();
    const entries = buildAppMenu(ctx);
    select(entries, 'tb-export-svg');
    select(entries, 'tb-export-zip');
    expect(ctx.actions.exportCurrent).toHaveBeenCalledWith('svg');
    expect(ctx.actions.exportWorkspaceZip).toHaveBeenCalledTimes(1);
  });

  it('reflects the current theme as a radio choice', () => {
    const ctx = context({ theme: 'dark' });
    const entries = buildAppMenu(ctx);
    expect(find(entries, 'app-theme-dark')).toMatchObject({ role: 'menuitemradio', checked: true });
    expect(find(entries, 'app-theme-system')).toMatchObject({ checked: false });
    select(entries, 'app-theme-light');
    expect(ctx.actions.setTheme).toHaveBeenCalledWith('light');
  });

  it('offers closed panels and disables panels already open', () => {
    const layout = closePanel(defaultLayout(1600), 'sidebar');
    const ctx = context({ layout });
    const entries = buildAppMenu(ctx);
    expect(find(entries, 'view-panel-sidebar')).toHaveProperty('disabled', false);
    expect(find(entries, 'view-panel-palette')).toHaveProperty('disabled', true);
    select(entries, 'view-panel-sidebar');
    expect(ctx.actions.openPanel).toHaveBeenCalledWith('sidebar' satisfies PanelId);
  });

  it('disables opening Flow Steps when the panel is already open', () => {
    const base = defaultLayout(1600);
    const ctx = context({ layout: { ...base, panels: { ...base.panels, flows: 'open' } } });
    const entries = buildAppMenu(ctx);
    expect(find(entries, 'app-menu-flows')).toHaveProperty('disabled', true);
  });

  it('toggles private mode and keeps clear data behind a separator', () => {
    const ctx = context();
    const entries = buildAppMenu(ctx);
    expect(find(entries, 'tb-ephemeral')).toMatchObject({ role: 'menuitemcheckbox', checked: false });
    select(entries, 'tb-ephemeral');
    expect(ctx.actions.setPrivate).toHaveBeenCalledWith(true);
    select(entries, 'tb-clear-data');
    expect(ctx.actions.clearData).toHaveBeenCalledTimes(1);
  });

  it('opens history and snapshots from their groups', () => {
    const ctx = context();
    const entries = buildAppMenu(ctx);
    select(entries, 'history-open');
    select(entries, 'tb-snapshots');
    expect(ctx.actions.history).toHaveBeenCalledTimes(1);
    expect(ctx.actions.snapshots).toHaveBeenCalledTimes(1);
  });
});
