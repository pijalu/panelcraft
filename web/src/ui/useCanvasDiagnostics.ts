// SPDX-License-Identifier: GPL-3.0-only
// Canvas diagnostics (F-23/D10): while the buffer has parse errors the canvas
// keeps the last good render but rings the offending objects and shows a banner,
// instead of silently disagreeing with the code view.
import { useEffect, useState } from 'preact/hooks';
import type { Diagnostic } from '../engine/format/diagnostics';
import { objectAtLine } from '../engine/format/spans';
import type { CanvasController } from './CanvasController';

export interface CanvasDiagnostics {
  /** Objects whose statement is currently invalid. */
  errorIds: string[];
  /** True when the canvas shows a stale (last-good) render. */
  stale: boolean;
  /** Number of problems reported by the parser. */
  count: number;
}

/**
 * Objects to ring for `diagnostics`: the declaration on the reported line, else
 * the closest declaration above it (a broken attribute is reported on the line
 * that follows the object it belongs to).
 */
function ringTargets(text: string, diagnostics: Diagnostic[]): string[] {
  const ids = new Set<string>();
  for (const d of diagnostics) {
    // Statements are line-based, so an error reported at column 1 of a line
    // means the *previous* statement is incomplete ("expected arrow, got ...").
    const target = d.col === 1 && d.line > 1 ? d.line - 1 : d.line;
    for (let line = target; line >= 1; line -= 1) {
      const id = objectAtLine(text, line);
      if (id !== null) {
        ids.add(id);
        break;
      }
    }
  }
  return [...ids];
}

export function useCanvasDiagnostics(
  text: string,
  diagnostics: Diagnostic[],
  state: 'clean' | 'editing' | 'error' | 'pending-apply',
  ctrlRef: { current: CanvasController | null },
  version = 0,
): CanvasDiagnostics {
  const [info, setInfo] = useState<CanvasDiagnostics>({ errorIds: [], stale: false, count: 0 });

  useEffect(() => {
    const errorIds = state === 'error' ? ringTargets(text, diagnostics) : [];
    ctrlRef.current?.setErrors(errorIds);
    setInfo({ errorIds, stale: state === 'error', count: state === 'error' ? diagnostics.length : 0 });
    // `version` re-applies the rings after any re-render or controller rebuild.
  }, [text, diagnostics, state, ctrlRef, version]);

  return info;
}
