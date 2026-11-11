// SPDX-License-Identifier: GPL-3.0-only
// Code pane (M4-WP1/WP3): header (title, sync-state chip, Format button) +
// the CodeMirror editor. Presentational — all sync logic lives in the
// machine (codeview/sync.ts) and its App-side wiring (useCodeSync.ts).
import type { SyncMachine, SyncSnapshot } from './codeview/sync';
import { CodeEditor } from './codeview/CodeEditor';
import { CollapseButton } from './PanelChrome';
import { s } from './strings';

export interface CodePaneProps {
  machine: SyncMachine;
  snapshot: SyncSnapshot;
  /** Format button / Shift-Alt-F hook (FR-K4). */
  onFormat: () => void;
  /** F-10: collapse into the sync-state rail. */
  onCollapse?: () => void;
  /** F-22: canvas ↔ code mapping hooks. */
  revealRef?: { current: ((id: string) => void) | null };
  onCaretObject?: (id: string | null) => void;
}

/** Split-pane code view for the active file. */
export function CodePane({ machine, snapshot, onFormat, onCollapse, revealRef, onCaretObject }: CodePaneProps) {
  return (
    <section class="code-pane" data-testid="code-pane" aria-label={s('Code view')}>
      <header class="code-pane-head">
        <span class="panel-title">{s('Code')}</span>
        <span
          class="muted"
          data-testid="sync-state"
          data-sync-state={snapshot.state}
          data-diverged={String(snapshot.divergedFromSaved)}
        >
          {snapshot.state}
        </span>
        {onCollapse && <CollapseButton id="code" label={s('code')} onCollapse={onCollapse} />}
        <button
          type="button"
          class="code-pane-btn"
          data-testid="format-code"
          title={s('Format the PDL buffer (Shift+Alt+F)')}
          onClick={onFormat}
        >
          {s('Format')}
        </button>
      </header>
      <CodeEditor machine={machine} revealRef={revealRef} onCaretObject={onCaretObject} />
    </section>
  );
}
