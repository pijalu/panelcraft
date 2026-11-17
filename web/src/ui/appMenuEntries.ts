// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: the application menu's action model. Pure so grouping, ordering,
// disabled states and checked radio choices are unit-tested without a DOM.
import type { MenuEntry } from './Menu';
import { PANELS, type PanelId, type UiLayout } from './uiLayout';
import { panelLabel } from './WorkspacePanels';
import type { AppThemePreference } from './appTheme';
import type { GridType } from '../engine/render/grid';
import { s } from './strings';
import { routeResetTarget, type CommandSelection, type RouteResetTarget } from './commandPolicy';

export interface AppMenuActions {
  importFiles: () => void;
  importZip: () => void;
  exportCurrent: (kind: 'pcd' | 'mmd' | 'svg' | 'png') => void;
  exportWorkspaceZip: () => void;
  openPanel: (panel: PanelId) => void;
  resetLayout: () => void;
  resetDiagramLayout: () => void;
  resetRoutes: (target: RouteResetTarget) => void;
  setTheme: (theme: AppThemePreference) => void;
  history: () => void;
  present: () => void;
  snapshots: () => void;
  clearData: () => void;
  setPrivate: (on: boolean) => void;
}

/** UX08-WP04: install affordance exposed to the menu. */
export interface AppMenuInstall {
  availability: 'installed' | 'ready' | 'guidance';
  /** Chromium: open the browser's install prompt. */
  promptInstall?: () => void;
  /** Everything else: explain the browser's own install action. */
  guide?: () => void;
}

/** UX08-WP04: a consensual update waiting for an explicit restart. */
export interface AppMenuUpdate {
  state: 'idle' | 'available' | 'deferred' | 'applying';
  restart: () => void;
  /** Work the restart would discard (an unapplied buffer), if any. */
  unapplied: string | null;
}

export interface AppMenuContext {
  activePath: string | null;
  theme: AppThemePreference;
  privateMode: boolean;
  layout: UiLayout;
  /** Current canvas selection for the shared reset-command policy. */
  selection: CommandSelection;
  grid?: AppMenuGrid;
  actions: AppMenuActions;
  install?: AppMenuInstall;
  update?: AppMenuUpdate;
}

/** UX08-WP05: the two independent canvas grid preferences. */
export interface AppMenuGrid {
  type: GridType;
  snap: boolean;
  setType: (type: GridType) => void;
  setSnap: (snap: boolean) => void;
}

const THEMES: readonly { id: AppThemePreference; label: string }[] = [
  { id: 'system', label: s('System') },
  { id: 'light', label: s('Light') },
  { id: 'dark', label: s('Dark') },
];

function fileEntries(ctx: AppMenuContext): MenuEntry[] {
  const noFile = ctx.activePath === null;
  return [
    {
      kind: 'item',
      id: 'import-files',
      label: s('Import files…'),
      testId: 'tb-import-files',
      onSelect: ctx.actions.importFiles,
    },
    {
      kind: 'item',
      id: 'import-zip',
      label: s('Open workspace ZIP…'),
      testId: 'tb-import-zip',
      onSelect: ctx.actions.importZip,
    },
    {
      kind: 'submenu',
      id: 'export-current',
      label: s('Export current file'),
      testId: 'menu-export-current',
      items: (['pcd', 'mmd', 'svg', 'png'] as const).map((kind) => ({
        kind: 'item',
        id: `export-${kind}`,
        label: `.${kind}`,
        testId: `tb-export-${kind}`,
        disabled: noFile,
        onSelect: () => ctx.actions.exportCurrent(kind),
      })),
    },
    {
      kind: 'item',
      id: 'export-zip',
      label: s('Export workspace ZIP'),
      testId: 'tb-export-zip',
      onSelect: ctx.actions.exportWorkspaceZip,
    },
  ];
}

function gridEntries(ctx: AppMenuContext): MenuEntry[] {
  const grid = ctx.grid;
  if (grid === undefined) return [];
  return [
    {
      kind: 'item', id: 'grid-off', label: s('Grid: off'), testId: 'view-grid-off',
      role: 'menuitemradio', checked: grid.type === 'off', onSelect: () => grid.setType('off'),
    },
    {
      kind: 'item', id: 'grid-dots', label: s('Grid: dots'), testId: 'view-grid-dots',
      role: 'menuitemradio', checked: grid.type === 'dots', onSelect: () => grid.setType('dots'),
    },
    {
      kind: 'item', id: 'grid-lines', label: s('Grid: lines'), testId: 'view-grid-lines',
      role: 'menuitemradio', checked: grid.type === 'lines', onSelect: () => grid.setType('lines'),
    },
    {
      kind: 'item',
      id: 'grid-snap',
      label: s('Snap to grid'),
      testId: 'view-grid-snap',
      role: 'menuitemcheckbox',
      checked: grid.snap,
      onSelect: () => grid.setSnap(!grid.snap),
    },
  ];
}

function viewEntries(ctx: AppMenuContext): MenuEntry[] {
  return [
    ...THEMES.map((theme) => ({
      kind: 'item' as const,
      id: `theme-${theme.id}`,
      label: s('Theme: {theme}', { theme: theme.label }),
      testId: `app-theme-${theme.id}`,
      role: 'menuitemradio' as const,
      checked: ctx.theme === theme.id,
      onSelect: () => ctx.actions.setTheme(theme.id),
    })),
    { kind: 'separator', id: 'view-sep-1' },
    ...PANELS.map((panel) => ({
      kind: 'item' as const,
      id: `panel-${panel}`,
      label: s('Show {label} panel', { label: panelLabel(panel) }),
      testId: `view-panel-${panel}`,
      disabled: ctx.layout.panels[panel] === 'open',
      onSelect: () => ctx.actions.openPanel(panel),
    })),
    { kind: 'separator', id: 'view-grid-sep' },
    ...gridEntries(ctx),
    { kind: 'separator', id: 'view-sep-2' },
    {
      kind: 'item',
      id: 'reset-layout',
      label: s('Reset workspace layout'),
      testId: 'reset-workspace-layout',
      onSelect: ctx.actions.resetLayout,
    },
  ];
}

/**
 * Diagram reset commands (ADR 0007). Enablement comes from one pure selection
 * policy shared with the canvas context menu, never from a second rule here.
 */
function diagramEntries(ctx: AppMenuContext): MenuEntry[] {
  const target = routeResetTarget(ctx.selection);
  const resetAll: MenuEntry = {
    kind: 'item',
    id: 'reset-all-routes',
    label: s('Reset all routes'),
    testId: 'menu-reset-all-routes',
    disabled: target.kind === 'off' || ctx.activePath === null,
    onSelect: () => ctx.actions.resetRoutes(target),
  };
  const resetOne: MenuEntry = {
    kind: 'item',
    id: 'reset-route',
    label: s('Reset route'),
    testId: 'menu-reset-route',
    disabled: target.kind !== 'one',
    onSelect: () => ctx.actions.resetRoutes(target),
  };
  return [
    {
      kind: 'item',
      id: 'reset-diagram-layout',
      label: s('Reset diagram layout'),
      testId: 'menu-reset-diagram-layout',
      disabled: ctx.activePath === null,
      onSelect: ctx.actions.resetDiagramLayout,
    },
    target.kind === 'one' ? resetOne : resetAll,
  ];
}

function flowEntries(ctx: AppMenuContext): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'open-flows',
      label: s('Open Flow Steps'),
      testId: 'app-menu-flows',
      disabled: ctx.layout.panels.flows === 'open',
      onSelect: () => ctx.actions.openPanel('flows'),
    },
    {
      kind: 'item',
      id: 'present',
      label: s('Present'),
      testId: 'app-menu-present',
      disabled: ctx.activePath === null,
      onSelect: ctx.actions.present,
    },
  ];
}

/** Install + update: application lifecycle, not workspace content. */
function applicationEntries(ctx: AppMenuContext): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const install = ctx.install;
  // An installed (standalone) window is never told to install itself.
  if (install !== undefined && install.availability === 'ready') {
    entries.push({
      kind: 'item',
      id: 'install-application',
      label: s('Install application'),
      testId: 'app-install',
      onSelect: () => install.promptInstall?.(),
    });
  } else if (install !== undefined && install.availability === 'guidance') {
    entries.push({
      kind: 'item',
      id: 'install-application',
      label: s('Install from browser menu'),
      testId: 'app-install',
      onSelect: () => install.guide?.(),
    });
  }
  const update = ctx.update;
  if (update !== undefined && (update.state === 'available' || update.state === 'deferred')) {
    entries.push({
      kind: 'item',
      id: 'update-restart',
      label:
        update.unapplied === null
          ? s('Restart to update')
          : s('Restart to update (discards unapplied code)'),
      testId: 'app-update-restart',
      onSelect: update.restart,
    });
  }
  return entries.length === 0 ? [] : [...entries, { kind: 'separator', id: 'group-application' }];
}

function workspaceEntries(ctx: AppMenuContext): MenuEntry[] {
  return [
    {
      kind: 'item',
      id: 'snapshots',
      label: s('Snapshots'),
      testId: 'tb-snapshots',
      onSelect: ctx.actions.snapshots,
    },
    {
      kind: 'item',
      id: 'private',
      label: s('Private mode'),
      testId: 'tb-ephemeral',
      role: 'menuitemcheckbox',
      checked: ctx.privateMode,
      onSelect: () => ctx.actions.setPrivate(!ctx.privateMode),
    },
    { kind: 'separator', id: 'workspace-sep' },
    {
      kind: 'item',
      id: 'clear-data',
      label: s('Clear data…'),
      testId: 'tb-clear-data',
      onSelect: ctx.actions.clearData,
    },
  ];
}

/** Grouped entries in Jakob-friendly application-menu order. */
export function buildAppMenu(ctx: AppMenuContext): MenuEntry[] {
  return [
    ...fileEntries(ctx),
    { kind: 'separator', id: 'group-file' },
    ...viewEntries(ctx),
    { kind: 'separator', id: 'group-view' },
    ...diagramEntries(ctx),
    { kind: 'separator', id: 'group-diagram' },
    ...flowEntries(ctx),
    { kind: 'separator', id: 'group-flows' },
    {
      kind: 'item',
      id: 'history',
      label: s('History'),
      testId: 'history-open',
      onSelect: ctx.actions.history,
    },
    { kind: 'separator', id: 'group-history' },
    ...applicationEntries(ctx),
    ...workspaceEntries(ctx),
  ];
}
