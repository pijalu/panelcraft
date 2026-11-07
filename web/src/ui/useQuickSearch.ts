// SPDX-License-Identifier: GPL-3.0-only
// M6-WP5 quick search (FR-W6): global Ctrl/Cmd+P state, index build over the
// workspace tree, and jump-to selection (open file, then reveal the object).
import { useEffect, useState } from 'preact/hooks';
import { buildIndex, type SearchEntry } from './search/searchIndex';
import type { CanvasController } from './CanvasController';
import type { WorkspaceManager } from '../workspace/workspace';

export interface QuickSearch {
  open: boolean;
  entries: SearchEntry[];
  onPick(entry: SearchEntry): void;
  close(): void;
}

export function useQuickSearch(
  manager: WorkspaceManager,
  activePath: string | null,
  ctrlRef: { current: CanvasController | null },
): QuickSearch {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'p') {
        ev.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const entries = open ? buildIndex(manager.snapshotTree()) : [];
  const onPick = (entry: SearchEntry): void => {
    if (entry.path !== activePath) {
      manager.openFile(entry.path);
      if (entry.id === undefined) return; // file pick: opening is the jump
      // object reveal lands after the canvas loads the new file; defer
      setTimeout(() => ctrlRef.current?.reveal(entry.id!), 0);
    } else if (entry.id !== undefined) {
      ctrlRef.current?.reveal(entry.id);
    }
    setOpen(false);
  };
  return { open, entries, onPick, close: () => setOpen(false) };
}
