// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13: the shell's presentation launcher state. Kept out of App so the
// shell stays inside the function-length gate; parsing happens only while the
// launcher is open (the catalog is derived from the active file's text).
import { useCallback, useState } from 'preact/hooks';
import { flowCatalog, type FlowEntry } from './flows/flowCatalog';
import { parsePDL } from '../engine/format/parser';
import type { Doc } from '../engine/model/types';

export interface PresentLauncherHandle {
  open: boolean;
  entries: FlowEntry[];
  /** Open the launcher (header button + application menu). */
  show(): void;
  close(): void;
  /** Present a flow by its catalog key. */
  present(key: string): void;
}

export interface PresentLauncherDeps {
  activePath: string | null;
  /** File text lookup (workspace adapter); null when the file is absent. */
  textOf(path: string): string | null;
  /** Start playback of `flowKey` in the active file and enter presentation. */
  start(flowKey: string): void;
}

/** Parse for the catalog; a broken file simply presents nothing. */
function catalogOf(deps: PresentLauncherDeps): Doc | null {
  const path = deps.activePath;
  if (path === null) return null;
  const text = deps.textOf(path);
  if (text === null) return null;
  try {
    return parsePDL(text).doc;
  } catch {
    return null;
  }
}

export function usePresentLauncher(deps: PresentLauncherDeps): PresentLauncherHandle {
  const [open, setOpen] = useState(false);
  const entries = open ? flowCatalog(catalogOf(deps)) : [];
  const present = useCallback(
    (key: string) => {
      deps.start(key);
      setOpen(false);
    },
    [deps],
  );
  return {
    open,
    entries,
    show: () => setOpen(true),
    close: () => setOpen(false),
    present,
  };
}
