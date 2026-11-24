// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from './Menu';
import { buildAppMenu, type AppMenuActions, type AppMenuContext } from './appMenuEntries';
import { closePanel, defaultLayout, openPanel, PANELS, type PanelId } from './uiLayout';

function actions(): AppMenuActions {
  return {
    importFiles: vi.fn(),
    importZip: vi.fn(),
    exportCurrent: vi.fn(),
    exportWorkspaceZip: vi.fn(),
    openPanel: vi.fn(),
    resetLayout: vi.fn(),
    resetDiagramLayout: vi.fn(),
    resetRoutes: vi.fn(),
    setTheme: vi.fn(),
    history: vi.fn(),
    present: vi.fn(),
    snapshots: vi.fn(),
    clearData: vi.fn(),
    setPrivate: vi.fn(),
  };
}

function contextWith(overrides: Partial<AppMenuContext> = {}): AppMenuContext {
  return context(overrides);
}

function context(overrides: Partial<AppMenuContext> = {}): AppMenuContext {
  return {
    activePath: 'main.pcd',
    theme: 'system',
    privateMode: false,
    layout: defaultLayout(1600),
    selection: { objects: [], links: [] },
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

function findOptional(entries: MenuEntry[], testId: string): MenuEntry | undefined {
  try {
    return find(entries, testId);
  } catch {
    return undefined;
  }
}

function select(entries: MenuEntry[], testId: string): void {
  const entry = find(entries, testId);
  if (entry.kind !== 'item') throw new Error('only action entries have onSelect');
  entry.onSelect();
}

/** Stable test id -> entry and the submenu chain that owns it. */
function locate(entries: MenuEntry[]): Map<string, { entry: MenuEntry; path: string[] }> {
  const found = new Map<string, { entry: MenuEntry; path: string[] }>();
  const walk = (items: MenuEntry[], path: string[]): void => {
    for (const entry of items) {
      if (entry.kind === 'separator') continue;
      const key = entry.testId ?? entry.id;
      expect(found.has(key), `duplicate menu test id ${key}`).toBe(false);
      found.set(key, { entry, path });
      if (entry.kind === 'submenu') walk(entry.items, [...path, entry.id]);
    }
  };
  walk(entries, []);
  return found;
}

describe('application menu model', () => {
  it('keeps frequent commands on the root and groups advanced ones by task', () => {
    const entries = buildAppMenu(contextWith({
      grid: { type: 'dots', snap: true, setType: vi.fn(), setSnap: vi.fn() },
    }));
    const root = entries
      .filter((entry): entry is Exclude<MenuEntry, { kind: 'separator' }> => entry.kind !== 'separator')
      .map((entry) => entry.id);
    expect(root).toEqual([
      'import-files', 'export-current', 'group-file', 'open-flows', 'present',
      'group-layout', 'history', 'group-application',
    ]);

    const located = locate(entries);
    for (const id of [
      'tb-import-files', 'menu-export-current', 'app-menu-flows', 'app-menu-present', 'history-open',
    ]) {
      expect(located.get(id)?.path, id).toEqual([]);
    }
    for (const id of ['tb-import-zip', 'tb-export-zip', 'tb-snapshots', 'tb-clear-data']) {
      expect(located.get(id)?.path, id).toEqual(['group-file']);
    }
    for (const id of [
      ...PANELS.map((panel) => `view-panel-${panel}`),
      'view-grid-dots', 'view-grid-snap', 'reset-workspace-layout',
      'menu-reset-diagram-layout', 'menu-reset-all-routes',
    ]) {
      expect(located.get(id)?.path, id).toEqual(['group-layout']);
    }
    for (const id of ['app-theme-system', 'app-theme-light', 'app-theme-dark', 'tb-ephemeral']) {
      expect(located.get(id)?.path, id).toEqual(['group-application']);
    }
  });

  it('keeps one owner and one stable test id for every command', () => {
    const ctx = contextWith({
      grid: { type: 'dots', snap: true, setType: vi.fn(), setSnap: vi.fn() },
      install: { availability: 'ready', promptInstall: vi.fn() },
      update: { state: 'available', restart: vi.fn(), unapplied: null },
    });
    const ids = [...locate(buildAppMenu(ctx)).keys()].sort();
    expect(ids).toEqual([
      'tb-import-files', 'menu-export-current',
      'tb-export-pcd', 'tb-export-mmd', 'tb-export-svg', 'tb-export-png',
      'app-menu-flows', 'app-menu-present', 'history-open',
      'menu-group-file', 'tb-import-zip', 'tb-export-zip', 'tb-snapshots', 'tb-clear-data',
      'menu-group-layout', ...PANELS.map((panel) => `view-panel-${panel}`),
      'view-grid-off', 'view-grid-dots', 'view-grid-lines', 'view-grid-snap',
      'reset-workspace-layout', 'menu-reset-diagram-layout', 'menu-reset-all-routes',
      'menu-group-application', 'app-theme-system', 'app-theme-light', 'app-theme-dark',
      'tb-ephemeral', 'app-install', 'app-update-restart',
    ].sort());
  });

  it('gates direct folder access on browser capability', () => {
    expect(findOptional(buildAppMenu(context()), 'tb-open-directory')).toBeUndefined();

    const openDirectory = vi.fn();
    const entries = buildAppMenu(context({ actions: { ...actions(), openDirectory } }));
    select(entries, 'tb-open-directory');
    expect(openDirectory).toHaveBeenCalledTimes(1);
  });

  it('gates persistent versions on the optional Git port', () => {
    expect(findOptional(buildAppMenu(context()), 'tb-versions')).toBeUndefined();
    const versions = vi.fn();
    const entries = buildAppMenu(context({ actions: { ...actions(), versions } }));
    select(entries, 'tb-versions');
    expect(versions).toHaveBeenCalledTimes(1);
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
    const layout = openPanel(closePanel(defaultLayout(1600), 'sidebar'), 'palette');
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

describe('application menu install and update entries (UX08-WP04)', () => {
  it('offers install only when the browser can, and runs the prompt', () => {
    const promptInstall = vi.fn(async () => 'accepted' as const);
    const entries = buildAppMenu(
      contextWith({ install: { availability: 'ready', promptInstall } }),
    );
    const entry = find(entries, 'app-install');
    expect(entry.kind).toBe('item');
    if (entry.kind !== 'item') throw new Error('expected an item');
    expect(entry.disabled).not.toBe(true);
    entry.onSelect();
    expect(promptInstall).toHaveBeenCalledTimes(1);
  });

  it('shows written guidance instead of a dead prompt in browsers without one', () => {
    const guidance = vi.fn();
    const entries = buildAppMenu(
      contextWith({ install: { availability: 'guidance', guide: guidance } }),
    );
    const entry = find(entries, 'app-install');
    if (entry.kind !== 'item') throw new Error('expected an item');
    expect(entry.label).toContain('browser');
    entry.onSelect();
    expect(guidance).toHaveBeenCalledTimes(1);
  });

  it('hides the install entry in an installed (standalone) window', () => {
    const entries = buildAppMenu(contextWith({ install: { availability: 'installed' } }));
    expect(findOptional(entries, 'app-install')).toBeUndefined();
  });

  it('offers the restart once a worker waits, even after Later', () => {
    for (const state of ['available', 'deferred'] as const) {
      const restart = vi.fn();
      const entries = buildAppMenu(
        contextWith({ update: { state, restart, unapplied: null } }),
      );
      const entry = find(entries, 'app-update-restart');
      if (entry.kind !== 'item') throw new Error('expected an item');
      expect(entry.disabled).not.toBe(true);
      entry.onSelect();
      expect(restart).toHaveBeenCalledTimes(1);
    }
  });

  it('omits the restart while no update is pending', () => {
    const entries = buildAppMenu(contextWith({ update: { state: 'idle', restart: vi.fn(), unapplied: null } }));
    expect(findOptional(entries, 'app-update-restart')).toBeUndefined();
  });
});

describe('canvas grid entries (UX08-WP05)', () => {
  const gridActions = () => ({ setType: vi.fn(), setSnap: vi.fn() });

  it('offers the three grid types as an exclusive radio group', () => {
    const setType = vi.fn();
    const entries = buildAppMenu(contextWith({
      grid: { type: 'dots', snap: true, ...gridActions(), setType },
    }));
    for (const type of ['off', 'dots', 'lines'] as const) {
      const entry = find(entries, `view-grid-${type}`);
      if (entry.kind !== 'item') throw new Error('expected an item');
      expect(entry.role).toBe('menuitemradio');
      expect(entry.checked).toBe(type === 'dots');
    }
    const lines = find(entries, 'view-grid-lines');
    if (lines.kind !== 'item') throw new Error('expected an item');
    lines.onSelect();
    expect(setType).toHaveBeenCalledWith('lines');
  });

  it('keeps snapping as a separate checkbox, not a fourth grid type', () => {
    const setSnap = vi.fn();
    const entries = buildAppMenu(contextWith({
      grid: { type: 'off', snap: true, ...gridActions(), setSnap },
    }));
    const entry = find(entries, 'view-grid-snap');
    if (entry.kind !== 'item') throw new Error('expected an item');
    expect(entry.role).toBe('menuitemcheckbox');
    expect(entry.checked).toBe(true);
    expect(entry.label).toBe('Snap to grid');
    entry.onSelect();
    // Toggling the checkbox reports the opposite value.
    expect(setSnap).toHaveBeenCalledWith(false);
  });

  it('omits grid entries entirely when the workspace has no preference yet', () => {
    const entries = buildAppMenu(contextWith({ grid: undefined }));
    expect(findOptional(entries, 'view-grid-dots')).toBeUndefined();
    expect(findOptional(entries, 'view-grid-snap')).toBeUndefined();
  });
});
