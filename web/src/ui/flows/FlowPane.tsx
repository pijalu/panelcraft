// SPDX-License-Identifier: GPL-3.0-only
// Flow Steps: the list of flows in the open file and, for the chosen flow, its
// steps in order — number, kind and who takes part. It stays a *list*: what a
// step means and how it plays is edited in the Properties panel, so the reader
// can see the whole walkthrough without a form in the middle of it. Every edit
// still round-trips through retext() and surfaces as onChangeText(newText), so
// the sync machine stays the single writer.
import { useState } from 'preact/hooks';
import { flowsMarkdown } from '../../engine/format/flowMarkdown';
import { downloadText } from '../download';
import { stem } from '../paths';
import type { Doc, Flow, FlowStep } from '../../engine/model/types';
import { s } from '../strings';
import { CopyIcon, PencilIcon, PlayIcon } from '../icons';
import {
  addFlow,
  appendStep,
  duplicateStep,
  flatSteps,
  hiddenLinks,
  moveStep,
  newStep,
  showFlowLink,
  type FlatStep,
} from './flowDoc';
import { derivedFlow, flowsForDisplay } from './derivedFlow';
import { parseForEditor, type FlowSession } from './flowSession';
import { editFlow, flowKey, highlightFor, nameOf, stepProblems, stepSummary, stepTitle } from './flowEdit';
import { objectNames, type FlowCanvasContext, type FlowSelection, type Names } from './flowTypes';

/** Re-exported so the shell imports flow types from one place. */
export type { FlowCanvasContext, FlowSelection, ViewPoint } from './flowTypes';

export interface FlowPaneProps {
  textOf(path: string): string | null;
  activePath: string | null;
  /** One editing session for this file, shared with the Properties panel. */
  session: FlowSession;
  /** Parsed document of the open file, as the shell sees it. */
  doc: Doc | null;
  /** Start playback of a flow in the active file. */
  onPlay(flowKey: string): void;
  /** Start playback at a step (1-based) of a flow. */
  onPlayFrom?(flowKey: string, index: number): void;
  /** The active file's buffer has unapplied changes. */
  dirty?: boolean;
  /** Session-owned selection survives docking and close/reopen remounts. */
  selection?: FlowSelection | null;
  onSelection?(selection: FlowSelection): void;
  /** FLOW-01 canvas context for assisted targeting (never invents links). */
  canvas?: FlowCanvasContext;
  /** Closed domain for `goto` file picks: workspace `.pcd` paths (may be empty). */
  files?: string[];
  /** FLOW-01: fade everything except these participants (null clears). */
  onHighlight?(ids: string[] | null): void;
  /** Open the flow's introduction or conclusion field in Properties. */
  onEditFraming?(flowKey: string, kind: 'intro' | 'conclusion'): void;
}

/** What the canvas must provide before a message/process step can be added. */
function canvasReady(canvas: FlowCanvasContext | undefined): { msg: boolean; process: boolean } {
  const picked = canvas?.objects.length ?? 0;
  return { msg: canvas?.link != null, process: picked === 1 };
}

/** Step template seeded from canvas state; null when the action is impossible. */
function seedFor(kind: FlowStep['type'], canvas: FlowCanvasContext | undefined): FlowStep | null {
  const step = newStep(kind);
  if (step.type === 'msg') {
    const link = canvas?.link ?? null;
    if (link === null) return null;
    step.from = link.from;
    step.to = link.to;
    if (link.label !== undefined) step.label = link.label;
    return step;
  }
  if (step.type === 'process') {
    const picked = canvas?.objects ?? [];
    const target = picked.length === 1 ? picked[0] : undefined;
    if (target === undefined) return null;
    step.target = target;
    return step;
  }
  return step;
}

function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Row actions: everything a reader does *to the list* rather than to a step. */
interface RowOps {
  select(path: number[]): void;
  move(path: number[], to: number): void;
  duplicate(path: number[]): void;
  playFrom(index: number): void;
  /** Open the framing step's own prose field in Properties. */
  editFraming?(kind: 'intro' | 'conclusion'): void;
}

function StepRow(props: {
  row: FlatStep;
  index: number;
  selected: boolean;
  ops: RowOps;
  names: Names;
}) {
  const { row, index, ops, names } = props;
  const parent = row.path.slice(0, -1).join('.');
  const problems = stepProblems(row.step, names);
  const title = stepTitle(row.step, names);
  const sibling = row.path.at(-1) ?? 0;
  const drop = (e: DragEvent): void => {
    const from = e.dataTransfer?.getData('application/x-pc-step') ?? '';
    if (from === '') return;
    const path = from.split('.').map(Number);
    if (path.slice(0, -1).join('.') !== parent) return; // keep nesting intact
    e.preventDefault();
    const to = row.path.at(-1);
    if (to !== undefined) ops.move(path, to);
  };
  // Keyboard equivalent of the drag handle: Alt+↑/↓ reorders siblings.
  const key = (e: KeyboardEvent): void => {
    if (!e.altKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    ops.move(row.path, sibling + (e.key === 'ArrowUp' ? -1 : 1));
  };
  return (
    <li
      class={`flow-step flow-card kind-card-${row.step.type}${props.selected ? ' active' : ''}`}
      draggable={true}
      data-testid={`step-row-${index}`}
      onDragStart={(e) => {
        (e as DragEvent).dataTransfer?.setData('application/x-pc-step', row.path.join('.'));
      }}
      onDragOver={(e) => {
        // only same-parent reordering is meaningful
        if (e.dataTransfer?.types.includes('application/x-pc-step')) e.preventDefault();
      }}
      onDrop={drop}
    >
      <button
        type="button"
        data-testid={`step-${index}`}
        aria-current={props.selected ? 'true' : undefined}
        aria-expanded={props.selected}
        style={`padding-left: ${8 + row.depth * 14}px`}
        onClick={() => ops.select(row.path)}
        onKeyDown={key}
      >
        <span class="flow-step-num" data-testid={`step-number-${index}`}>{index + 1}</span>
        <span class={`flow-step-kind kind-${row.step.type}`}>{s(row.step.type)}</span>
        {title !== '' && <span class="flow-step-title" data-testid={`step-title-${index}`}>{title}</span>}
        <span class="flow-step-summary" data-testid={`step-summary-${index}`}>{stepSummary(row.step, names)}</span>
      </button>
      <button
        type="button"
        class="flow-step-btn"
        data-testid={`step-play-${index}`}
        title={s('Play from this step')}
        aria-label={s('Play from step {n}', { n: index + 1 })}
        onClick={() => ops.playFrom(index)}
      >
        <PlayIcon />
      </button>
      {(row.step.type === 'intro' || row.step.type === 'conclusion') && ops.editFraming !== undefined && (
        <button
          type="button"
          class="flow-step-btn"
          data-testid={`step-frame-${index}`}
          title={s(row.step.type === 'intro' ? 'Edit the introduction' : 'Edit the conclusion')}
          aria-label={s(row.step.type === 'intro' ? 'Edit the introduction' : 'Edit the conclusion')}
          onClick={() => ops.editFraming?.(row.step.type === 'intro' ? 'intro' : 'conclusion')}
        >
          <PencilIcon />
        </button>
      )}
      <button
        type="button"
        class="flow-step-btn"
        data-testid={`step-dup-${index}`}
        title={s('Duplicate step')}
        aria-label={s('Duplicate step {n}', { n: index + 1 })}
        onClick={() => ops.duplicate(row.path)}
      >
        <CopyIcon />
      </button>
      {problems.length > 0 && (
        <p class="flow-step-warn" data-testid={`step-warn-${index}`} role="note">
          {problems.join(' ')}
        </p>
      )}
    </li>
  );
}

function StepList(props: { steps: FlatStep[]; sel: number[]; ops: RowOps; names: Names }) {
  return (
    <ol class="flow-steps" data-testid="flow-steps">
      {props.steps.map((fs, i) => (
        <StepRow
          key={fs.path.join('.')}
          row={fs}
          index={i}
          selected={samePath(fs.path, props.sel)}
          ops={props.ops}
          names={props.names}
        />
      ))}
    </ol>
  );
}

function HiddenConnections(props: { doc: Doc; flow: Flow; names: Names; onShow(index: number): void }) {
  const hidden = hiddenLinks(props.doc, props.flow);
  if (hidden.length === 0) return null;
  return (
    <section class="flow-hidden" data-testid="flow-hidden-links" aria-label={s('Hidden connections')}>
      <h3>{s('Hidden connections')}</h3>
      <p class="flow-hint">{s('Hidden here only; the diagram connection is unchanged.')}</p>
      {hidden.map(({ link, index }) => (
        <div class="flow-hidden-row" key={link.id ?? index}>
          <span>{nameOf(props.names, link.from)} → {nameOf(props.names, link.to)}{link.label === undefined ? '' : `: ${link.label}`}</span>
          <button type="button" data-testid={`show-flow-link-${index}`} onClick={() => props.onShow(index)}>
            {s('Show')}
          </button>
        </div>
      ))}
    </section>
  );
}

function FlowList(props: { flows: Flow[]; selFlow: string; onPick(flowKey: string): void; onPlay(flowKey: string): void }) {
  return (
    <ul class="flow-list" data-testid="flow-list">
      {props.flows.map((f) => {
        const key = f.id ?? f.title ?? '';
        return (
          <li key={key} class={props.selFlow === key ? 'active' : ''}>
            <button type="button" data-testid={`flow-row-${key}`} title={f.title ?? f.id} onClick={() => props.onPick(key)}>
              {f.title ?? f.id}
            </button>
            <button type="button" title={s('Play')} aria-label={s('Play flow {title}', { title: key })} data-testid={`flow-play-${key}`} onClick={() => props.onPlay(key)}>
              <PlayIcon />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ActionButton(props: { testid: string; label: string; hint: string; enabled: boolean; onAdd: () => void }) {
  return (
    <button
      type="button"
      class="flow-action"
      data-testid={props.testid}
      disabled={!props.enabled}
      title={props.hint}
      onClick={props.onAdd}
    >
      {props.label}
    </button>
  );
}

/** Primary actions (selection-driven) plus the advanced step types. */
function ActionBar(props: { ready: { msg: boolean; process: boolean }; onAdd(kind: FlowStep['type']): void }) {
  return (
    <>
      <div class="flow-actions" data-testid="flow-actions">
        <ActionButton
          testid="add-msg"
          label={s('Add message')}
          hint={props.ready.msg ? s("Add a message between the connector's shapes") : s('Select a connector on the canvas to add a message.')}
          enabled={props.ready.msg}
          onAdd={() => props.onAdd('msg')}
        />
        <ActionButton
          testid="add-process"
          label={s('Add process')}
          hint={props.ready.process ? s('Add a process step for the selected shape') : s('Select one shape on the canvas to add a process step.')}
          enabled={props.ready.process}
          onAdd={() => props.onAdd('process')}
        />
        <ActionButton testid="add-note" label={s('Add note')} hint={s('Add a note step')} enabled={true} onAdd={() => props.onAdd('info')} />
      </div>
      {!props.ready.msg && (
        <p class="flow-hint" data-testid="flow-needs-link">{s('Select a connector on the canvas to add a message.')}</p>
      )}
      {!props.ready.process && (
        <p class="flow-hint" data-testid="flow-needs-shape">{s('Select one shape on the canvas to add a process step.')}</p>
      )}
      <details class="flow-advanced" data-testid="advanced-steps">
        <summary>{s('Advanced step')}</summary>
        <div class="flow-actions">
          <ActionButton testid="add-alt" label={s('Add alternative')} hint={s('Add an alternative (alt) step')} enabled={true} onAdd={() => props.onAdd('alt')} />
          <ActionButton testid="add-par" label={s('Add parallel')} hint={s('Add a parallel (par) step')} enabled={true} onAdd={() => props.onAdd('par')} />
          <ActionButton testid="add-goto" label={s('Add go to')} hint={s('Add a go to (goto) step')} enabled={true} onAdd={() => props.onAdd('goto')} />
        </div>
      </details>
    </>
  );
}

/**
 * Flows to offer and whether the shown one is the virtual derived flow: a
 * link-only document shows its derived default flow so it is presentable before
 * anyone authors a flow.
 */
function shownFlows(doc: Doc, sel: FlowSelection | null): { flows: Flow[]; virtual: boolean; flowKey: string } {
  const flows = flowsForDisplay(doc);
  const first = flows[0];
  // A fresh panel opens on the first flow: the list is always ready to edit.
  const key = sel?.flow ?? (first === undefined ? '' : flowKey(first));
  return { flows, virtual: derivedFlow(doc) !== null, flowKey: key };
}

function ErrorPane({ noFile }: { noFile: boolean }) {
  return (
    <div class="flow-pane" data-testid="flow-pane">
      <p class="muted" data-testid="flow-error">
        {noFile ? s('Open a file to edit flows.') : s('Active file has parse errors.')}
      </p>
    </div>
  );
}

/** The authored half of the pane: one document, one selection, no step forms. */
function FlowEditor(props: {
  pane: FlowPaneProps;
  doc: Doc;
  sel: FlowSelection | null;
  setSel(next: FlowSelection): void;
}) {
  const { pane, doc, sel, setSel } = props;
  const names = objectNames(doc);
  const { flows, virtual, flowKey: selKey } = shownFlows(doc, sel);
  const flow = flows.find((f) => flowKey(f) === selKey) ?? null;
  const flat = flow === null ? [] : flatSteps(flow);
  const selStep = sel?.flow === selKey ? sel.step : [];
  const ready = canvasReady(pane.canvas);
  const pick = (key: string): void => setSel({ flow: key, step: [] });
  const withFlow = (fn: (f: Flow) => void): void => {
    pane.session.apply((d) => editFlow(d, selKey, fn));
  };
  const ops: RowOps = {
    select: (path) => {
      setSel({ flow: selKey, step: path });
      pane.onHighlight?.(highlightFor(flow, path));
    },
    move: (path, to) => withFlow((f) => moveStep(f, path, to)),
    duplicate: (path) => withFlow((f) => duplicateStep(f, path)),
    playFrom: (i) => pane.onPlayFrom?.(selKey, i + 1),
    ...(pane.onEditFraming === undefined
      ? {}
      : {
        editFraming: (kind) => {
          // The framing prose lives on the flow, so the Properties panel shows
          // the flow itself and moves focus to that one field.
          pick(selKey);
          pane.onEditFraming?.(selKey, kind);
        },
      }),
  };
  const addFlowRow = (): void => {
    const seq = doc.flows.length + 1;
    pane.session.apply((d) => addFlow(d, s('New flow'), seq));
    pick(`flow${seq}`);
  };
  const addStep = (kind: FlowStep['type']): void => {
    const step = seedFor(kind, pane.canvas);
    if (step === null) return;
    pane.session.apply((d) => editFlow(d, selKey, (f) => appendStep(f, step)));
  };

  return (
    <div class="flow-pane" data-testid="flow-pane">
      {flows.length === 0 ? (
        <div class="flow-empty" data-testid="flow-empty">
          <p>{s('A flow is a short guided walkthrough of this diagram.')}</p>
          <p class="flow-hint">{s('Add one, then build it from the shapes and connectors you select on the canvas.')}</p>
          <button type="button" class="flow-action primary" data-testid="flow-add" onClick={addFlowRow}>
            {s('New flow')}
          </button>
        </div>
      ) : (
        <>
          {virtual && (
            <p class="flow-hint" data-testid="flow-derived-hint">
              {s('Derived from the connections in this diagram. Editing it makes it a real flow.')}
            </p>
          )}
          <FlowList flows={flows} selFlow={selKey} onPick={pick} onPlay={pane.onPlay} />
          <div class="flow-list-actions">
            <button type="button" data-testid="flow-add" title={s('Add another flow')} onClick={addFlowRow}>
              {s('New flow')}
            </button>
            <button
              type="button"
              data-testid="flow-export-docs"
              title={s('Export all flows as Markdown documentation')}
              onClick={() =>
                downloadText(
                  flowsMarkdown(doc),
                  `${pane.activePath === null ? 'flows' : stem(pane.activePath)}.flows.md`,
                  'text/markdown',
                )
              }
            >
              {s('All flows (.md)')}
            </button>
          </div>
        </>
      )}
      {flow !== null && (
        <>
          <StepList steps={flat} sel={selStep} ops={ops} names={names} />
          <HiddenConnections doc={doc} flow={flow} names={names} onShow={(index) => pane.session.apply((d) => showFlowLink(d, selKey, index))} />
          <ActionBar ready={ready} onAdd={addStep} />
        </>
      )}
    </div>
  );
}

/** Sidebar "Flows" tab: pick a flow, add steps, and hand the rest to Properties. */
export function FlowPane(props: FlowPaneProps) {
  const [localSel, setLocalSel] = useState<FlowSelection | null>(null);
  const sel = props.selection === undefined ? localSel : props.selection;
  const setSel = (next: FlowSelection): void => {
    if (props.selection === undefined) setLocalSel(next);
    props.onSelection?.(next);
  };
  // The shell's document is null while a file has no header yet; a blank file is
  // simply an empty diagram to this list, so parse the text as a fallback.
  const doc = props.doc ?? (props.activePath === null ? null : parseForEditor(props.textOf(props.activePath) ?? ''));
  // Without an open file there is no document to edit, and a file that does not
  // parse has nothing to show: both are one muted line, never a half-built list.
  if (props.activePath === null || doc === null) {
    return <ErrorPane noFile={props.activePath === null} />;
  }
  return <FlowEditor pane={props} doc={doc} sel={sel} setSel={setSel} />;
}
