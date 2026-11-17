// SPDX-License-Identifier: GPL-3.0-only
// Field widgets shared by both flow surfaces. A field whose value comes from the
// file keeps a local draft while it is being typed: the file round-trip is
// asynchronous, so binding an input straight to the document made every
// keystroke race the previous apply and drop characters.
import { useState } from 'preact/hooks';
import { s } from '../strings';

/** One option of a closed-domain target. `reason` disables the choice. */
export interface TargetOption {
  value: string;
  label: string;
  reason?: string;
}

/**
 * Local draft for a field whose value comes from the file. While the user types,
 * the draft owns the value; elsewhere the document wins (undo, step switch).
 */
export function useDraft(value: string): {
  value: string;
  onInput: (e: Event) => void;
  onFocus: () => void;
  onBlur: () => void;
} {
  const [draft, setDraft] = useState(value);
  const [typing, setTyping] = useState(false);
  if (!typing && draft !== value) setDraft(value);
  return {
    value: draft,
    onInput: (e) => setDraft((e.target as HTMLInputElement).value),
    onFocus: () => setTyping(true),
    onBlur: () => setTyping(false),
  };
}

export function Field(props: { label: string; value: string; onInput: (v: string) => void; testid: string }) {
  const draft = useDraft(props.value);
  return (
    <label class="flow-field">
      <span class="flow-field-label">{props.label}</span>
      <input
        data-testid={props.testid}
        value={draft.value}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onInput={(e) => {
          draft.onInput(e);
          props.onInput((e.target as HTMLInputElement).value);
        }}
      />
    </label>
  );
}

export function TextArea(props: {
  label: string;
  value: string;
  hint: string;
  onInput: (v: string) => void;
  testid: string;
}) {
  const draft = useDraft(props.value);
  return (
    <label class="flow-field">
      <span class="flow-field-label">{props.label}</span>
      <textarea
        data-testid={props.testid}
        rows={2}
        placeholder={props.hint}
        value={draft.value}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onInput={(e) => {
          draft.onInput(e);
          props.onInput((e.target as HTMLTextAreaElement).value);
        }}
      />
    </label>
  );
}

/**
 * A known-value target as a native select. The stored value stays selected even
 * when the domain no longer contains it — shown as a disabled choice with a
 * diagnostic — so loading or editing a file cannot silently drop a target.
 */
export function KnownValueField(props: {
  label: string;
  testid: string;
  value: string;
  options: TargetOption[];
  noneLabel?: string;
  onChange(value: string): void;
}) {
  const match = props.options.find((option) => option.value === props.value);
  const unresolved = props.value !== '' && match === undefined;
  return (
    <>
      <label class="flow-field">
        <span class="flow-field-label">{props.label}</span>
        <select
          data-testid={props.testid}
          aria-label={props.label}
          value={props.value}
          onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
        >
          {props.noneLabel !== undefined && <option value="">{props.noneLabel}</option>}
          {props.options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.reason !== undefined} title={option.reason}>
              {option.label}
            </option>
          ))}
          {unresolved && (
            <option value={props.value} disabled>{s('{value} (unresolved)', { value: props.value })}</option>
          )}
        </select>
      </label>
      {unresolved && (
        <p class="flow-hint flow-unresolved" role="status" data-testid={`${props.testid}-unresolved`}>
          {s('“{value}” is not available here. Choose a known value.', { value: props.value })}
        </p>
      )}
      {match?.reason !== undefined && (
        <p class="flow-hint flow-unresolved" role="status">{match.reason}</p>
      )}
    </>
  );
}

/** Clamp a numeric field to its documented range (invalid input → nearest). */
export function clampNumber(raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** A checkbox row: the collapsed form of a boolean step or flow setting. */
export function CheckField(props: {
  label: string;
  testid: string;
  checked: boolean;
  hint?: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label class="flow-field">
      <span class="flow-field-label">{props.label}</span>
      <input
        type="checkbox"
        data-testid={props.testid}
        title={props.hint}
        checked={props.checked}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
    </label>
  );
}
