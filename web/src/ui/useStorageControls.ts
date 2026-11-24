// SPDX-License-Identifier: GPL-3.0-only
// Storage controls seam: the Files panel and the application menu drive native
// folder selection, permission reconnect, and the explicit move back to browser
// storage. UI components hold no capability chain and no picker logic.
import { useState } from 'preact/hooks';
import { BrowserDirectoryStorage, pickDirectoryHandle, requestDirectoryPermission, supportsDirectoryPicker } from '../workspace/store/directory';
import type { AppStorage, NativeDirectoryCandidate } from '../workspace/store/selection';
import type { StorageKind } from '../workspace/store/port';
import type { WorkspaceManager } from '../workspace/workspace';

export interface StorageControls {
  /** Active backend kind, from the manager's attached port. */
  kind: StorageKind;
  nativeSupported: boolean;
  /** Label of a remembered folder awaiting a Reconnect click. */
  reconnect: string | null;
  openDirectory: () => void;
  reconnectDirectory: () => void;
  useBrowserStorage: () => void;
}

export interface StorageControlArgs {
  manager: WorkspaceManager;
  selection: AppStorage | null;
  reconnect: NativeDirectoryCandidate | null;
  setReconnect: (candidate: NativeDirectoryCandidate | null) => void;
  /** Rebuild both views after a successful backend switch. */
  onSwitched: () => void;
  /** User-visible failure text (existing flash slot). */
  onError: (message: string) => void;
}

/** Cancellation is not an error; anything else is reported and changes nothing. */
function report(action: () => Promise<void>, onError: (message: string) => void): void {
  void action().catch((error: unknown) => {
    if ((error as { name?: string }).name === 'AbortError') return;
    onError(error instanceof Error ? error.message : String(error));
  });
}

export function useStorageControls(args: StorageControlArgs): StorageControls {
  const { manager, selection, reconnect, setReconnect, onSwitched, onError } = args;
  const [pending, setPending] = useState(false);

  /** Select a directory, switch to it, and only then remember the handle. */
  const adopt = async (handle: FileSystemDirectoryHandle): Promise<void> => {
    setPending(true);
    try {
      await manager.switchStorage(new BrowserDirectoryStorage(handle));
      await selection?.remember(handle);
      setReconnect(null);
      onSwitched();
    } finally {
      setPending(false);
    }
  };

  const openDirectory = (): void => {
    if (pending) return;
    report(async () => {
      const handle = await pickDirectoryHandle();
      await adopt(handle);
    }, onError);
  };

  const reconnectDirectory = (): void => {
    if (pending || reconnect === null) return;
    report(async () => {
      const state = await requestDirectoryPermission(reconnect.handle);
      if (state !== 'granted') {
        onError('that folder could not be opened: permission was not granted');
        return;
      }
      await adopt(reconnect.handle);
    }, onError);
  };

  const useBrowserStorage = (): void => {
    if (pending || selection === null) return;
    report(async () => {
      await manager.switchStorage(await selection.browserPort());
      // Forget the handle only after the switch succeeded.
      await selection.forget();
      setReconnect(null);
      onSwitched();
    }, onError);
  };

  return {
    kind: manager.storageKind,
    nativeSupported: supportsDirectoryPicker(),
    reconnect: reconnect?.label ?? null,
    openDirectory,
    reconnectDirectory,
    useBrowserStorage,
  };
}
