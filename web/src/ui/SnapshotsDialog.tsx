// SPDX-License-Identifier: GPL-3.0-only
// Snapshots dialog (M6-WP6, FR-W7): named snapshots of the whole workspace —
// save current, restore, delete (prune). Storage browser-local only (ADR-0003).
import { useEffect, useState } from 'preact/hooks';
import type { SnapshotRecord } from '../workspace/store/snapshots';
import { s } from './strings';

export interface SnapshotsDialogProps {
  snapshots(): Promise<Array<SnapshotRecord>>;
  onSave(name: string): Promise<void>;
  onRestore(rec: SnapshotRecord): void;
  onDelete(id: string): Promise<void>;
  onClose(): void;
}

export function SnapshotsDialog(props: SnapshotsDialogProps) {
  const [name, setName] = useState('');
  const [list, setList] = useState<SnapshotRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = (): void => {
    setBusy(true);
    props
      .snapshots()
      .then((s) => setList([...s]))
      .finally(() => setBusy(false));
  };

  useEffect(refresh, []);

  const save = (): void => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    props
      .onSave(n)
      .then(() => setName(''))
      .then(refresh)
      .finally(() => setBusy(false));
  };

  const remove = (id: string): void => {
    setBusy(true);
    props.onDelete(id).then(refresh).finally(() => setBusy(false));
  };

  return (
    <div class="dialog-overlay" data-testid="snapshots-overlay">
      <div class="dialog" role="dialog" aria-label={s("Snapshots")}>
        <h2>{s("snapshots")}</h2>
        <p class="muted">{s("Named restore points of the whole workspace, stored locally in your browser.")}</p>
        <div class="snapshot-create">
          <input
            data-testid="snapshot-name"
            placeholder={s("snapshot name…")}
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <button type="button" data-testid="snapshot-save" onClick={save} disabled={busy || name.trim() === ''}>
            {s("save")}{' '}</button>
        </div>
        <ul class="snapshot-list" data-testid="snapshot-list">
          {list.length === 0 && <li class="deps-empty">{s("no snapshots yet")}</li>}
          {list.map((snapshot) => (
            <li key={snapshot.id}>
              <span class="snapshot-name">{snapshot.name}</span>
              <span class="snapshot-at muted">{new Date(snapshot.savedAt).toLocaleString()}</span>
              <button type="button" data-testid={`snapshot-restore-${snapshot.id}`} onClick={() => { props.onRestore(snapshot); props.onClose(); }} disabled={busy}>
                {s("restore")}{' '}</button>
              <button type="button" data-testid={`snapshot-delete-${snapshot.id}`} onClick={() => remove(snapshot.id)} disabled={busy}>
                {s("delete")}{' '}</button>
            </li>
          ))}
        </ul>
        <div class="dialog-actions">
          <button type="button" data-testid="snapshot-close" onClick={props.onClose}>
            {s("close")}{' '}</button>
        </div>
      </div>
    </div>
  );
}
