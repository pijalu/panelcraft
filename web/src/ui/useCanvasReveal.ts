// SPDX-License-Identifier: GPL-3.0-only
// Canvas → code reveal (F-22): a single-object canvas selection highlights that
// statement in the code view. The editor installs the port (it owns the buffer).
import { useEffect, useRef } from 'preact/hooks';
import type { Snapshot } from './CanvasController';

/** Owns the reveal port and drives it from the canvas selection. */
export function useCanvasRevealPort(snap: Snapshot | null): { current: ((id: string) => void) | null } {
  const revealRef = useRef<((id: string) => void) | null>(null);
  useCanvasReveal(snap, revealRef);
  return revealRef;
}

export function useCanvasReveal(
  snap: Snapshot | null,
  revealRef: { current: ((id: string) => void) | null },
): void {
  const selected = snap?.selection.objects ?? [];
  const key = selected.length === 1 ? selected[0]! : '';
  useEffect(() => {
    if (key === '') return;
    revealRef.current?.(key);
  }, [key, revealRef]);
}
