// SPDX-License-Identifier: GPL-3.0-only
// Shell dialog state (clear workspace, snapshot picker, transient flash message).
// Kept in one hook so `App` stays inside the function-length gate and the three
// independent modals cannot drift into ad-hoc state names.
import { useState } from 'preact/hooks';

export interface ShellDialogsHandle {
  clearOpen: boolean;
  setClearOpen(on: boolean): void;
  snapsOpen: boolean;
  setSnapsOpen(on: boolean): void;
  /** Transient status message (shown by the banner layer). */
  flash: string | null;
  setFlash(msg: string | null): void;
}

export function useShellDialogs(): ShellDialogsHandle {
  const [clearOpen, setClearOpen] = useState(false);
  const [snapsOpen, setSnapsOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  return { clearOpen, setClearOpen, snapsOpen, setSnapsOpen, flash, setFlash };
}
