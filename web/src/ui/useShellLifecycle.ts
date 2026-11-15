// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: the shell's lifecycle concerns in one place — the diverged-buffer
// close guard and the install/update lifecycle. Both need the same facts (the
// active file, whether its buffer is unapplied, whether playback is running), and
// the App body stays a layout component.
import type { WorkspaceManager } from '../workspace/workspace';
import type { SyncMachine, SyncSnapshot } from './codeview/sync';
import { useDivergedClose } from './useDivergedClose';
import { useShellPwa, type PwaHandle } from './usePwa';

export interface ShellLifecycleDeps {
  manager: WorkspaceManager;
  activePath: string | null;
  machine: SyncMachine;
  snapshot: SyncSnapshot;
  /** A presentation or flow playback is running. */
  busy: boolean;
  onFlash: (message: string) => void;
}

export interface ShellLifecycle {
  diverged: ReturnType<typeof useDivergedClose>;
  pwa: PwaHandle;
}

export function useShellLifecycle(deps: ShellLifecycleDeps): ShellLifecycle {
  const diverged = useDivergedClose({
    manager: deps.manager,
    activePath: deps.activePath,
    machine: deps.machine,
    snapshot: deps.snapshot,
  });
  const pwa = useShellPwa({
    flush: () => deps.manager.flush(),
    // "Unapplied" means the buffer holds edits that never reached the document
    // (typing or a parse error), not merely "differs from the file on disk".
    divergedPath:
      deps.snapshot.state === 'editing' || deps.snapshot.state === 'error'
        ? deps.activePath
        : null,
    busy: deps.busy,
    onFlash: deps.onFlash,
  });
  return { diverged, pwa };
}
