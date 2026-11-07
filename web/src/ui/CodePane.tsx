// SPDX-License-Identifier: GPL-3.0-only
// Code pane (M4-WP1/WP3): header (title, sync-state chip, Format button) +
// the CodeMirror editor. Presentational — all sync logic lives in the
// machine (codeview/sync.ts) and its App-side wiring (useCodeSync.ts).
import type { SyncMachine, SyncSnapshot } from './codeview/sync';
import { CodeEditor } from './codeview/CodeEditor';
import { CollapseButton } from './PanelChrome';

export interface CodePaneProps {
  machine: SyncMachine;
  snapshot: SyncSnapshot;
  /** Format button / Shift-Alt-F hook (FR-K4). */
  onFormat: () => void;
  /** F-10: collapse into the sync-state rail. */
  onCollapse?: () => void;
}

/** Split-pane code view for the active file. */
export function CodePane({ machine, snapshot, onFormat, onCollapse }: CodePaneProps) {
  return (
    <section class="code-pane" data-testid="code-pane" aria-label="Code view">
      <header class="code-pane-head">
        <span class="panel-title">Code</span>
        <span
          class="muted"
          data-testid="sync-state"
          data-sync-state={snapshot.state}
          data-diverged={String(snapshot.divergedFromSaved)}
        >
          {snapshot.state}
        </span>
        {onCollapse && <CollapseButton id="code" label="code" onCollapse={onCollapse} />}
        <button
          type="button"
          class="code-pane-btn"
          data-testid="format-code"
          title="Format the PDL buffer (Shift+Alt+F)"
          onClick={onFormat}
        >
          Format
        </button>
      </header>
      <CodeEditor machine={machine} />
    </section>
  );
}
