// SPDX-License-Identifier: GPL-3.0-only
// Overlay dialogs row (extracted to keep App under the function-length gate):
// clear-data confirm, diverged-file prompt, flash banner, quick search
// (M6-WP5) and snapshots (M6-WP6). Pure chrome — no canvas coupling beyond
// the controller ref used for search jump-to.
import { ClearDataDialog } from './ClearDataDialog';
import { DivergedDialog } from './DivergedDialog';
import { SnapshotsDialog } from './SnapshotsDialog';
import { SearchDialog } from './search/SearchDialog';
import { useQuickSearch } from './useQuickSearch';
import { useSnapshotStore } from './useSnapshotStore';
import { useDivergedClose } from './useDivergedClose';
import type { RefObject } from 'preact';
import type { CanvasController } from './CanvasController';
import type { SnapshotRecord } from '../workspace/store/snapshots';
import type { WorkspaceManager } from '../workspace/workspace';

export function AppDialogs(props: {
  manager: WorkspaceManager;
  activePath: string | null;
  ctrlRef: RefObject<CanvasController | null>;
  diverged: ReturnType<typeof useDivergedClose>;
  clearOpen: boolean;
  clearData(): void;
  onClearCancel(): void;
  flash: string | null;
  onFlashDismiss(): void;
  snapsOpen: boolean;
  onSnapsClose(): void;
}) {
  const search = useQuickSearch(props.manager, props.activePath, props.ctrlRef);
  const store = useSnapshotStore();
  return (
    <>
      {props.clearOpen && <ClearDataDialog onConfirm={props.clearData} onCancel={props.onClearCancel} />}
      {props.diverged.prompt !== null && (
        <DivergedDialog
          path={props.diverged.prompt.path}
          parseError={props.diverged.prompt.parseError}
          onApply={props.diverged.prompt.onApply}
          onDiscard={props.diverged.prompt.onDiscard}
          onCancel={props.diverged.prompt.onCancel}
        />
      )}
      {props.flash !== null && (
        <div class="banner banner-error" data-testid="banner-flash" role="alert">
          <span>{props.flash}</span>
          <button type="button" onClick={props.onFlashDismiss}>dismiss</button>
        </div>
      )}
      {search.open && <SearchDialog entries={search.entries} onPick={search.onPick} onClose={search.close} />}
      {props.snapsOpen && store !== null && (
        <SnapshotsDialog
          snapshots={() => store.list()}
          onSave={(n) => store.save(n, props.manager.record()).then(() => undefined)}
          onRestore={(rec: SnapshotRecord) => props.manager.restoreRecord(rec.ws)}
          onDelete={(id) => store.delete(id)}
          onClose={props.onSnapsClose}
        />
      )}
    </>
  );
}
