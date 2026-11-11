// SPDX-License-Identifier: GPL-3.0-only
import { s } from './strings';
// Diverged-buffer close prompt (M4-WP4, FR-K5): the saved file is the source
// of truth; closing a file whose editor buffer diverged from it offers
// Apply (format + apply + close), Discard (keep the file, drop the buffer)
// and Cancel. Apply is blocked while the buffer does not parse (FR-K4: the
// canonical print is the only thing we may save).
export interface DivergedDialogProps {
  path: string;
  /** Parse error message when the buffer cannot be applied (null = valid). */
  parseError: string | null;
  onApply: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

/** Modal: unsaved code-buffer changes on tab close. */
export function DivergedDialog({ path, parseError, onApply, onDiscard, onCancel }: DivergedDialogProps) {
  return (
    <div class="dialog-overlay" data-testid="diverged-dialog">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-label={s("Unsaved code changes")}>
        <h2 class="dialog-title">{s("Unsaved code changes")}</h2>
        <p class="dialog-text">
          {s("The editor buffer of")}{' '}<code>{path}</code> {s("differs from the saved file. Apply the buffer to the file, or discard it?")}{' '}</p>
        {parseError !== null && (
          <p class="dialog-text banner-error" data-testid="diverged-error" role="alert">
            {s("Cannot apply: the buffer does not parse.")}{' '}{parseError}
          </p>
        )}
        <div class="dialog-actions">
          <button type="button" data-testid="diverged-apply" onClick={onApply} disabled={parseError !== null}>
            {s("Apply")}{' '}</button>
          <button type="button" data-testid="diverged-discard" onClick={onDiscard}>
            {s("Discard")}{' '}</button>
          <button type="button" data-testid="diverged-cancel" onClick={onCancel}>
            {s("Cancel")}{' '}</button>
        </div>
      </div>
    </div>
  );
}
