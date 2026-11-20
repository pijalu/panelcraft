// SPDX-License-Identifier: GPL-3.0-only
// Persistent Git history is separate from the in-session undo History menu.
import { useEffect, useState } from 'preact/hooks';
import { filesUnder } from '../workspace/fs';
import type { StoredWorkspace, VersionStoragePort, WorkspaceVersion } from '../workspace/store/port';
import { s } from './strings';

interface VersionHistoryDialogProps {
  store: VersionStoragePort;
  onRestore(id: string): Promise<void>;
  onClose(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function VersionList(props: {
  versions: WorkspaceVersion[];
  selected: string | null;
  busy: boolean;
  onSelect(id: string): void;
}) {
  return (
    <ol class="version-list" data-testid="version-list">
      {props.versions.map((version) => (
        <li key={version.id} data-testid={`version-row-${version.id}`}>
          <button
            type="button"
            class="version-select"
            data-testid={`version-select-${version.id}`}
            aria-pressed={props.selected === version.id}
            disabled={props.busy}
            onClick={() => props.onSelect(version.id)}
          >
            <span class="version-message">{version.message}</span>
            <span class="version-meta muted">{version.id.slice(0, 7)} · {new Date(version.savedAt).toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function VersionPreview({ workspace }: { workspace: StoredWorkspace }) {
  const files = filesUnder(workspace.tree);
  return (
    <section class="version-preview" data-testid="version-preview" aria-label={s('Selected version')}>
      <h3>{workspace.name}</h3>
      <p class="muted">{s('Files in this version')}</p>
      <ul>{files.map((file) => <li key={file.path}>{file.path}</li>)}</ul>
    </section>
  );
}

export function VersionHistoryDialog(props: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<WorkspaceVersion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoredWorkspace | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    props.store.history()
      .then((items) => { if (active) setVersions(items); })
      .catch((reason: unknown) => { if (active) setError(errorMessage(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [props.store]);

  const select = (id: string): void => {
    setBusy(true); setError(null); setSelected(id); setPreview(null); setConfirming(false);
    void props.store.show(id)
      .then(setPreview)
      .catch((reason: unknown) => setError(errorMessage(reason)))
      .finally(() => setBusy(false));
  };

  const restore = (): void => {
    if (selected === null) return;
    setBusy(true); setError(null);
    void props.onRestore(selected)
      .then(props.onClose)
      .catch((reason: unknown) => { setError(errorMessage(reason)); setConfirming(false); })
      .finally(() => setBusy(false));
  };

  return (
    <div class="dialog-overlay" data-testid="versions-overlay">
      <div
        class="dialog versions-dialog" role="dialog" aria-modal="true" aria-label={s('Git version history')}
        onKeyDown={(event) => { if (event.key === 'Escape' && !busy) props.onClose(); }}
      >
        <h2>{s('Git version history')}</h2>
        <p class="muted">{s('Local commits. Restoring creates a new commit and preserves existing history.')}</p>
        {busy && selected === null && <p role="status">{s('Loading Git history…')}</p>}
        {error !== null && <p class="version-error" role="alert">{error}</p>}
        {!busy && versions.length === 0 && error === null && <p class="deps-empty">{s('No Git commits yet.')}</p>}
        <VersionList versions={versions} selected={selected} busy={busy} onSelect={select} />
        {preview !== null && <VersionPreview workspace={preview} />}
        {preview !== null && !confirming && (
          <button type="button" data-testid="version-restore" disabled={busy} onClick={() => setConfirming(true)}>
            {s('Restore this version…')}
          </button>
        )}
        {confirming && selected !== null && (
          <div class="version-confirm" data-testid="version-confirm" role="group" aria-label={s('Confirm version restore')}>
            <p>{s('Restore {id} as a new commit? Current edits are saved first.', { id: selected.slice(0, 7) })}</p>
            <button type="button" class="button-primary" data-testid="version-confirm-restore" disabled={busy} onClick={restore}>{s('Restore version')}</button>
            <button type="button" data-testid="version-confirm-cancel" disabled={busy} onClick={() => setConfirming(false)}>{s('Cancel')}</button>
          </div>
        )}
        <div class="dialog-actions">
          <button type="button" data-testid="versions-close" autoFocus disabled={busy} onClick={props.onClose}>{s('Close')}</button>
        </div>
      </div>
    </div>
  );
}
