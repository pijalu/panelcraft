// SPDX-License-Identifier: GPL-3.0-only
// Properties panel (F-11): Identity / Metadata / Style / Advanced sections,
// each collapsible and persisted with the workspace layout. Controls cover what
// the format can express — name/kind/description/technology/tags, custom
// key-value properties, style overrides (fill/stroke/text/icon), size (via
// `Fit`) and the F-12 link model (type/label/head/tail/line/width/bidir).
// Every change is an undoable ValueChange in the controller; this file is
// presentational.
import type { ComponentChildren, Ref } from 'preact';
import type { CanvasController } from './CanvasController';
import type { DiagramLink, DiagramObject } from './CanvasController';
import { CollapseButton } from './PanelChrome';

type ObjectChange = CanvasController['updateObject'];
type LinkChange = CanvasController['updateLink'];

export interface PropertiesPanelProps {
  obj: DiagramObject | null;
  link: DiagramLink | null;
  nameFieldRef?: Ref<HTMLInputElement>;
  onChangeObject: ObjectChange;
  onChangeLink: LinkChange;
  /** F-13 `Fit` command: size the selection to its labels. */
  onFit?: () => void;
  /** F-10: collapse this panel into its rail. */
  onCollapse?: () => void;
  /** F-11: expanded state per section (persisted with the layout). */
  sections?: Record<string, boolean>;
  onToggleSection?: (section: string) => void;
}

/** Arrow marker shapes offered by the link controls (F-12). */
const MARKERS = ['arrow', 'open', 'diamond', 'circle', 'square', 'none'] as const;

const LINK_TYPES = [
  'uses', 'includes', 'requests', 'returns', 'publishes', 'subscribes', 'reads', 'writes', 'data',
];

function Field(props: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
    </label>
  );
}

/** Collapsible section with a persisted expanded state (F-11). */
function Section(props: {
  id: string;
  title: string;
  open: boolean;
  onToggle?: (section: string) => void;
  children: ComponentChildren;
}) {
  return (
    <section class="prop-section" data-testid={`section-${props.id}`}>
      <button
        type="button"
        class="prop-section-head"
        data-testid={`section-toggle-${props.id}`}
        aria-expanded={props.open}
        aria-controls={`prop-section-body-${props.id}`}
        onClick={() => props.onToggle?.(props.id)}
      >
        <span aria-hidden="true">{props.open ? '▾' : '▸'}</span>
        <span>{props.title}</span>
      </button>
      {props.open && (
        <div class="prop-section-body" id={`prop-section-body-${props.id}`}>
          {props.children}
        </div>
      )}
    </section>
  );
}

/** Custom key-value properties (F-11): add, edit, remove — inline rows. */
function PropertiesEditor(props: { obj: DiagramObject; onChange: ObjectChange }) {
  const rows = props.obj.properties ?? [];
  const update = (next: Array<{ key: string; value: string }>): void => {
    props.onChange(props.obj.id, { properties: next });
  };
  return (
    <div class="prop-list" data-testid="prop-properties">
      {rows.map((row, i) => (
        <div class="prop-row" key={`${row.key}-${i}`}>
          <input
            aria-label={`Property ${i + 1} key`}
            data-testid={`prop-prop-key-${i}`}
            value={row.key}
            onInput={(e) => {
              const next = rows.map((r, j) =>
                j === i ? { ...r, key: (e.target as HTMLInputElement).value } : r,
              );
              update(next);
            }}
          />
          <input
            aria-label={`Property ${i + 1} value`}
            data-testid={`prop-prop-value-${i}`}
            value={row.value}
            onInput={(e) => {
              const next = rows.map((r, j) =>
                j === i ? { ...r, value: (e.target as HTMLInputElement).value } : r,
              );
              update(next);
            }}
          />
          <button
            type="button"
            class="prop-row-del"
            data-testid={`prop-prop-del-${i}`}
            aria-label={`Remove property ${i + 1}`}
            onClick={() => update(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        class="prop-action"
        data-testid="prop-prop-add"
        onClick={() => update([...rows, { key: `key${rows.length + 1}`, value: '' }])}
      >
        + property
      </button>
    </div>
  );
}

/** Style override controls (F-11): fill/stroke/text colours + icon name. */
function StyleControls(props: { obj: DiagramObject; onChange: ObjectChange }) {
  const style = props.obj.style ?? {};
  const set = (patch: Partial<NonNullable<DiagramObject['style']>>): void => {
    props.onChange(props.obj.id, { style: { ...style, ...patch } });
  };
  return (
    <>
      <label class="field field-checkbox">
        <input
          type="checkbox"
          data-testid="prop-dashed"
          checked={props.obj.dashed === true}
          onChange={(e) => props.onChange(props.obj.id, { dashed: (e.target as HTMLInputElement).checked })}
        />
        <span class="field-label">Dashed border</span>
      </label>
      {(['fill', 'stroke', 'text'] as const).map((key) => (
        <Field key={key} label={key}>
          <input
            type="color"
            data-testid={`prop-style-${key}`}
            value={style[key] ?? '#4b5563'}
            onInput={(e) =>
              set({ [key]: (e.target as HTMLInputElement).value } as Partial<typeof style>)
            }
          />
        </Field>
      ))}
      <Field label="Icon">
        <input
          data-testid="prop-style-icon"
          value={style.icon ?? ''}
          placeholder="(none)"
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            set({ icon: v === '' ? undefined : v });
          }}
        />
      </Field>
    </>
  );
}

/** Object fields grouped into the four sections. */
function ObjectFields(props: {
  obj: DiagramObject;
  nameFieldRef?: Ref<HTMLInputElement>;
  onChange: ObjectChange;
  onFit?: () => void;
  onCollapse?: () => void;
  sections: Record<string, boolean>;
  onToggleSection?: (s: string) => void;
}) {
  const { obj, onChange, sections, onToggleSection } = props;
  const open = (id: string): boolean => sections[id] !== false;
  return (
    <aside class="properties" data-testid="properties">
      <div class="panel-head">
        <h2 class="panel-title">Properties</h2>
        {props.onCollapse && <CollapseButton id="props" label="properties" onCollapse={props.onCollapse} />}
      </div>
      <Section id="identity" title="Identity" open={open('identity')} onToggle={onToggleSection}>
        <Field label="Name">
          <input
            ref={props.nameFieldRef}
            data-testid="prop-name"
            value={obj.name ?? ''}
            onInput={(e) => onChange(obj.id, { name: (e.target as HTMLInputElement).value })}
          />
        </Field>
        <Field label="Kind">
          <input data-testid="prop-kind" value={obj.kind} disabled />
        </Field>
      </Section>
      <Section id="metadata" title="Metadata" open={open('metadata')} onToggle={onToggleSection}>
        <Field label="Description">
          <textarea
            data-testid="prop-description"
            rows={2}
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
        <PropertiesEditor obj={obj} onChange={onChange} />
      </Section>
      <Section id="style" title="Style" open={open('style')} onToggle={onToggleSection}>
        <StyleControls obj={obj} onChange={onChange} />
      </Section>
      <Section id="advanced" title="Advanced" open={open('advanced')} onToggle={onToggleSection}>
        <p class="muted" data-testid="prop-id">
          id: {obj.id}
        </p>
        <p class="muted" data-testid="prop-size">
          size: {Math.round(obj.w)} × {Math.round(obj.h)}
          {obj.size ? ' (explicit)' : ' (fit to name)'}
        </p>
        <button type="button" class="prop-action" data-testid="prop-fit" onClick={() => props.onFit?.()}>
          Fit to name
        </button>
      </Section>
    </aside>
  );
}

/** Link fields: semantics, arrow model (F-12) and texture. */
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
      <label class="field field-checkbox">
        <input
          type="checkbox"
          data-testid="link-bidir"
          checked={link.bidir === true}
          onChange={(e) => onChange(link.id, { bidir: (e.target as HTMLInputElement).checked })}
        />
        <span class="field-label">Bidirectional</span>
      </label>
    </aside>
  );
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { obj, link, nameFieldRef, onChangeObject, onChangeLink, onFit, onCollapse } = props;
  const sections = props.sections ?? {};
  if (obj) {
    return (
      <ObjectFields
        obj={obj}
        nameFieldRef={nameFieldRef}
        onChange={onChangeObject}
        onFit={onFit}
        onCollapse={onCollapse}
        sections={sections}
        onToggleSection={props.onToggleSection}
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
