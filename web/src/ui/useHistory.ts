// SPDX-License-Identifier: GPL-3.0-only
// Unified history wiring (F-24): one feed fed by the canvas command stack and
// the code machine, plus undo/redo routed to the surface that owns the action.
import { useCallback, useEffect, useState } from 'preact/hooks';
import { HistoryFeed, type HistoryEntry, undoSurface } from './historyFeed';
import { codePorts } from './codePorts';
import type { CanvasController } from './CanvasController';
import type { SyncSnapshot } from './codeview/sync';
import { s } from './strings';

export interface HistoryHandle {
  entries: HistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  undo: (focusInCode: boolean) => void;
  redo: (focusInCode: boolean) => void;
}

/**
 * @param ctrlRef  canvas controller ref (its UndoStack is observed)
 * @param snapshot machine snapshot (code edits + readiness signal)
 * @param ready    controller exists (re-subscribes when it appears)
 */
export function useHistory(
  ctrlRef: { current: CanvasController | null },
  snapshot: SyncSnapshot,
  ready: boolean,
  onToast: (msg: string) => void = () => {},
): HistoryHandle {
  const [feed] = useState(() => new HistoryFeed());
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [wasEditing, setWasEditing] = useState(false);

  // Canvas commands → feed. The stack is the single source (one row per push).
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (ctrl === null) return;
    ctrl.undo.setObserver((cmd) => {
      feed.record('canvas', cmd.label, cmd.coalesceKey);
      setEntries(feed.recent());
      setDepth({ undo: ctrl.undoDepth, redo: ctrl.redoDepth });
    });
    return () => ctrl.undo.setObserver(null);
  }, [ctrlRef, ready, feed]);

  // Code edits → feed. One row per typing burst (start of an 'editing' run).
  useEffect(() => {
    const editing = snapshot.state === 'editing';
    if (editing && !wasEditing) {
      feed.record('code', s('code edit'));
      setEntries(feed.recent());
    }
    setWasEditing(editing);
  }, [snapshot.state, wasEditing, feed]);

  const refresh = useCallback(() => {
    setEntries(feed.recent());
    const ctrl = ctrlRef.current;
    setDepth({ undo: ctrl?.undoDepth ?? 0, redo: ctrl?.redoDepth ?? 0 });
  }, [ctrlRef, feed]);

  const undo = useCallback(
    (focusInCode: boolean) => {
      const surface = undoSurface(focusInCode, feed.last);
      if (surface === 'code') codePorts.undo?.();
      else ctrlRef.current?.undoCommand();
      onToast(s('Undone: {label}', { label: feed.last?.label ?? s('change') }));
      refresh();
    },
    [ctrlRef, feed, refresh, onToast],
  );

  const redo = useCallback(
    (focusInCode: boolean) => {
      const surface = undoSurface(focusInCode, feed.last);
      if (surface === 'code') codePorts.redo?.();
      else ctrlRef.current?.redoCommand();
      onToast(s('Redone'));
      refresh();
    },
    [ctrlRef, feed, refresh, onToast],
  );

  return {
    entries,
    canUndo: depth.undo > 0 || entries.length > 0,
    canRedo: depth.redo > 0,
    undo,
    redo,
  };
}
