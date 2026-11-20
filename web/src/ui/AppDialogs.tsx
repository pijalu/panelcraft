// SPDX-License-Identifier: GPL-3.0-only
// Overlay dialogs row (extracted to keep App under the function-length gate):
// clear-data confirm, diverged-file prompt, flash banner, quick search
// (M6-WP5) and snapshots (M6-WP6). Pure chrome — no canvas coupling beyond
// the controller ref used for search jump-to.
import { HistoryMenu } from './HistoryMenu';
import type { HistoryHandle } from './useHistory';
import { ClearDataDialog } from './ClearDataDialog';
import { DivergedDialog } from './DivergedDialog';
import { SnapshotsDialog } from './SnapshotsDialog';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import { IconManagerDialog } from './IconPicker';
import type { Doc } from '../engine/model/types';
import { SearchDialog } from './search/SearchDialog';
import { useQuickSearch } from './useQuickSearch';
import { useSnapshotStore } from './useSnapshotStore';
import { useDivergedClose } from './useDivergedClose';
import type { RefObject } from 'preact';
import type { CanvasController } from './CanvasController';
import type { SnapshotRecord } from '../workspace/store/snapshots';
import type { WorkspaceManager } from '../workspace/workspace';
import { s } from './strings';

export function AppDialogs(props: {
  manager: WorkspaceManager;
  activePath: string | null;
  ctrlRef: RefObject<CanvasController | null>;
  /** Invalidate same-path canvas/code load guards before restoring a snapshot. */
  resyncDocuments: () => void;
  diverged: ReturnType<typeof useDivergedClose>;
  clearOpen: boolean;
  clearData(): void;
  onClearCancel(): void;
  flash: string | null;
  onFlashDismiss(): void;
  snapsOpen: boolean;
  onSnapsClose(): void;
  versionsOpen: boolean;
  onVersionsClose(): void;
  /** IR v9: project-icon manager (add/rename/remove with usage checks). */
  iconsOpen: boolean;
  iconDoc: Doc | null;
  onIconsClose(): void;
  onIconsCommit(next: Doc, label: string): void;
  /** F-24: unified history affordance. */
  historyOpen: boolean;
  history: HistoryHandle;
  onHistoryClose(): void;
}) {
  const search = useQuickSearch(props.manager, props.activePath, props.ctrlRef);
  const store = useSnapshotStore();
  const versions = props.manager.versions;
  return (
    <>
      {props.historyOpen && (
        <HistoryMenu
          entries={props.history.entries}
          canUndo={props.history.canUndo}
          canRedo={props.history.canRedo}
          onUndo={() => props.history.undo(false)}
          onRedo={() => props.history.redo(false)}
          onClose={props.onHistoryClose}
        />
      )}
      {props.clearOpen && (
        <ClearDataDialog
          storageKind={props.manager.storageKind}
          onConfirm={props.clearData}
          onCancel={props.onClearCancel}
        />
      )}
      {props.iconsOpen && props.iconDoc !== null && (
        <IconManagerDialog
          doc={props.iconDoc}
          onCommit={props.onIconsCommit}
          onClose={props.onIconsClose}
        />
      )}
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
          <button type="button" onClick={props.onFlashDismiss}>{s("dismiss")}</button>
        </div>
      )}
      {search.open && <SearchDialog entries={search.entries} onPick={search.onPick} onClose={search.close} />}
      {props.snapsOpen && store !== null && (
        <SnapshotsDialog
          snapshots={() => store.list()}
          onSave={(n) => store.save(n, props.manager.record()).then(() => undefined)}
          onRestore={(rec: SnapshotRecord) => {
            props.resyncDocuments();
            props.manager.restoreRecord(rec.ws);
          }}
          onDelete={(id) => store.delete(id)}
          onClose={props.onSnapsClose}
        />
      )}
      {props.versionsOpen && versions !== null && (
        <VersionHistoryDialog
          store={versions}
          onRestore={async (id) => {
            await props.manager.restoreVersion(id);
            props.resyncDocuments();
          }}
          onClose={props.onVersionsClose}
        />
      )}
    </>
  );
}
