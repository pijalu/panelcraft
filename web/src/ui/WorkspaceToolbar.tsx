// SPDX-License-Identifier: GPL-3.0-only
// M3-WP4 toolbar (FR-W3/W4/W5): import files/ZIP, export .pcd/.mmd/.svg/.png/
// workspace ZIP, private-mode toggle (FR-S2), clear-data entry (FR-S4).
// Downloads go through the object-URL adapter (no network, S7-safe).
import type { RefObject } from 'preact';
import type { WorkspaceManager } from '../workspace/workspace';
import { exportPng, exportSvg } from '../workspace/io';
import { downloadBlob, downloadText, readFileAsBytes, readFileAsText } from './download';
import { baseName, stem } from './paths';
import { s } from './strings';

export interface WorkspaceToolbarProps {
  manager: WorkspaceManager;
  activePath: string | null;
  ready: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  onFlash: (msg: string) => void;
  onToggleEphemeral: (on: boolean) => void;
  onClearRequest: () => void;
  onSnapshotsRequest: () => void;
}

export function WorkspaceToolbar(props: WorkspaceToolbarProps) {
  const { manager, activePath, ready, svgRef } = props;

  const exportPcd = (): void => {
    if (activePath === null) return;
    downloadText(manager.exportText(activePath, '.pcd'), baseName(activePath));
  };

  const exportMmd = (): void => {
    if (activePath === null) return;
    downloadText(manager.exportText(activePath, '.mmd'), `${stem(activePath)}.mmd`);
  };

  const exportSvgHandler = (): void => {
    const svg = svgRef.current;
    if (svg === null || activePath === null) return;
    downloadText(exportSvg(svg), `${stem(activePath)}.svg`, 'image/svg+xml');
  };

  const exportPngHandler = (): void => {
    const svg = svgRef.current;
    if (svg === null || activePath === null) return;
    exportPng(svg)
      .then((out) => downloadBlob(out.blob, `${stem(activePath)}.png`))
      .catch((error: unknown) => {
        props.onFlash(error instanceof Error ? error.message : String(error));
      });
  };

  const exportZip = (): void => {
    manager
      .exportZip()
      .then((blob) => downloadBlob(blob, `${manager.name}.zip`))
      .catch(props.onFlash);
  };

  const onImportFiles = async (list: FileList | null): Promise<void> => {
    if (list === null || list.length === 0) return;
    const files = await Promise.all(
      [...list].map(async (f) => ({ name: f.name, text: await readFileAsText(f) })),
    );
    try {
      manager.importFiles(files);
    } catch (err) {
      props.onFlash(err instanceof Error ? err.message : String(err));
    }
  };

  const onImportZip = async (list: FileList | null): Promise<void> => {
    const file = list?.item(0);
    if (!file) return;
    try {
      const bytes = await readFileAsBytes(file);
      await manager.importZip(bytes);
    } catch (err) {
      props.onFlash(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <span class="toolbar">
      <button type="button" data-testid="tb-import-files" onClick={() => document.querySelector<HTMLInputElement>('[data-testid="import-files-input"]')?.click()}>
        {s("Import…")}{' '}</button>
      <button type="button" data-testid="tb-import-zip" onClick={() => document.querySelector<HTMLInputElement>('[data-testid="import-zip-input"]')?.click()}>
        {s("Open ZIP")}{' '}</button>
      <button type="button" data-testid="tb-export-pcd" disabled={activePath === null} onClick={exportPcd}>
        {s(".pcd")}{' '}</button>
      <button type="button" data-testid="tb-export-mmd" disabled={activePath === null} onClick={exportMmd}>
        {s(".mmd")}{' '}</button>
      <button type="button" data-testid="tb-export-svg" disabled={activePath === null} onClick={exportSvgHandler}>
        {s(".svg")}{' '}</button>
      <button type="button" data-testid="tb-export-png" disabled={activePath === null} onClick={exportPngHandler}>
        {s(".png")}{' '}</button>
      <button type="button" data-testid="tb-export-zip" onClick={exportZip}>
        {s("ZIP")}{' '}</button>
      <label class="toolbar-check" data-testid="tb-ephemeral" title={s("Private mode: keep this session in memory only (FR-S2)")}>
        <input
          type="checkbox"
          checked={ready && manager.ephemeral}
          onChange={(e) => props.onToggleEphemeral((e.target as HTMLInputElement).checked)}
        />
        {s("private")}{' '}</label>
      <button type="button" data-testid="tb-snapshots" onClick={props.onSnapshotsRequest}>
        {s("Snapshots")}{' '}</button>
      <button type="button" class="tb-danger" data-testid="tb-clear-data" onClick={props.onClearRequest}>
        {s("Clear data…")}{' '}</button>
      <input
        aria-label={s("Import .pcd or mermaid files")}
        type="file"
        multiple
        accept=".pcd,.mmd,.mermaid,.txt"
        data-testid="import-files-input"
        class="visually-hidden"
        onChange={(e) => {
          void onImportFiles((e.target as HTMLInputElement).files);
          (e.target as HTMLInputElement).value = '';
        }}
      />
      <input
        aria-label={s("Import workspace zip")}
        type="file"
        accept=".zip"
        data-testid="import-zip-input"
        class="visually-hidden"
        onChange={(e) => {
          void onImportZip((e.target as HTMLInputElement).files);
          (e.target as HTMLInputElement).value = '';
        }}
      />
    </span>
  );
}
