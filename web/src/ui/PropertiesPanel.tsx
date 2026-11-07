// SPDX-License-Identifier: GPL-3.0-only
// Properties panel (M2-WP7, FR-C6; F-12/F-13 controls): object
// name/description/technology/tags/dashed + fit, link type/label/dashed plus the
// arrow visual model (head/tail/line/width). Every change is an undoable
// ValueChange in the controller — this file is presentational only.
import type { Ref } from 'preact';
import type { CanvasController } from './CanvasController';
import type { DiagramLink, DiagramObject } from './CanvasController';
import { CollapseButton } from './PanelChrome';

interface PropertiesPanelProps {
  obj: DiagramObject | null;
  link: DiagramLink | null;
  nameFieldRef?: Ref<HTMLInputElement>;
  onChangeObject: CanvasController['updateObject'];
  onChangeLink: CanvasController['updateLink'];
  /** F-13 `Fit` command: size the selection to its labels. */
  onFit?: () => void;
  /** F-10: collapse this panel into its rail. */
  onCollapse?: () => void;
}

/** Arrow marker shapes offered by the link controls (F-12). */
const MARKERS = ['arrow', 'open', 'diamond', 'circle', 'square', 'none'] as const;

const LINK_TYPES = [
  'uses',
  'includes',
  'requests',
  'returns',
  'publishes',
  'subscribes',
  'reads',
  'writes',
  'data',
];

type ObjectChange = CanvasController['updateObject'];
type LinkChange = CanvasController['updateLink'];

function Field(props: { label: string; children: preact.ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
    </label>
  );
}

/** Object fields: identity, metadata, style flags and the Fit command. */
function ObjectFields(props: {
  obj: DiagramObject;
  nameFieldRef?: Ref<HTMLInputElement>;
  onChange: ObjectChange;
  onFit?: () => void;
  onCollapse?: () => void;
}) {
  const { obj, nameFieldRef, onChange, onFit, onCollapse } = props;
  return (
    <aside class="properties" data-testid="properties">
      <div class="panel-head">
        <h2 class="panel-title">Properties</h2>
        {onCollapse && <CollapseButton id="props" label="properties" onCollapse={onCollapse} />}
      </div>
      <Field label="Name">
        <input
          ref={nameFieldRef}
          data-testid="prop-name"
          value={obj.name ?? ''}
          onInput={(e) => onChange(obj.id, { name: (e.target as HTMLInputElement).value })}
        />
      </Field>
      <Field label="Kind">
        <input value={obj.kind} disabled />
      </Field>
      <Field label="Description">
        <textarea
          data-testid="prop-description"
          rows={3}
          value={obj.description ?? ''}
          onInput={(e) => onChange(obj.id, { description: (e.target as HTMLTextAreaElement).value })}
        />
      </Field>
      <Field label="Technology">
        <input
          data-testid="prop-technology"
          value={obj.technology ?? ''}
          onInput={(e) => onChange(obj.id, { technology: (e.target as HTMLInputElement).value })}
        />
      </Field>
      <Field label="Tags (comma-separated)">
        <input
          data-testid="prop-tags"
          value={(obj.tags ?? []).join(', ')}
          onInput={(e) =>
            onChange(obj.id, {
              tags: (e.target as HTMLInputElement).value
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0),
            })
          }
        />
      </Field>
      <button type="button" class="prop-action" data-testid="prop-fit" onClick={() => onFit?.()}>
        Fit to name
      </button>
      <label class="field field-checkbox">
        <input
          type="checkbox"
          data-testid="prop-dashed"
          checked={obj.dashed === true}
          onChange={(e) => onChange(obj.id, { dashed: (e.target as HTMLInputElement).checked })}
        />
        <span class="field-label">Dashed border</span>
      </label>
    </aside>
  );
}

/** Link fields: semantics (type/label), arrow model (F-12) and line texture. */
function LinkFields(props: { link: DiagramLink; onChange: LinkChange }) {
  const { link, onChange } = props;
  return (
    <aside class="properties" data-testid="properties">
      <h2 class="panel-title">Link</h2>
      <Field label="Type">
        <select
          data-testid="link-type"
          value={link.type ?? ''}
          onChange={(e) => onChange(link.id, { type: (e.target as HTMLSelectElement).value || undefined })}
        >
          <option value="">(untyped)</option>
          {LINK_TYPES.map((t) => (
            <option key={t} value={t} selected={t === link.type}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label">
        <input
          data-testid="link-label"
          value={link.label ?? ''}
          onInput={(e) => onChange(link.id, { label: (e.target as HTMLInputElement).value })}
        />
      </Field>
      <Field label="Head">
        <select
          data-testid="link-head"
          value={link.head ?? 'arrow'}
          onChange={(e) => onChange(link.id, { head: (e.target as HTMLSelectElement).value })}
        >
          {MARKERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tail">
        <select
          data-testid="link-tail"
          value={link.tail ?? 'none'}
          onChange={(e) => onChange(link.id, { tail: (e.target as HTMLSelectElement).value })}
        >
          {MARKERS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Line">
        <select
          data-testid="link-line"
          value={link.line ?? 'solid'}
          onChange={(e) => onChange(link.id, { line: (e.target as HTMLSelectElement).value })}
        >
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
        </select>
      </Field>
      <Field label="Width">
        <input
          type="number"
          min={1}
          max={6}
          step={0.5}
          data-testid="link-width"
          value={link.width ?? 1.5}
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            onChange(link.id, { width: Number.isFinite(v) ? v : undefined });
          }}
        />
      </Field>
      <label class="field field-checkbox">
        <input
          type="checkbox"
          data-testid="link-dashed"
          checked={link.dashed === true}
          onChange={(e) => onChange(link.id, { dashed: (e.target as HTMLInputElement).checked })}
        />
        <span class="field-label">Dashed</span>
      </label>
    </aside>
  );
}

export function PropertiesPanel({
  obj,
  link,
  nameFieldRef,
  onChangeObject,
  onChangeLink,
  onFit,
  onCollapse,
}: PropertiesPanelProps) {
  if (obj) {
    return (
      <ObjectFields
        obj={obj}
        nameFieldRef={nameFieldRef}
        onChange={onChangeObject}
        onFit={onFit}
        onCollapse={onCollapse}
      />
    );
  }
  if (link) return <LinkFields link={link} onChange={onChangeLink} />;
  return (
    <aside class="properties" data-testid="properties">
      <div class="panel-head">
        <h2 class="panel-title">Properties</h2>
        {onCollapse && <CollapseButton id="props" label="properties" onCollapse={onCollapse} />}
      </div>
      <p class="muted panel-empty">Select an object or link to edit its properties.</p>
    </aside>
  );
}
