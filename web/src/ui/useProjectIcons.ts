// SPDX-License-Identifier: GPL-3.0-only
// Project-icon wiring for the shell (IR v9, FILE-FORMAT §3.1).
//
// Keeps App readable: it owns the *document* half of icons (what the open file
// declares, and committing a change to it) while the picker and manager own the
// UI. Every commit is pushed to the canvas history as one entry, so undoing a
// rename restores all of its references in a single step.
import { useMemo, useState } from 'preact/hooks';
import type { CanvasController } from './CanvasController';
import type { WorkspaceManager } from '../workspace/workspace';
import { parsePDL } from '../engine/format/parser';
import type { Doc, IconDecl } from '../engine/model/types';

export interface ProjectIconsHandle {
  /** Declarations of the open file (empty when nothing parses). */
  projectIcons: IconDecl[];
  /** Full parsed document, or `null` when the file does not parse. */
  doc: Doc | null;
  managerOpen: boolean;
  openManager(): void;
  closeManager(): void;
  /** Commit one atomic, undoable icon change. */
  commit(next: Doc, label: string): void;
}

export function useProjectIcons(deps: {
  activePath: string | null;
  manager: WorkspaceManager;
  /** Bumped on every workspace mutation (file text changes). */
  version: number;
  /** Change tick from the code-sync machine (buffer edits). */
  revision: unknown;
  ctrlRef: { current: CanvasController | null };
  commitDoc: (doc: Doc) => void;
}): ProjectIconsHandle {
  const { activePath, manager, version, revision, ctrlRef, commitDoc } = deps;
  const doc = useMemo<Doc | null>(() => {
    const text = activePath === null ? '' : manager.text(activePath);
    return parsePDL(text).doc;
  }, [activePath, manager, version, revision]);
  const [managerOpen, setManagerOpen] = useState(false);
  const commit = (next: Doc, label: string): void => {
    const ctrl = ctrlRef.current;
    if (doc === null || ctrl === null) return;
    // push first: the history entry must describe the change the write makes
    ctrl.pushDocCommand(label, commitDoc, doc, next);
    commitDoc(next);
  };
  return {
    projectIcons: doc?.icons ?? [],
    doc,
    managerOpen,
    openManager: () => setManagerOpen(true),
    closeManager: () => setManagerOpen(false),
    commit,
  };
}
