// SPDX-License-Identifier: GPL-3.0-only
// Properties panel (F-11): Identity / Metadata / Style / Advanced sections,
// each collapsible and persisted with the workspace layout. Controls cover what
// the format can express — name/kind/description/technology/tags, custom
// key-value properties, style overrides (fill/stroke/text/icon), size (via
// `Fit`) and the F-12 link model (type/label/head/tail/line/width/bidir).
// Every change is an undoable ValueChange in the controller; this file is
// presentational.
import type { ComponentChildren, Ref } from 'preact';
import { useState } from 'preact/hooks';
import type { CanvasController } from './CanvasController';
import type { DiagramLink, DiagramObject } from './CanvasController';
import { CollapseButton } from './PanelChrome';
import { LINE_OPTIONS, MARKER_OPTIONS, ROUTE_OPTIONS, WIDTH_OPTIONS } from './connectorOptions';
import { VisualPicker } from './VisualPicker';
import { CloseIcon, DisclosureClosedIcon, DisclosureOpenIcon } from './icons';
import { IconField } from './IconPicker';
import { HierarchyFields } from './HierarchyFields';
import type { DrillTarget } from './useDrilldown';
import type { IconDecl } from '../engine/model/types';
import { anchorToChoice, choiceToAnchor, ANCHOR_SIDES, type AnchorSide } from '../engine/render/anchorControls';
import { s } from './strings';

type ObjectChange = CanvasController['updateObject'];
type LinkChange = CanvasController['updateLink'];
type AnchorChange = CanvasController['setLinkAnchor'];

/**
 * IR v10 hierarchy controls of the selected element (FILE-FORMAT.md §3.2, §3.3): the
 * resolved decomposition target, the two authoring fields and the source action.
 */
export interface HierarchyProps {
  target: DrillTarget | null;
  onSet: (path: string | null, view?: string) => void;
  onOpen: () => void;
  hasSource: boolean;
  language?: string;
  onOpenSource: () => void;
}

export interface PropertiesPanelProps {
  obj: DiagramObject | null;
  link: DiagramLink | null;
  nameFieldRef?: Ref<HTMLInputElement>;
  /** UX08-WP08: the link Label field, focused when a link is inspected. */
  linkLabelRef?: Ref<HTMLInputElement>;
  onChangeObject: ObjectChange;
  onChangeLink: LinkChange;
  /** UX08-WP09: Start/End perimeter anchors (`Auto` = undefined). */
  onChangeAnchor?: AnchorChange;
  /** UX08-WP09: back to an automatic route / to no bends. */
  onResetRoute?: (id: string) => void;
  onResetBends?: (id: string) => void;
  /** F-13 `Fit` command: size the selection to its labels. */
  onFit?: () => void;
  /** F-10: collapse this panel into its rail. */
  onCollapse?: () => void;
  /** IR v9: icons declared in this file (picker source). */
  projectIcons?: IconDecl[];
  /** IR v9: open the project-icon manager. */
  onManageIcons?: () => void;
  /** F-11: expanded state per section (persisted with the layout). */
  sections?: Record<string, boolean>;
  onToggleSection?: (section: string) => void;
  /** IR v10: decomposition + embedded source of the selected element. */
  hierarchy?: HierarchyProps;
}

/**
 * F-25 (Miller's law): four verbs cover most diagrams; the rest live behind
 * "More types" instead of making the picker a nine-item wall.
 */
const PRIMARY_LINK_TYPES = ['uses', 'requests', 'reads', 'writes'];
const MORE_LINK_TYPES = ['includes', 'returns', 'publishes', 'subscribes', 'data'];
const LINK_TYPES = [...PRIMARY_LINK_TYPES, ...MORE_LINK_TYPES];

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
        <span aria-hidden="true">{props.open ? <DisclosureOpenIcon /> : <DisclosureClosedIcon />}</span>
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
            aria-label={s('Property {n} key', { n: i + 1 })}
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
            aria-label={s('Property {n} value', { n: i + 1 })}
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
            aria-label={s('Remove property {n}', { n: i + 1 })}
            onClick={() => update(rows.filter((_, j) => j !== i))}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        class="prop-action"
        data-testid="prop-prop-add"
        onClick={() => update([...rows, { key: `key${rows.length + 1}`, value: '' }])}
      >
        {s("+ property")}{' '}</button>
    </div>
  );
}

/** Style override controls (F-11): fill/stroke/text colours + icon name. */
function StyleControls(props: {
  obj: DiagramObject;
  onChange: ObjectChange;
  projectIcons?: IconDecl[];
  onManageIcons?: () => void;
}) {
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
        <span class="field-label">{s("Dashed border")}</span>
      </label>
      {(['fill', 'stroke', 'text'] as const).map((key) => (
        <Field key={key} label={s(key)}>
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
      <Field label={s("Icon")}>
        {/* IR v9: the field shows the icon that is actually drawn (style override
            or the object's own `icon name`) and writes back to the object, so the
            picker and the canvas can never disagree; a legacy `style { icon … }`
            override is cleared in the same patch instead of being kept as a
            second, invisible source of truth. */}
        <IconField
          value={style.icon ?? props.obj.icon}
          project={props.projectIcons ?? []}
          onChange={(icon) => {
            if (style.icon !== undefined) {
              props.onChange(props.obj.id, { style: { ...style, icon: undefined }, icon });
              return;
            }
            props.onChange(props.obj.id, { icon });
          }}
          onManage={() => props.onManageIcons?.()}
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
  projectIcons?: IconDecl[];
  onManageIcons?: () => void;
  hierarchy?: HierarchyProps;
}) {
  const { obj, onChange, sections, onToggleSection, hierarchy } = props;
  const open = (id: string): boolean => sections[id] !== false;
  return (
    <aside class="properties" data-testid="properties" aria-label={s("Properties")}>
      {props.onCollapse && (
        <div class="panel-head">
          <CollapseButton id="props" label={s("properties")} onCollapse={props.onCollapse} />
        </div>
      )}
      <Section id="identity" title={s("Identity")} open={open('identity')} onToggle={onToggleSection}>
        <Field label={s("Name")}>
          <input
            ref={props.nameFieldRef}
            data-testid="prop-name"
            value={obj.name ?? ''}
            onInput={(e) => onChange(obj.id, { name: (e.target as HTMLInputElement).value })}
          />
        </Field>
        <Field label={s("Kind")}>
          <input data-testid="prop-kind" value={obj.kind} disabled />
        </Field>
      </Section>
      <Section id="metadata" title={s("Metadata")} open={open('metadata')} onToggle={onToggleSection}>
        <Field label={s("Description")}>
          <textarea
            data-testid="prop-description"
            rows={2}
            value={obj.description ?? ''}
            onInput={(e) => onChange(obj.id, { description: (e.target as HTMLTextAreaElement).value })}
          />
        </Field>
        <Field label={s("Technology")}>
          <input
            data-testid="prop-technology"
            value={obj.technology ?? ''}
            onInput={(e) => onChange(obj.id, { technology: (e.target as HTMLInputElement).value })}
          />
        </Field>
        <Field label={s("Tags (comma-separated)")}>
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
      <Section id="style" title={s("Style")} open={open('style')} onToggle={onToggleSection}>
        <StyleControls
          obj={obj}
          onChange={onChange}
          projectIcons={props.projectIcons}
          onManageIcons={props.onManageIcons}
        />
      </Section>
      {hierarchy !== undefined && (
        <Section id="hierarchy" title={s("Decomposition")} open={open('hierarchy')} onToggle={onToggleSection}>
          <HierarchyFields
            target={hierarchy.target}
            onSet={hierarchy.onSet}
            onOpen={hierarchy.onOpen}
            hasSource={hierarchy.hasSource}
            language={hierarchy.language}
            onOpenSource={hierarchy.onOpenSource}
          />
        </Section>
      )}
      <Section id="advanced" title={s("Advanced")} open={open('advanced')} onToggle={onToggleSection}>
        <Field label={s("Stacking order")}>
          <input
            type="number"
            step={1}
            data-testid="prop-z"
            placeholder={s("Auto")}
            value={obj.z === undefined ? '' : String(obj.z)}
            onInput={(e) => {
              const raw = (e.target as HTMLInputElement).value.trim();
              if (raw === '') {
                onChange(obj.id, { z: undefined });
                return;
              }
              const z = Number(raw);
              // Blank means Auto; anything but a safe integer is a transient
              // typo, never a value the caller should have to undo.
              if (Number.isSafeInteger(z)) onChange(obj.id, { z });
            }}
          />
        </Field>
        <p class="muted" data-testid="prop-id">
          {s("id:")}{' '}{obj.id}
        </p>
        <p class="muted" data-testid="prop-size">
          {s("size:")}{' '}{Math.round(obj.w)} {s("×")}{' '}{Math.round(obj.h)}
          {obj.size ? s(' (explicit)') : s(' (fit to name)')}
        </p>
        <button type="button" class="prop-action" data-testid="prop-fit" onClick={() => props.onFit?.()}>
          {s("Fit to name")}{' '}</button>
      </Section>
    </aside>
  );
}

function OverlapField({ link, onChange }: { link: DiagramLink; onChange: LinkChange }) {
  return (
    <label class="field field-checkbox">
      <input
        type="checkbox"
        data-testid="link-allow-overlap"
        checked={link.allowOverlap === true}
        onChange={(e) => onChange(link.id, { allowOverlap: (e.target as HTMLInputElement).checked })}
      />
      <span class="field-label">{s("Allow overlap")}</span>
    </label>
  );
}

/** CX-04: visual connector-style controls (markers, texture, route, weight). */
function ConnectorStyleControls(props: { link: DiagramLink; onChange: LinkChange }) {
  const { link, onChange } = props;
  return (
    <>
      <VisualPicker
        id="link-head"
        label={s('Head')}
        value={link.head ?? 'arrow'}
        options={MARKER_OPTIONS}
        onChange={(value) => onChange(link.id, { head: value })}
      />
      <VisualPicker
        id="link-tail"
        label={s('Tail')}
        value={link.tail ?? 'none'}
        options={MARKER_OPTIONS}
        onChange={(value) => onChange(link.id, { tail: value })}
      />
      <VisualPicker
        id="link-line"
        label={s('Line')}
        value={link.line ?? 'solid'}
        options={LINE_OPTIONS}
        onChange={(value) => onChange(link.id, { line: value })}
      />
      <VisualPicker
        id="link-route"
        label={s('Route')}
        value={link.route ?? 'orthogonal'}
        options={ROUTE_OPTIONS}
        onChange={(value) =>
          onChange(link.id, {
            route: value === 'orthogonal' ? undefined : (value as DiagramLink['route']),
          })
        }
      />
      <VisualPicker
        id="link-width-preset"
        label={s('Weight')}
        value={String(link.width ?? 1.5)}
        options={WIDTH_OPTIONS}
        onChange={(value) => onChange(link.id, { width: Number(value) })}
      />
      <Field label={s("Width")}>
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
      <Field label={s("Spark count")}>
        <input
          type="number"
          min={1}
          max={8}
          step={1}
          data-testid="link-sparks"
          value={link.sparks ?? 1}
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (!Number.isInteger(v) || v < 1 || v > 8) return;
            onChange(link.id, { sparks: v === 1 ? undefined : v });
          }}
        />
      </Field>
      <Field label={s("Spark speed")}>
        <input
          type="number"
          min={0.25}
          max={4}
          step={0.25}
          data-testid="link-speed"
          value={link.speed ?? 1}
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (!Number.isFinite(v) || v < 0.25 || v > 4) return;
            onChange(link.id, { speed: v === 1 ? undefined : v });
          }}
        />
      </Field>
    </>
  );
}

/** Link fields: semantics, arrow model (F-12, CX-04) and texture. */
const SIDE_LABELS: Record<AnchorSide, 'Top' | 'Right' | 'Bottom' | 'Left'> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
};

/**
 * UX08-WP09: one endpoint anchor as a side picker plus a side-relative
 * percentage, so the user never has to think in normalized quarter units.
 */
function AnchorField(props: {
  link: DiagramLink;
  end: 'from' | 'to';
  onChangeAnchor?: AnchorChange;
}) {
  const label = props.end === 'from' ? s('Start') : s('End');
  const anchor = props.end === 'from' ? props.link.fromAnchor : props.link.toAnchor;
  const choice = anchor === undefined ? null : anchorToChoice(anchor);
  const set = (value: number | undefined): void => {
    props.onChangeAnchor?.(props.link.id, props.end, value);
  };
  return (
    <div class="prop-anchor" data-testid={`link-anchor-${props.end}`}>
      <span class="field-label">{label}</span>
      <select
        aria-label={s('{endpoint} side', { endpoint: label })}
        data-testid={`link-anchor-${props.end}-side`}
        value={choice?.side ?? 'auto'}
        onChange={(e) => {
          const side = (e.target as HTMLSelectElement).value;
          set(side === 'auto' ? undefined : choiceToAnchor(side as AnchorSide, choice?.percent ?? 50));
        }}
      >
        <option value="auto">{s('Auto')}</option>
        {ANCHOR_SIDES.map((side) => (
          <option key={side} value={side}>{s(SIDE_LABELS[side])}</option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        aria-label={s('{endpoint} position percent', { endpoint: label })}
        placeholder={s('—')}
        data-testid={`link-anchor-${props.end}-percent`}
        disabled={choice === null}
        value={choice === null ? '' : choice.percent}
        onInput={(e) => {
          if (choice === null) return;
          const raw = Number((e.target as HTMLInputElement).value);
          if (!Number.isFinite(raw)) return;
          set(choiceToAnchor(choice.side, raw));
        }}
      />
    </div>
  );
}

/** UX08-WP09: endpoint anchors plus the two reset commands. */
function RouteFields(props: {
  link: DiagramLink;
  onChangeAnchor?: AnchorChange;
  onResetRoute?: (id: string) => void;
  onResetBends?: (id: string) => void;
}) {
  const bends = props.link.waypoints?.length ?? 0;
  const automatic = props.link.fromAnchor === undefined && props.link.toAnchor === undefined &&
    bends === 0;
  return (
    <div class="prop-route" data-testid="link-endpoints">
      <span class="field-label">{s('Endpoints')}</span>
      <AnchorField link={props.link} end="from" onChangeAnchor={props.onChangeAnchor} />
      <AnchorField link={props.link} end="to" onChangeAnchor={props.onChangeAnchor} />
      <div class="prop-actions">
        <button
          type="button"
          class="prop-action"
          data-testid="link-reset-route"
          disabled={automatic}
          onClick={() => props.onResetRoute?.(props.link.id)}
        >
          {s('Reset route')}
        </button>
        <button
          type="button"
          class="prop-action"
          data-testid="link-reset-bends"
          disabled={bends === 0}
          onClick={() => props.onResetBends?.(props.link.id)}
        >
          {s('Reset bends')}
        </button>
      </div>
    </div>
  );
}

function LinkFields(props: {
  link: DiagramLink;
  onChange: LinkChange;
  labelRef?: Ref<HTMLInputElement>;
  onChangeAnchor?: AnchorChange;
  onResetRoute?: (id: string) => void;
  onResetBends?: (id: string) => void;
}) {
  const { link, onChange } = props;
  const [more, setMore] = useState(false);
  const primary = more ? LINK_TYPES : PRIMARY_LINK_TYPES;
  return (
    <aside class="properties" data-testid="properties">
      <h2 class="panel-title">{s("Link")}</h2>
      <Field label={s("Type")}>
        <select
          data-testid="link-type"
          value={link.type ?? ''}
          onChange={(e) => onChange(link.id, { type: (e.target as HTMLSelectElement).value || undefined })}
        >
          <option value="">{s("(untyped)")}</option>
          {/* keep the current value selectable even when it hides behind "more" */}
          {link.type !== undefined && !primary.includes(link.type) && (
            <option value={link.type}>{link.type}</option>
          )}
          {primary.map((t) => (
            <option key={t} value={t} selected={t === link.type}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="prop-action"
          data-testid="link-more-types"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {more ? s('Fewer types') : s('More types')}
        </button>
      </Field>
      <Field label={s("Label")}>
        <input
          data-testid="link-label"
          ref={props.labelRef}
          value={link.label ?? ''}
          onInput={(e) => onChange(link.id, { label: (e.target as HTMLInputElement).value })}
        />
      </Field>
      {/* UX08-WP09: routing geometry comes before appearance — the endpoints are
          what a reader follows, and they were previously out of sight below the
          whole connector-style block. */}
      <RouteFields
        link={link}
        onChangeAnchor={props.onChangeAnchor}
        onResetRoute={props.onResetRoute}
        onResetBends={props.onResetBends}
      />
      <ConnectorStyleControls link={link} onChange={onChange} />
      <label class="field field-checkbox">
        <input
          type="checkbox"
          data-testid="link-dashed"
          checked={link.dashed === true}
          onChange={(e) => onChange(link.id, { dashed: (e.target as HTMLInputElement).checked })}
        />
        <span class="field-label">{s("Dashed")}</span>
      </label>
      <OverlapField link={link} onChange={onChange} />
      <label class="field field-checkbox">
        <input
          type="checkbox"
          data-testid="link-bidir"
          checked={link.bidir === true}
          onChange={(e) => onChange(link.id, { bidir: (e.target as HTMLInputElement).checked })}
        />
        <span class="field-label">{s("Bidirectional")}</span>
      </label>
    </aside>
  );
}

export function PropertiesPanel(props: PropertiesPanelProps) {
  const { obj, link, nameFieldRef, linkLabelRef, onChangeObject, onChangeLink, onFit, onCollapse } = props;
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
        projectIcons={props.projectIcons}
        onManageIcons={props.onManageIcons}
        hierarchy={props.hierarchy}
      />
    );
  }
  if (link) {
    return (
      <LinkFields
        link={link}
        onChange={onChangeLink}
        labelRef={linkLabelRef}
        onChangeAnchor={props.onChangeAnchor}
        onResetRoute={props.onResetRoute}
        onResetBends={props.onResetBends}
      />
    );
  }
  return (
    <aside class="properties" data-testid="properties" aria-label={s("Properties")}>
      {onCollapse && (
        <div class="panel-head">
          <CollapseButton id="props" label={s("properties")} onCollapse={onCollapse} />
        </div>
      )}
      <p class="muted panel-empty">{s("Select an object or link to edit its properties.")}</p>
    </aside>
  );
}
