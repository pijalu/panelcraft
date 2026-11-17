// SPDX-License-Identifier: GPL-3.0-only
// Export choice wiring: the UI never walks the graph itself. The planner reads
// the workspace through a port, and a changed root invalidates the captured
// prompt instead of silently downloading a different edit.
import { useMemo, useState } from 'preact/hooks';
import type { Diagnostic } from '../engine/format/diagnostics';
import { hasLinkedDecomposition, planEmbeddedExport, type WorkspaceReader } from '../workspace/embed';
import type { WorkspaceManager } from '../workspace/workspace';
import { downloadText } from './download';
import { baseName } from './paths';

interface ExportChoice {
  root: string;
  captured: string;
  name: string;
}

export interface PcdExportHandle {
  choice: ExportChoice | null;
  diagnostics: Diagnostic[];
  changed: boolean;
  open(): void;
  keepLinked(): void;
  embedAll(): void;
  cancel(): void;
}

export function usePcdExport(
  manager: WorkspaceManager,
  activePath: string | null,
): PcdExportHandle {
  const [choice, setChoice] = useState<ExportChoice | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [changed, setChanged] = useState(false);
  const reader = useMemo<WorkspaceReader>(() => ({
    files: () => manager.snapshotTree().map((f) => ({ path: f.path, text: f.content })),
    text: (path) => (manager.hasFile(path) ? manager.text(path) : null),
  }), [manager]);

  const valid = (): boolean => {
    if (choice === null) return false;
    if (manager.exportText(choice.root, '.pcd') === choice.captured) return true;
    setChanged(true);
    setDiagnostics([]);
    return false;
  };

  return {
    choice,
    diagnostics,
    changed,
    open: () => {
      if (activePath === null) return;
      const captured = manager.exportText(activePath, '.pcd');
      setDiagnostics([]);
      setChanged(false);
      if (hasLinkedDecomposition(activePath, reader)) {
        setChoice({ root: activePath, captured, name: baseName(activePath) });
      } else {
        downloadText(captured, baseName(activePath));
      }
    },
    keepLinked: () => {
      if (!valid() || choice === null) return;
      downloadText(choice.captured, choice.name);
      setChoice(null);
    },
    embedAll: () => {
      if (!valid() || choice === null) return;
      const result = planEmbeddedExport(choice.root, reader);
      if (!result.ok) {
        setDiagnostics(result.diagnostics);
        return;
      }
      downloadText(result.plan.text, choice.name);
      setChoice(null);
    },
    cancel: () => {
      setChoice(null);
      setDiagnostics([]);
      setChanged(false);
    },
  };
}
