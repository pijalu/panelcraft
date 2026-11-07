// SPDX-License-Identifier: GPL-3.0-only
// Code view editor (M4-WP1/WP2/WP3) — thin CodeMirror 6 adapter over the
// SyncMachine (web/src/ui/codeview/sync.ts) and the engine diagnostics. The
// machine is owned by the App shell (useCodeSync); the component owns no sync
// logic: it forwards editor→machine textChanged (mermaid pastes convert to
// PDL first, D-M4-4), machine→editor buffer writes (echo-suppressed inside
// the machine), and maps parser line:col diagnostics to CM lint marks + a
// problems list (FR-K3).
import { useEffect, useRef, useState } from 'preact/hooks';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, type Diagnostic as CmDiagnostic, lintGutter } from '@codemirror/lint';
import type { SyncMachine, SyncSnapshot } from './sync';
import { mermaidToPdl } from './mermaidPaste';
import { pdlStreamLanguage } from './pdlMode';
import { pcTheme, pcHighlightExtension } from './cmTheme';

export interface CodeEditorProps {
  /** The App-owned sync machine (single source of sync truth). */
  machine: SyncMachine;
}

/** Editor pane + problems panel for the active file. */
export function CodeEditor({ machine }: CodeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const [snap, setSnap] = useState<SyncSnapshot>(() => machine.snapshot());

  // Machine → editor buffer (echo-suppressed inside the machine).
  useEffect(
    () =>
      machine.subscribe((s) => {
        setSnap(s);
        const v = view.current;
        if (v !== null && v.state.doc.toString() !== s.codeText) {
          v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: s.codeText } });
        }
      }),
    [machine],
  );

  // Editor construction (once per machine).
  useEffect(() => {
    /** Mermaid pastes convert before entering the machine (D-M4-4). */
    const onDocChanged = (text: string): void => {
      const pdl = mermaidToPdl(text);
      if (pdl !== null && pdl !== text) {
        view.current?.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: pdl } });
        return; // the PDL dispatch re-enters here and feeds the machine
      }
      machine.textChanged(pdl ?? text);
    };

    function lintSource(): CmDiagnostic[] {
      const s = machine.snapshot();
      return s.diagnostics.map((d) => ({
        from: posToOffset(s.codeText, d.line, d.col),
        to: Math.min(posToOffset(s.codeText, d.line, d.col) + 1, s.codeText.length),
        severity: d.severity === 'warning' ? 'warning' : 'error',
        message: `${d.code}: ${d.message}`,
      }));
    }

    const state = EditorState.create({
      doc: machine.snapshot().codeText,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        highlightSelectionMatches(),
        keymap.of([
          { key: 'Shift-Alt-f', run: () => { machine.formatNow(); return true; } },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        pdlStreamLanguage,
        pcTheme,
        pcHighlightExtension,
        // N5: the editable content region needs an accessible name
        EditorView.contentAttributes.of({ 'aria-label': 'Diagram source (PDL)' }),
        lintGutter(),
        linter(lintSource),
        EditorView.updateListener.of((u) => onDocChanged(u.state.doc.toString())),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [machine]);

  return (
    <div class="code-view" data-testid="code-view" data-sync-state={snap.state}>
      <div class="code-editor-host" ref={host} />
      <ProblemsPanel snapshot={snap} />
    </div>
  );
}

/** line:col (1-based) → string offset for CM marks (WP3). */
export function posToOffset(text: string, line: number, col: number): number {
  const lines = text.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    off += (lines[i]?.length ?? 0) + 1;
  }
  const lineText = lines[Math.min(line - 1, lines.length - 1)] ?? '';
  return Math.min(off + Math.max(0, col - 1), off + lineText.length);
}

/** FR-K3 problems panel: list of diagnostics, click → focus the line. */
export function ProblemsPanel({ snapshot }: { snapshot: SyncSnapshot | null }) {
  if (snapshot === null || snapshot.diagnostics.length === 0) {
    return (
      <div class="problems" data-testid="problems-empty">
        {snapshot?.state === 'error' ? 'no diagnostics' : ''}
      </div>
    );
  }
  return (
    <div class="problems" data-testid="problems" role="listbox" aria-label="Problems">
      {snapshot.diagnostics.map((d, i) => (
        <button
          key={i}
          type="button"
          role="option"
          class={`problem problem-${d.severity}`}
          data-testid="problem-item"
          aria-selected="false"
          onClick={() => focusLine(d.line)}
        >
          <span class="problem-loc">{d.line}:{d.col}</span>
          <span class="problem-code">{d.code ?? ''}</span>
          <span class="problem-msg">{d.message ?? ''}</span>
        </button>
      ))}
    </div>
  );
}

function focusLine(line: number): void {
  const el = document.querySelector<HTMLElement>(`.cm-line:nth-child(${line})`);
  el?.scrollIntoView({ block: 'center' });
}
