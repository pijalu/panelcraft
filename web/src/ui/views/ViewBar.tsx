// SPDX-License-Identifier: GPL-3.0-only
// ViewBar (M6-WP1/WP2 UI): view selector + tag filter chips + layout controls.
// All file edits round-trip through retext → onChangeText (single writer,
// D-M4-6). Session-only state: active view name; canvas fade/positions are
// applied via the controller (no persistence — apply-to-file is explicit).
import { useMemo } from 'preact/hooks';
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Doc } from '../../engine/model/types';
import { dagreLayoutEngine } from '../../engine/layout/dagre';
import { CanvasController, DEFAULT_SHAPE } from '../CanvasController';
import { retext } from '../flows/flowDoc';
import { s } from '../strings';
import {
  addView,
  clearPositions,
  deleteView,
  effectiveView,
  setLayout,
  toggleHideId,
  toggleHideTag,
  togglePin,
  viewNames,
  type EffectiveView,
} from './viewDoc';

export interface ViewBarProps {
  text: string | null;
  viewName: string | undefined;
  onView(name: string | undefined): void;
  onChangeText(text: string): void;
  ctrl: CanvasController | null;
  /** Selected object ids (pin/hide act on these). */
  selection: string[];
}

/** Positions of a view's layout mode (saved = stored lines, auto = dagre). */
function layoutPositions(
  d: Doc,
  ctrl: CanvasController,
  e: EffectiveView,
): Record<string, { x: number; y: number }> {
  if (e.layout.mode === 'saved') return Object.fromEntries(e.positions);
  const current = ctrl.currentPositions();
  const nodes = d.objects.map((o) => ({
    id: o.id,
    size: { width: DEFAULT_SHAPE[o.kind]?.w ?? 120, height: DEFAULT_SHAPE[o.kind]?.h ?? 60 },
    pinnedAt: e.pins.has(o.id) ? (e.positions.get(o.id) ?? current[o.id]) : undefined,
  }));
  const edges = d.links.map((l) => ({ from: l.from, to: l.to, label: l.label }));
  return dagreLayoutEngine().layout(nodes, edges, { dir: e.layout.dir });
}

/** Session-only restore: switching never computes layout or replaces unspecified positions. */
function applyViewLayout(ctrl: CanvasController, e: EffectiveView): void {
  ctrl.applyPositions(Object.fromEntries(e.positions));
}

/** Distinct sorted tag names across objects + links (chip bar). */
function allTags(d: Doc): string[] {
  const set = new Set<string>();
  for (const o of d.objects) for (const t of o.tags ?? []) set.add(t);
  for (const l of d.links) for (const t of l.tags ?? []) set.add(t);
  return [...set].sort();
}

/** Right-hand action buttons (apply layout, mode toggle, pin/hide selection). */
function ViewActions(props: {
  layoutLabel: string;
  hasSelection: boolean;
  onApply(): void;
  onReset(): void;
  onToggleMode(): void;
  onPin(): void;
  onHide(): void;
}) {
  return (
    <span class="viewbar-actions">
      <button type="button" data-testid="apply-layout" onClick={props.onApply} title={s("Compute layout and write positions to the file")}>
        {s("apply layout")}{' '}</button>
      <button type="button" data-testid="reset-layout" onClick={props.onReset} title={s("Forget this view's stored positions")}>
        {s("reset")}{' '}</button>
      <button type="button" data-testid="layout-mode" onClick={props.onToggleMode}>
        {props.layoutLabel}
      </button>
      <button type="button" data-testid="pin-sel" disabled={props.hasSelection === false} onClick={props.onPin}>
        {s("pin")}{' '}</button>
      <button type="button" data-testid="hide-sel" disabled={props.hasSelection === false} onClick={props.onHide}>
        {s("hide")}{' '}</button>
    </span>
  );
}

export function ViewBar(props: ViewBarProps) {
  const doc: Doc | null = useMemo(() => {
    if (props.text === null) return null;
    const { doc: d } = parsePDL(props.text);
    return d;
  }, [props.text]);

  const ev = useMemo(() => (doc ? effectiveView(doc, props.viewName) : null), [doc, props.viewName]);

  if (!doc || !ev || props.text === null) return <div class="viewbar viewbar-empty" data-testid="viewbar" />;

  const commit = (mutate: (d: Doc) => void): void => {
    const next = retext(props.text ?? '', mutate);
    if (next !== null) props.onChangeText(next);
  };

  const addNewView = (): void => {
    let n = 1;
    while (viewNames(doc).includes(s('View {n}', { n }))) n++;
    commit((d) => addView(d, s('View {n}', { n }), props.ctrl?.currentPositions()));
    props.onView(s('View {n}', { n }));
  };

  const tags = allTags(doc);
  const layoutLabel = ev.layout.mode === 'auto' ? `auto:${ev.layout.dir}` : 'saved';

  return (
    <div class="viewbar" data-testid="viewbar">
      <label class="viewbar-views">
        {s("view")}{' '}<select
          data-testid="view-select"
          value={props.viewName ?? ''}
          title={s("Switch filters and saved positions; never recomputes layout")}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            props.onView(v === '' ? undefined : v);
            applyViewLayout(props.ctrl!, effectiveView(doc, v === '' ? undefined : v));
          }}
        >
          <option value="">{s("(default)")}</option>
          {viewNames(doc).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <button type="button" data-testid="view-add" onClick={addNewView} title={s("Create a view with current positions; drawing stays unchanged")}>{s("+ view")}</button>
        <button
          type="button"
          data-testid="view-del"
          onClick={() => {
            commit((d) => deleteView(d, props.viewName ?? ''));
            props.onView(undefined);
          }}
          disabled={props.viewName === undefined}
          title={s("Delete active view")}
        >
          {s("del")}{' '}</button>
      </label>
      <span class="viewbar-tags" data-testid="tag-chips">
        {tags.length === 0 && <span class="muted">{s("no tags")}</span>}
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            class={ev.hiddenTags.has(t) ? 'chip chip-active' : 'chip'}
            data-testid={`tag-chip-${t}`}
            onClick={() => commit((d) => toggleHideTag(d, props.viewName, t))}
          >
            {t}
          </button>
        ))}
      </span>
      <ViewActions
        layoutLabel={layoutLabel}
        hasSelection={props.selection.length > 0}
        onApply={() => {
          const ctrl = props.ctrl;
          if (!ctrl) return;
          // F-14: Auto-layout is explicit, confirmed by the click, undoable,
          // and it persists through the geometry hook — never on open/switch.
          ctrl.applyLayoutCommand(layoutPositions(doc, ctrl, ev), 'auto-layout');
        }}
        onReset={() => {
          const ctrl = props.ctrl;
          if (!ctrl) return;
          // Reset layout: drop this view's `position` lines, then re-run the
          // view's own layout mode (auto → dagre, saved → default grid).
          const cleared = clearPositions(doc, props.viewName);
          props.onChangeText(printDoc(cleared));
          const evNext = effectiveView(cleared, props.viewName);
          ctrl.applyPositions(layoutPositions(cleared, ctrl, evNext));
        }}
        onToggleMode={() =>
          commit((d) =>
            setLayout(d, props.viewName, ev.layout.mode === 'auto' ? 'saved' : 'auto', ev.layout.mode === 'auto' ? undefined : doc.direction ?? 'LR'),
          )
        }
        onPin={() => {
          for (const id of props.selection) commit((d) => togglePin(d, props.viewName, id));
        }}
        onHide={() => {
          for (const id of props.selection) commit((d) => toggleHideId(d, props.viewName, id));
        }}
      />
    </div>
  );
}
