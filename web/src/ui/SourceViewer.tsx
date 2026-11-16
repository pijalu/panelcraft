// SPDX-License-Identifier: GPL-3.0-only
// Embedded source viewer/editor (IR v10, FILE-FORMAT.md §3.3).
//
// The text is shown, never executed: it is printed into a text node, so a
// `<script>` in the source is visible text like any other character. Nothing is
// fetched and nothing leaves browser storage — the buffer lives in the document.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Obj, SourceBlock } from '../engine/model/types';
import {
  SOURCE_MAX_OBJECT_BYTES, SOURCE_MAX_OBJECT_LINES,
} from '../engine/model/hierarchy';
import { s } from './strings';

export interface SourceViewerProps {
  /** The object whose source is being viewed or edited. */
  obj: Obj;
  /** Save (one undoable document command) or remove the block (`null`). */
  onSave: (source: SourceBlock | null) => void;
  onClose: () => void;
}

const textOf = (source: SourceBlock | undefined): string => (source?.lines ?? []).join('\n');

/**
 * `Draft` is the editable state: the textarea text plus an optional language.
 * Splitting happens on save so a trailing newline the author typed survives as
 * one more (empty) source line instead of being silently normalised.
 */
function draftBlock(text: string, language: string): SourceBlock {
  const lines = text.split('\n');
  const trimmed = language.trim();
  return trimmed === '' ? { lines } : { language: trimmed, lines };
}

/** Why the draft cannot be saved yet (empty text is allowed to mean "no source"). */
function draftProblem(text: string): string | null {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SOURCE_MAX_OBJECT_BYTES) {
    return s('Source is {n} bytes; the limit is {limit}.', {
      n: String(bytes),
      limit: String(SOURCE_MAX_OBJECT_BYTES),
    });
  }
  const lines = text.split('\n').length;
  if (lines > SOURCE_MAX_OBJECT_LINES) {
    return s('Source is {n} lines; the limit is {limit}.', {
      n: String(lines),
      limit: String(SOURCE_MAX_OBJECT_LINES),
    });
  }
  return null;
}

export function SourceViewer({ obj, onSave, onClose }: SourceViewerProps) {
  const initial = obj.source;
  const [editing, setEditing] = useState(initial === undefined);
  const [text, setText] = useState(textOf(initial));
  const [language, setLanguage] = useState(initial?.language ?? '');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const head = obj.name ?? obj.id;
  const problem = draftProblem(text);

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  const save = (): void => {
    if (problem !== null) return;
    onSave(text.trim() === '' ? null : draftBlock(text, language));
    onClose();
  };

  return (
    <div
      class="dialog-overlay"
      data-testid="source-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={s('Embedded source of {label}', { label: head })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div class="dialog dialog-source">
        <h2 class="dialog-title">
          {obj.source?.language === undefined
            ? s('Source of {label}', { label: head })
            : s('Source of {label} ({language})', { label: head, language: obj.source.language })}
        </h2>
        {editing ? (
          <>
            <label class="field">
              <span class="field-label">{s('Language (optional)')}</span>
              <input
                data-testid="source-language"
                value={language}
                placeholder={s('go')}
                onInput={(e) => setLanguage((e.target as HTMLInputElement).value)}
              />
            </label>
            <label class="field">
              <span class="field-label">{s('Source text')}</span>
              <textarea
                ref={textRef}
                class="source-text"
                data-testid="source-editor"
                rows={16}
                spellcheck={false}
                value={text}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            {problem !== null && (
              <p class="dialog-text source-problem" role="alert" data-testid="source-problem">
                {problem}
              </p>
            )}
          </>
        ) : (
          <pre class="source-text" data-testid="source-read">{textOf(obj.source)}</pre>
        )}
        <p class="dialog-text">{s('Source is text: it is shown here, never executed.')}</p>
        <div class="dialog-actions">
          <button type="button" data-testid="source-close" onClick={onClose}>{s('Close')}</button>
          {!editing && (
            <button type="button" data-testid="source-edit" onClick={() => setEditing(true)}>
              {s('Edit source')}
            </button>
          )}
          {editing && obj.source !== undefined && (
            <button
              type="button"
              class="tb-danger"
              data-testid="source-remove"
              onClick={() => {
                onSave(null);
                onClose();
              }}
            >
              {s('Remove source')}
            </button>
          )}
          {editing && (
            <button
              type="button"
              class="tb-primary"
              data-testid="source-save"
              disabled={problem !== null}
              onClick={save}
            >
              {s('Save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
