// SPDX-License-Identifier: GPL-3.0-only
// FR-S4 clear-data dialog: destructive wipe requires typing DELETE (no
// browser-native confirm() — keeps flows scriptable and styleable).
import { useState } from 'preact/hooks';

export interface ClearDataDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ClearDataDialog({ onConfirm, onCancel }: ClearDataDialogProps) {
  const [text, setText] = useState('');
  return (
    <div class="dialog-overlay" data-testid="clear-dialog" role="dialog" aria-modal="true" aria-label="Clear stored data">
      <div class="dialog">
        <h2 class="dialog-title">Clear all workspace data?</h2>
        <p class="dialog-text">
          This deletes every file in the workspace and the autosaved copy in
          browser storage. Type <code>DELETE</code> to confirm (FR-S4).
        </p>
        <input
          data-testid="clear-confirm-input"
          value={text}
          placeholder="DELETE"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div class="dialog-actions">
          <button type="button" data-testid="clear-cancel" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            class="tb-danger"
            data-testid="clear-confirm-btn"
            disabled={text !== 'DELETE'}
            onClick={onConfirm}
          >
            Delete everything
          </button>
        </div>
      </div>
    </div>
  );
}
