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
import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, type Diagnostic as CmDiagnostic, lintGutter } from '@codemirror/lint';
import type { SyncMachine, SyncSnapshot } from './sync';
import { mermaidToPdl } from './mermaidPaste';
import { pdlStreamLanguage } from './pdlMode';
import { pcTheme, pcHighlightExtension } from './cmTheme';
import { minimalChange, trailingWhitespaceOnly } from './diff';
import { objectAtLine, spanOf } from '../../engine/format/spans';
import { highlightExtension, setHighlight } from './highlight';
import { codePorts } from '../codePorts';
import { s } from '../strings';

// Panel docking can move the editor to a new DOM parent. Retain its state so
// that collapse/expand does not silently discard document undo/redo history.
const editorStates = new WeakMap<SyncMachine, EditorState>();
// A dock replacement mounts before its predecessor's cleanup; use the live state.
const activeEditors = new WeakMap<SyncMachine, EditorView>();

export interface CodeEditorProps {
  /** The App-owned sync machine (single source of sync truth). */
  machine: SyncMachine;
  /** F-22: the editor installs a `reveal(id)` here (canvas → code highlight). */
  revealRef?: { current: ((id: string) => void) | null };
  /** F-22: caret moved onto an object's statement (code → canvas select). */
  onCaretObject?: (id: string | null) => void;
}

/** Editor pane + problems panel for the active file. */
export function CodeEditor({ machine, revealRef, onCaretObject }: CodeEditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  /** True while the editor applies a machine write — those are not user edits
   * (F-30: feeding them back made the machine believe it was being typed into). */
  const projecting = useRef(false);
  const [snap, setSnap] = useState<SyncSnapshot>(() => machine.snapshot());

  // Machine → editor buffer (echo-suppressed inside the machine).
  useEffect(
    () =>
      machine.subscribe((s) => {
        setSnap(s);
        const v = view.current;
        if (v === null) return;
        const current = v.state.doc.toString();
        if (current === s.codeText) return;
        // F-03/F-04: minimal diff + mapped selection. A full-document replace
        // dropped the caret to offset 0 on every machine write; an incoming
        // text that differs only in trailing whitespace needs no dispatch.
        if (trailingWhitespaceOnly(current, s.codeText)) return;
        const change = minimalChange(current, s.codeText);
        if (change.from === change.to && change.insert === '') return;
        // No explicit selection: CodeMirror maps it through the change. Isolate the
        // machine write from earlier edits; flow edits already coalesce upstream.
        projecting.current = true;
        const hadFocus = v.hasFocus;
        v.dispatch({ changes: change, scrollIntoView: false, annotations: isolateHistory.of('before') });
        projecting.current = false;
        // F-30: a programmatic write can leave CodeMirror believing it lost
        // focus, which silently disables its keymap (Ctrl+A, undo, search).
        // Re-assert focus when the editor was the focused element.
        if (hadFocus && !v.hasFocus) v.focus();
      }),
    [machine],
  );

  // Editor construction (once per machine).
  useEffect(() => {
    /** Mermaid pastes convert before entering the machine (D-M4-4). */
    const onDocChanged = (text: string, currentView: EditorView): void => {
      const pdl = mermaidToPdl(text);
      if (pdl !== null && pdl !== text) {
        currentView.dispatch({ changes: { from: 0, to: currentView.state.doc.length, insert: pdl } });
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

    const extensions = [
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
      // Accessibility: the editable content region needs an accessible name.
      EditorView.contentAttributes.of({
        'aria-label': s('Diagram source (PDL)'),
        tabindex: '0', // scrollable CodeMirror region retains keyboard access
      }),
      lintGutter(),
      linter(lintSource),
      EditorView.updateListener.of((u) => onDocChanged(u.state.doc.toString(), u.view)),
      highlightExtension,
    ];
    const state = activeEditors.get(machine)?.state ?? editorStates.get(machine) ?? EditorState.create({
      doc: machine.snapshot().codeText,
      extensions,
    });
    const v = new EditorView({ state, parent: host.current! });
    activeEditors.set(machine, v); view.current = v;
    const current = machine.snapshot().codeText;
    if (state.doc.toString() !== current) {
      v.dispatch({ changes: minimalChange(state.doc.toString(), current) });
    }
    // F-22 canvas → code: select the entity's statement lines
    // F-24: undo/redo through the editor's own history command.
    const undoCode = () => undo(v);
    const redoCode = () => redo(v);
    codePorts.undo = undoCode; codePorts.redo = redoCode;
    const reveal = (id: string): void => {
      const text = v.state.doc.toString();
      const span = spanOf(text, id);
      if (span === null) return;
      const from = posToOffset(text, span.from, 1);
      const to = Math.max(from, posToOffset(text, span.to + 1, 1) - 1);
      v.dispatch({
        effects: [
          setHighlight.of({ from, to }),
          EditorView.scrollIntoView(from, { y: 'center' }),
        ],
      });
    };
    if (revealRef) revealRef.current = reveal;
    // F-22 code → canvas: the object under the caret (only while focused)
    if (onCaretObject) {
      const report = (): void => {
        if (!v.hasFocus) return;
        const line = v.state.doc.lineAt(v.state.selection.main.head).number;
        onCaretObject(objectAtLine(v.state.doc.toString(), line));
      };
      v.dom.addEventListener('keyup', report);
      v.dom.addEventListener('mouseup', report);
    }
    return () => {
      if (activeEditors.get(machine) === v) {
        editorStates.set(machine, v.state); activeEditors.delete(machine);
      }
      // A dock move can mount the replacement before this cleanup runs. Only
      // clear ports still owned by this editor, not the replacement's ports.
      if (codePorts.undo === undoCode) codePorts.undo = null;
      if (codePorts.redo === redoCode) codePorts.redo = null;
      if (revealRef?.current === reveal) revealRef.current = null;
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
        {snapshot?.state === 'error' ? s('no diagnostics') : ''}
      </div>
    );
  }
  return (
    <div class="problems" data-testid="problems" role="listbox" aria-label={s("Problems")}>
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
          <span class="problem-loc">{d.line}{s(":")}{d.col}</span>
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
