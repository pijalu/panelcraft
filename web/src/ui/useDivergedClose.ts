// SPDX-License-Identifier: GPL-3.0-only
// Diverged-buffer close guard (M4-WP4, FR-K5): intercepts tab closes whose
// editor buffer diverged from the saved file and drives the apply/discard/
// cancel prompt. The file is the source of truth — Apply formats + applies
// the buffer (FR-K4; parse failures keep the prompt open in its error
// state), Discard closes keeping the file untouched.
import { useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import type { SyncMachine, SyncSnapshot } from './codeview/sync';

export interface DivergedCloseHandle {
  /** Tab-close interceptor for <Tabs onClose>. */
  requestCloseTab: (i: number) => void;
  /** Dialog props when a close is awaiting the user's decision, else null. */
  prompt: {
    path: string;
    parseError: string | null;
    onApply: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  } | null;
}

export function useDivergedClose(deps: {
  manager: WorkspaceManager;
  activePath: string | null;
  machine: SyncMachine;
  snapshot: SyncSnapshot;
}): DivergedCloseHandle {
  const { manager, activePath, machine, snapshot } = deps;
  const [target, setTarget] = useState<number | null>(null);

  const requestCloseTab = (i: number): void => {
    const tab = manager.tabs.tabs[i];
    if (!tab) return;
    if (tab.path === activePath && snapshot.divergedFromSaved) {
      setTarget(i);
      return;
    }
    manager.closeTabAt(i);
  };

  const closeNow = (): void => {
    if (target !== null) manager.closeTabAt(target);
    setTarget(null);
  };

  const applyAndClose = (): void => {
    machine.formatNow();
    // on success the canvas+file converged synchronously (saveCanvas inside
    // the apply port); on failure the machine is in `error` and we stay.
    if (machine.snapshot().state !== 'error') closeNow();
  };

  const firstDiag = snapshot.state === 'error' ? snapshot.diagnostics[0] : undefined;
  const prompt =
    target === null
      ? null
      : {
          path: manager.tabs.tabs[target]?.path ?? '',
          parseError: firstDiag !== undefined ? (firstDiag.message ?? '') : null,
          onApply: applyAndClose,
          onDiscard: closeNow,
          onCancel: () => setTarget(null),
        };

  return { requestCloseTab, prompt };
}
