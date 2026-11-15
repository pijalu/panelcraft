// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: the application menu's action model. Pure so grouping, ordering,
// disabled states and checked radio choices are unit-tested without a DOM.
import type { MenuEntry } from './Menu';
import { PANELS, type PanelId, type UiLayout } from './uiLayout';
import { panelLabel } from './WorkspacePanels';
import type { AppThemePreference } from './appTheme';
import { s } from './strings';

export interface AppMenuActions {
  importFiles: () => void;
  importZip: () => void;
  exportCurrent: (kind: 'pcd' | 'mmd' | 'svg' | 'png') => void;
  exportWorkspaceZip: () => void;
  openPanel: (panel: PanelId) => void;
  resetLayout: () => void;
  setTheme: (theme: AppThemePreference) => void;
  history: () => void;
  present: () => void;
  snapshots: () => void;
  clearData: () => void;
  setPrivate: (on: boolean) => void;
}

export interface AppMenuContext {
  activePath: string | null;
  theme: AppThemePreference;
  privateMode: boolean;
  layout: UiLayout;
  actions: AppMenuActions;
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
    ...workspaceEntries(ctx),
  ];
}
