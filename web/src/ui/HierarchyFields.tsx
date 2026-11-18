// SPDX-License-Identifier: GPL-3.0-only
// Hierarchy fields of the properties panel (IR v12, §3.2/§3.3). The
// decomposition target is a native known-value picker: keyboard operation,
// visible unresolved legacy values and disabled choices come for free; an
// embedded child may only be converted to a linked path with explicit consent.
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { TrailProblem } from './drillTrail';
import type { DrillTarget, PathCandidate } from './useDrilldown';
import { s } from './strings';

export interface HierarchyFieldsProps {
  target: DrillTarget | null;
  candidates: PathCandidate[];
  onSet(path: string | null): void;
  onOpen(): void;
  hasSource: boolean;
  language?: string;
  onOpenSource(): void;
}

const isProblem = (target: DrillTarget): target is TrailProblem => 'code' in target;

/** Current relation, the reason it is unusable, or the empty state. */
function RelationStatus(props: { target: DrillTarget | null; onOpen: () => void }) {
  const { target } = props;
  if (target === null) return <p class="muted">{s('No subordinate diagram yet')}</p>;
  if (isProblem(target)) {
    return <p class="muted prop-problem" role="status" data-testid="prop-drill-problem">{target.message}</p>;
  }
  return (
    <button type="button" class="prop-action" data-testid="prop-open-child" onClick={props.onOpen}>
      {s('Open {label} diagram', { label: target.label })}
    </button>
  );
}

function ConvertWarning(props: { onConfirm(): void; onCancel(): void }) {
  return (
    <div class="prop-row" role="alert" data-testid="prop-drill-convert">
      <span class="muted">{s('Replace the embedded child with a linked file? One undo restores it.')}</span>
      <button type="button" class="prop-action" data-testid="prop-drill-convert-confirm" onClick={props.onConfirm}>
        {s('Convert to linked')}
      </button>
      <button type="button" class="prop-action" data-testid="prop-drill-convert-cancel" onClick={props.onCancel}>
        {s('Cancel')}
      </button>
    </div>
  );
}

interface RelationEditorProps {
  target: DrillTarget | null;
  candidates: PathCandidate[];
  onSet: HierarchyFieldsProps['onSet'];
}

/** One known-value control plus a separate clear action. */
function RelationEditor(props: RelationEditorProps) {
  const current = props.target !== null && !isProblem(props.target) ? props.target : null;
  const [draft, setDraft] = useState(current?.raw ?? '');
  const [confirm, setConfirm] = useState(false);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const selected = props.candidates.find((c) => c.path === draft);
  const destructive = confirm && current?.kind === 'embedded';
  const cancel = (): void => {
    setConfirm(false);
    selectRef.current?.focus();
  };
  const apply = (): void => {
    const path = draft.trim();
    if (current?.kind === 'embedded' && path !== '' && path !== current.raw) {
      setConfirm(true);
      return;
    }
    props.onSet(path === '' ? null : path);
    setConfirm(false);
  };
  return (
    <>
      <label class="field">
        <span class="field-label">{s('Child diagram')}</span>
        <select
          ref={selectRef}
          data-testid="prop-drill-path"
          value={draft}
          onChange={(e) => {
            setDraft((e.target as HTMLSelectElement).value);
            setConfirm(false);
          }}
        >
          <option value="">{s('— none —')}</option>
          {props.candidates.map((c) => (
            <option key={c.path} value={c.path} disabled={c.disabled} title={c.reason}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {!!selected?.reason && (
        <p class="muted prop-problem" role="status">{selected.reason}</p>
      )}
      {destructive && (
        <ConvertWarning
          onConfirm={() => {
            props.onSet(draft);
            setConfirm(false);
          }}
          onCancel={cancel}
        />
      )}
      {!destructive && (
        <div class="prop-row">
          <button type="button" class="prop-action" data-testid="prop-drill-set" onClick={apply}>
            {s('Set decomposition')}
          </button>
          {current !== null && (
            <button
              type="button"
              class="prop-action"
              data-testid="prop-drill-clear"
              onClick={() => {
                props.onSet(null);
                setDraft('');
                setConfirm(false);
              }}
            >
              {s('Clear decomposition')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function HierarchyFields(props: HierarchyFieldsProps) {
  return (
    <>
      <RelationStatus target={props.target} onOpen={props.onOpen} />
      <RelationEditor target={props.target} candidates={props.candidates} onSet={props.onSet} />
      <Field label={s('Embedded source')} language={props.language}>
        <button type="button" class="prop-action" data-testid="prop-open-source" onClick={props.onOpenSource}>
          {props.hasSource ? s('View source') : s('Add source')}
        </button>
      </Field>
    </>
  );
}

/** Small labelled row used only here (keeps the panel's own `Field` untouched). */
function Field(props: { label: string; language?: string; children: ComponentChildren }) {
  return (
    <div class="field">
      <span class="field-label">
        {props.label}
        {props.language === undefined ? '' : ` (${props.language})`}
      </span>
      {props.children}
    </div>
  );
}
