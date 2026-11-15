// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: the hamburger Application menu. It owns the workspace import/
// export commands (moved out of the header row), the hidden file inputs, and
// renders the shared Menu primitive with the grouped action model.
import type { ComponentChildren, RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import { exportPng, exportSvg } from '../workspace/io';
import type { UiLayoutHandle } from './useUiLayout';
import type { AppThemeHandle } from './useAppTheme';
import type { AppThemePreference } from './appTheme';
import { Menu } from './Menu';
import { MenuIcon } from './icons';
import {
  buildAppMenu, type AppMenuGrid, type AppMenuInstall, type AppMenuUpdate,
} from './appMenuEntries';
import { downloadBlob, downloadText, readFileAsBytes, readFileAsText } from './download';
import { baseName, stem } from './paths';
import { s } from './strings';

export interface AppMenuProps {
  manager: WorkspaceManager;
  ready: boolean;
  activePath: string | null;
  svgRef: RefObject<SVGSVGElement | null>;
  ui: UiLayoutHandle;
  theme: AppThemeHandle;
  privateMode: boolean;
  onFlash: (msg: string) => void;
  onHistoryRequest: () => void;
  onPresent: () => void;
  onSnapshotsRequest: () => void;
  onClearRequest: () => void;
  onToggleEphemeral: (on: boolean) => void;
  /** UX08-WP04: install affordance (absent in a standalone window). */
  install?: AppMenuInstall;
  /** UX08-WP04: waiting update; `restart` is the explicit consent. */
  update?: AppMenuUpdate;
  /** UX08-WP05: canvas grid preference (absent before the workspace loads). */
  grid?: AppMenuGrid;
}

export function AppMenu(props: AppMenuProps): ComponentChildren {
  const { manager, activePath, svgRef, ready } = props;
  const filesRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);

  const exportPcd = (): void => {
    if (activePath === null) return;
    downloadText(manager.exportText(activePath, '.pcd'), baseName(activePath));
  };
  const exportMmd = (): void => {
    if (activePath === null) return;
    downloadText(manager.exportText(activePath, '.mmd'), `${stem(activePath)}.mmd`);
  };
  const exportSvgHandler = (): void => {
    if (svgRef.current === null || activePath === null) return;
    downloadText(exportSvg(svgRef.current), `${stem(activePath)}.svg`, 'image/svg+xml');
  };
  const exportPngHandler = (): void => {
    if (svgRef.current === null || activePath === null) return;
    exportPng(svgRef.current)
      .then((out) => downloadBlob(out.blob, `${stem(activePath)}.png`))
      .catch((error: unknown) => props.onFlash(error instanceof Error ? error.message : String(error)));
  };
  const exportZip = (): void => {
    manager
      .exportZip()
      .then((blob) => downloadBlob(blob, `${manager.name}.zip`))
      .catch(props.onFlash);
  };
  const exportCurrent = (kind: 'pcd' | 'mmd' | 'svg' | 'png'): void => {
    if (kind === 'pcd') exportPcd();
    else if (kind === 'mmd') exportMmd();
    else if (kind === 'svg') exportSvgHandler();
    else exportPngHandler();
  };

  const onImportFiles = (list: FileList | null): void => {
    if (list === null || list.length === 0) return;
    void Promise.all([...list].map(async (f) => ({ name: f.name, text: await readFileAsText(f) })))
      .then((files) => manager.importFiles(files))
      .catch((err: unknown) => props.onFlash(err instanceof Error ? err.message : String(err)));
  };
  const onImportZip = (list: FileList | null): void => {
    const file = list?.item(0);
    if (!file) return;
    void readFileAsBytes(file)
      .then((bytes) => manager.importZip(bytes))
      .catch((err: unknown) => props.onFlash(err instanceof Error ? err.message : String(err)));
  };

  const items = buildAppMenu({
    activePath,
    theme: props.theme.preference,
    privateMode: ready && props.privateMode,
    layout: props.ui.layout,
    grid: props.grid,
    actions: {
      importFiles: () => filesRef.current?.click(),
      importZip: () => zipRef.current?.click(),
      exportCurrent,
      exportWorkspaceZip: exportZip,
      openPanel: props.ui.openPanel,
      resetLayout: props.ui.resetLayout,
      setTheme: (theme: AppThemePreference) => props.theme.setPreference(theme),
      history: props.onHistoryRequest,
      present: props.onPresent,
      snapshots: props.onSnapshotsRequest,
      clearData: props.onClearRequest,
      setPrivate: props.onToggleEphemeral,
    },
    install: props.install,
    update: props.update,
  });

  return (
    <>
      <Menu
        id="app"
        label={s('Application menu')}
        testId="app-menu"
        items={items}
        trigger={<MenuIcon />}
      />
      <input
        ref={filesRef}
        aria-label={s('Import .pcd or mermaid files')}
        type="file"
        multiple
        accept=".pcd,.mmd,.mermaid,.txt"
        data-testid="import-files-input"
        class="visually-hidden"
        onChange={(e) => {
          onImportFiles((e.target as HTMLInputElement).files);
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <input
        ref={zipRef}
        aria-label={s('Import workspace zip')}
        type="file"
        accept=".zip"
        data-testid="import-zip-input"
        class="visually-hidden"
        onChange={(e) => {
          onImportZip((e.target as HTMLInputElement).files);
          (e.target as HTMLInputElement).value = '';
        }}
      />
    </>
  );
}
