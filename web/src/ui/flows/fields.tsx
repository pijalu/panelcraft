// SPDX-License-Identifier: GPL-3.0-only
// Field widgets shared by both flow surfaces. A field whose value comes from the
// file keeps a local draft while it is being typed: the file round-trip is
// asynchronous, so binding an input straight to the document made every
// keystroke race the previous apply and drop characters.
//
// Layout: one `inline` variant for compact inspector rows (label beside the
// control) and one `stacked` variant for prose (label and hint on their own
// lines, control full width). Multiline fields grow with their content under a
// single sizing rule so short and long prose do not share one arbitrary height.
import { useEffect, useRef, useState } from 'preact/hooks';
import { s } from '../strings';

/** One option of a closed-domain target. `reason` disables the choice. */
export interface TargetOption {
  value: string;
  label: string;
  reason?: string;
}

/** Which of the two field layouts a control uses. */
export type FieldVariant = 'inline' | 'stacked';

export const fieldClass = (variant: FieldVariant): string =>
  variant === 'stacked' ? 'flow-field flow-field-stacked' : 'flow-field';

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

/** Stable height a multiline field keeps when it holds little text. */
export const TEXTAREA_MIN_PX = 48;
/** Past this the field scrolls instead of pushing the panel's own controls down. */
export const TEXTAREA_MAX_PX = 320;

export interface AutoGrowSize {
  /** Height to apply, in CSS pixels. */
  height: number;
  /** True when the content exceeds the maximum and the field must scroll. */
  scroll: boolean;
}

/**
 * One sizing rule for every multiline field: a stable minimum, growth to a
 * readable maximum, then an inner scrollbar. Pure so the rule is testable
 * without a layout engine; `borderPx` is the field's own border, which
 * `scrollHeight` does not include.
 */
export function autoGrowSize(scrollHeight: number, borderPx = 0): AutoGrowSize {
  const measured = Number.isFinite(scrollHeight) ? Math.max(0, scrollHeight) : 0;
  const border = Number.isFinite(borderPx) ? Math.max(0, borderPx) : 0;
  const content = measured + border;
  if (content > TEXTAREA_MAX_PX) return { height: TEXTAREA_MAX_PX, scroll: true };
  return { height: Math.max(TEXTAREA_MIN_PX, content), scroll: false };
}

/** Apply the shared rule to a live textarea: reset, measure, then set height. */
export function applyAutoGrow(el: HTMLTextAreaElement | null): void {
  if (el === null) return;
  // Reset first: a stale inline height would make scrollHeight report itself.
  el.style.height = 'auto';
  const border = Math.max(0, el.offsetHeight - el.clientHeight);
  const { height, scroll } = autoGrowSize(el.scrollHeight, border);
  el.style.height = `${height}px`;
  el.style.overflowY = scroll ? 'auto' : 'hidden';
}

/**
 * Keep a textarea the height of its content. Re-runs when the value changes
 * (typing, document reload, undo) and when the panel width changes, since a
 * narrower field wraps into more lines. Never writes a document edit.
 */
function useAutoGrow(value: string): (el: HTMLTextAreaElement | null) => void {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null): void => {
    ref.current = el;
  };
  useEffect(() => {
    applyAutoGrow(ref.current);
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    applyAutoGrow(el);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => applyAutoGrow(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return setRef;
}

export function Field(props: {
  label: string;
  value: string;
  onInput: (v: string) => void;
  testid: string;
  hint?: string;
  variant?: FieldVariant;
}) {
  const draft = useDraft(props.value);
  const variant = props.variant ?? 'inline';
  return (
    <label class={fieldClass(variant)}>
      <span class="flow-field-label">{props.label}</span>
      {variant === 'stacked' && props.hint !== undefined && (
        <span class="flow-field-hint">{props.hint}</span>
      )}
      <input
        data-testid={props.testid}
        value={draft.value}
        {...(variant === 'inline' && props.hint !== undefined ? { placeholder: props.hint } : {})}
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
  variant?: FieldVariant;
  /** Lets a caller focus this field (framing-row edits, validation jumps). */
  inputRef?: { current: HTMLTextAreaElement | null };
}) {
  const draft = useDraft(props.value);
  const variant = props.variant ?? 'inline';
  const grow = useAutoGrow(draft.value);
  const setRef = (el: HTMLTextAreaElement | null): void => {
    grow(el);
    if (props.inputRef !== undefined) props.inputRef.current = el;
  };
  return (
    <label class={fieldClass(variant)}>
      <span class="flow-field-label">{props.label}</span>
      {/* One hint per field: a visible line under the label when stacked, the
          field's own placeholder when the row is compact. */}
      {variant === 'stacked' && <span class="flow-field-hint">{props.hint}</span>}
      <textarea
        ref={setRef}
        data-testid={props.testid}
        rows={2}
        {...(variant === 'inline' ? { placeholder: props.hint } : {})}
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
