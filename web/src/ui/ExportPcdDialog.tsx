// SPDX-License-Identifier: GPL-3.0-only
// Export choice dialog (bugs.md linked vs embedded export). The safe, familiar
// option is focused first; both choices explain what the downloaded file needs.
import { useEffect, useRef } from 'preact/hooks';
import type { Diagnostic } from '../engine/format/diagnostics';
import { s } from './strings';

export interface ExportPcdDialogProps {
  diagnostics: Diagnostic[];
  changed: boolean;
  onKeep: () => void;
  onEmbed: () => void;
  onCancel: () => void;
}

export function ExportPcdDialog(props: ExportPcdDialogProps) {
  const keepRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);
  return (
    <div
      class="dialog-overlay"
      data-testid="export-choice-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={s('Export decomposition')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onCancel();
      }}
    >
      <div class="dialog">
        <h2 class="dialog-title">{s('Export decomposition')}</h2>
        {props.changed && (
          <p class="prop-problem" role="alert" data-testid="export-choice-changed">
            {s('The document changed while this dialog was open. Reopen export and choose again.')}
          </p>
        )}
        {props.diagnostics.length > 0 && (
          <div role="alert" data-testid="export-choice-diagnostics">
            <p class="prop-problem">{s('Nothing was downloaded. Fix the listed descendants, then try again.')}</p>
            <ul class="muted">
              {props.diagnostics.map((d, i) => (
                <li key={`${d.code}-${i}`} data-testid={`export-diagnostic-${d.code}`}>
                  {d.code}: {d.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div class="dialog-actions">
          <button
            ref={keepRef}
            type="button"
            data-testid="export-keep-linked"
            title={s("Keep the root's linked paths. The child files are required to open it.")}
            onClick={props.onKeep}
          >
            {s('Keep linked decomposition')}
          </button>
          <button
            type="button"
            data-testid="export-embed-all"
            title={s('Embed every transitively reachable child in one portable file.')}
            onClick={props.onEmbed}
          >
            {s('Embed all decomposition')}
          </button>
          <button type="button" data-testid="export-choice-cancel" onClick={props.onCancel}>
            {s('Cancel')}
          </button>
        </div>
        <p class="muted">
          {s("Keep the root's linked paths. The child files are required to open it.")}{' '}
          {s('Embed every transitively reachable child in one portable file.')}
        </p>
      </div>
    </div>
  );
}
