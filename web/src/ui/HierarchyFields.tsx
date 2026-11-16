// SPDX-License-Identifier: GPL-3.0-only
// Hierarchy fields of the properties panel (IR v10, drill-down and source rules): the
// decomposition relation of the selected element and its embedded source.
//
// This is the authoring affordance the bug asked for — a visible, keyboard-
// reachable control that opens the subordinate diagram — plus the two text
// fields that set or clear the relation. Everything is presentational: the
// callbacks commit one undoable document command each.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { TrailProblem } from './drillTrail';
import type { DrillTarget } from './useDrilldown';
import { s } from './strings';

export interface HierarchyFieldsProps {
  /** Resolved relation of the selected element, or the reason it cannot open. */
  target: DrillTarget | null;
  /** Author a relation (one undoable step); `null` clears it. */
  onSet: (path: string | null, view?: string) => void;
  onOpen: () => void;
  /** True when the element already carries a source block. */
  hasSource: boolean;
  /** Language label of the source block, when it has one. */
  language?: string;
  onOpenSource: () => void;
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

/** Path + view inputs; the relation is set from here, one commit per click. */
function RelationEditor(props: { target: DrillTarget | null; onSet: HierarchyFieldsProps['onSet'] }) {
  const current = props.target !== null && !isProblem(props.target) ? props.target : null;
  const [path, setPath] = useState(current?.path ?? '');
  const [view, setView] = useState(current?.view ?? '');
  const apply = (): void => {
    const trimmedPath = path.trim();
    const trimmedView = view.trim();
    if (trimmedPath === '') {
      props.onSet(null);
      return;
    }
    props.onSet(trimmedPath, trimmedView === '' ? undefined : trimmedView);
  };
  return (
    <>
      <label class="field">
        <span class="field-label">{s('Child diagram path')}</span>
        <input
          data-testid="prop-drill-path"
          value={path}
          placeholder={s('containers/shop.pcd')}
          onInput={(e) => setPath((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span class="field-label">{s('Child view id (optional)')}</span>
        <input
          data-testid="prop-drill-view"
          value={view}
          placeholder={s('containers')}
          onInput={(e) => setView((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="prop-row">
        <button type="button" class="prop-action" data-testid="prop-drill-set" onClick={apply}>
          {s('Set decomposition')}
        </button>
        {current !== null && (
          <button
            type="button"
            class="prop-action"
            data-testid="prop-drill-clear"
            onClick={() => props.onSet(null)}
          >
            {s('Clear decomposition')}
          </button>
        )}
      </div>
    </>
  );
}

export function HierarchyFields(props: HierarchyFieldsProps) {
  return (
    <>
      <RelationStatus target={props.target} onOpen={props.onOpen} />
      <RelationEditor target={props.target} onSet={props.onSet} />
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
