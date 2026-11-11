// SPDX-License-Identifier: GPL-3.0-only
// M5-WP4 flow editor (FR-F1): sidebar "Flows" tab. Flow list with per-flow
// play, step tree (indented flat list), per-type inline inspectors, and
// structural ops (add/move/remove step, add branch/lane, add flow). All
// edits round-trip through retext() and surface as onChangeText(newText) —
// App forwards to code.machine.textChanged so the sync machine stays the
// single writer (D-M4-6). Takes narrow ports (textOf), no manager import.
import { useRef, useState } from 'preact/hooks';
import { ILLUSTRATION_IDS, type IllustrationId } from '../../engine/anim/illustrations';
import { parsePDL } from '../../engine/format/parser';
import { flowToMermaid } from '../../engine/format/mermaidSequenceExport';
import { downloadText } from '../download';
import { stem } from '../paths';
import type { Branch, Doc, Flow, FlowStep } from '../../engine/model/types';
import { s } from '../strings';
import {
  addBranch,
  duplicateStep,
  addFlow,
  addLane,
  appendStep,
  flatSteps,
  getAt,
  moveStep,
  newStep,
  patchStep,
  removeAt,
  retext,
  type FlatStep,
} from './flowDoc';

export interface FlowPaneProps {
  textOf(path: string): string | null;
  activePath: string | null;
  /** Bumped by the owner on every workspace emit; re-reads the text. */
  version: number;
  /** Persist a mutated document (App → machine.textChanged). */
  onChangeText(text: string): void;
  /** Start playback of a flow in the active file. */
  onPlay(flowKey: string): void;
  /** F-18: start playback at a step (1-based) of a flow. */
  onPlayFrom?(flowKey: string, index: number): void;
  /** F-18: the active file's buffer has unapplied changes. */
  dirty?: boolean;
  /** F-17: illustration style for playback ('auto' follows the beat kind). */
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
}

interface Sel {
  flow: string; // flow id
  step: number[]; // path into the flow ([] = flow-level, nothing selected)
}

type Patch = (p: Partial<FlowStep>) => void;

interface InspectActions {
  patch: Patch;
  move: (d: -1 | 1) => void;
  remove: () => void;
  addBranch: () => void;
  addLane: () => void;
}

const ILLUSTRATION_LABELS = {
  'travel-token': 'travel token',
  pulse: 'pulse',
  'sequential-glow': 'sequential glow',
  'packet-burst': 'packet burst',
  'compare-split': 'compare split',
  'trail-fade': 'trail fade',
} as const;

const KINDS: FlowStep['type'][] = [
  'intro',
  'msg',
  'process',
  'alt',
  'par',
  'goto',
  'info',
  'conclusion',
];

function Field(props: { label: string; value: string; onInput: (v: string) => void; testid: string }) {
  return (
    <label class="flow-field">
      <span class="flow-field-label">{props.label}</span>
      <input
        data-testid={props.testid}
        value={props.value}
        onInput={(e) => props.onInput((e.target as HTMLInputElement).value)}
      />
    </label>
  );
}

function TextFields({ step, patch }: { step: { text: string }; patch: Patch }) {
  return <Field label={s("Text")} value={step.text} onInput={(v) => patch({ text: v })} testid="insp-text" />;
}

function MsgFields({ step, patch }: { step: Extract<FlowStep, { type: 'msg' }>; patch: Patch }) {
  return (
    <>
      <Field label={s("From")} value={step.from} onInput={(v) => patch({ from: v })} testid="insp-from" />
      <Field label={s("To")} value={step.to} onInput={(v) => patch({ to: v })} testid="insp-to" />
      <Field
        label={s("Label")}
        value={step.label ?? ''}
        onInput={(v) => patch({ label: v === '' ? undefined : v })}
        testid="insp-label"
      />
      <label class="flow-field">
        <span class="flow-field-label">{s("Flip")}</span>
        <input
          type="checkbox"
          data-testid="insp-flip"
          checked={step.flip === true}
          onChange={(e) => patch({ flip: (e.target as HTMLInputElement).checked || undefined })}
        />
      </label>
    </>
  );
}

function ProcessFields({ step, patch }: { step: Extract<FlowStep, { type: 'process' }>; patch: Patch }) {
  return (
    <>
      <Field label={s("Target")} value={step.target} onInput={(v) => patch({ target: v })} testid="insp-target" />
      <Field
        label={s("Note")}
        value={step.text ?? ''}
        onInput={(v) => patch({ text: v === '' ? undefined : v })}
        testid="insp-process-note"
      />
    </>
  );
}

function AltFields({ step, patch, addBranch }: { step: Extract<FlowStep, { type: 'alt' }>; patch: Patch; addBranch: () => void }) {
  return (
    <>
      <Field label={s("Label")} value={step.label ?? ''} onInput={(v) => patch({ label: v === '' ? undefined : v })} testid="insp-alt-label" />
      {step.branches.map((b: Branch, i) => (
        <Field
          key={i}
          label={s('Branch {n}', { n: i + 1 })}
          value={b.label}
          onInput={(v) => {
            const branches = step.branches.map((bb, j) => (j === i ? { ...bb, label: v } : bb));
            patch({ branches } as Partial<FlowStep>);
          }}
          testid={`insp-branch-${i}`}
        />
      ))}
      <button type="button" data-testid="insp-branch-add" onClick={addBranch}>{s("+ branch")}</button>
    </>
  );
}

function GotoFields({ step, patch }: { step: Extract<FlowStep, { type: 'goto' }>; patch: Patch }) {
  return (
    <>
      <Field label={s("File")} value={step.file ?? ''} onInput={(v) => patch({ file: v === '' ? undefined : v })} testid="insp-goto-file" />
      <Field label={s("Flow")} value={step.flow} onInput={(v) => patch({ flow: v })} testid="insp-goto-flow" />
      <label class="flow-field">
        <span class="flow-field-label">{s("Return here")}</span>
        <input
          type="checkbox"
          data-testid="insp-goto-here"
          checked={step.ret === 'here'}
          onChange={(e) => patch({ ret: (e.target as HTMLInputElement).checked ? 'here' : undefined })}
        />
      </label>
    </>
  );
}

function StepInspector({ step, a }: { step: FlowStep; a: InspectActions }) {
  return (
    <div class="flow-inspector" data-testid="flow-inspector">
      <div class="flow-insp-head">
        <select
          data-testid="step-kind"
          value={step.type}
          onChange={(e) => a.patch(newStep((e.target as HTMLSelectElement).value as FlowStep['type']))}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{s(k)}</option>
          ))}
        </select>
        <button type="button" data-testid="step-up" onClick={() => a.move(-1)}>{s("↑")}</button>
        <button type="button" data-testid="step-down" onClick={() => a.move(1)}>{s("↓")}</button>
        <button type="button" data-testid="step-remove" onClick={a.remove}>{s("✕")}</button>
      </div>
      {step.type === 'msg' ? (
        <MsgFields step={step} patch={a.patch} />
      ) : step.type === 'process' ? (
        <ProcessFields step={step} patch={a.patch} />
      ) : step.type === 'alt' ? (
        <AltFields step={step} patch={a.patch} addBranch={a.addBranch} />
      ) : step.type === 'par' ? (
        <>
          <Field label={s("Label")} value={step.label ?? ''} onInput={(v) => patchLabel(a.patch, v)} testid="insp-par-label" />
          <button type="button" data-testid="insp-lane-add" onClick={a.addLane}>{s("+ lane")}</button>
        </>
      ) : step.type === 'goto' ? (
        <GotoFields step={step} patch={a.patch} />
      ) : (
        <TextFields step={step} patch={a.patch} />
      )}
    </div>
  );
}

function patchLabel(patch: Patch, v: string): void {
  patch({ label: v === '' ? undefined : v } as Partial<FlowStep>);
}

function stepTitle(step: FlowStep): string {
  if (step.type === 'msg') return step.label ?? `${step.from} → ${step.to}`;
  if (step.type === 'process') return step.target;
  if (step.type === 'alt' || step.type === 'par') return step.label ?? s(step.type);
  if (step.type === 'goto') return `→ ${step.file === undefined ? '' : `${step.file}#`}${step.flow}`;
  return step.text;
}

export interface StepOps {
  select(path: number[]): void;
  /** Move the step at `path` to sibling index `to` (drag-reorder). */
  move(path: number[], to: number): void;
  duplicate(path: number[]): void;
  /** Per-step dwell; undefined clears it (F-18 format attribute). */
  delay(path: number[], ms: number | undefined): void;
  /** Start playback at this step (1-based beat-ish index). */
  playFrom(index: number): void;
}

const isBlockStep = (t: FlowStep['type']): boolean => t === 'alt' || t === 'par';

function StepList(props: { steps: FlatStep[]; sel: number[]; ops: StepOps }) {
  return (
    <ol class="flow-steps" data-testid="flow-steps">
      {props.steps.map((fs, i) => {
        const active =
          fs.path.length === props.sel.length && fs.path.every((v, j) => v === props.sel[j]);
        const parent = fs.path.slice(0, -1).join('.');
        return (
          <li
            key={fs.path.join('.')}
            class={`flow-step${active ? ' active' : ''}`}
            draggable={true}
            data-testid={`step-row-${i}`}
            onDragStart={(e) => {
              (e as DragEvent).dataTransfer?.setData('text/plain', fs.path.join('.'));
              e.dataTransfer?.setData('application/x-pc-step', fs.path.join('.'));
            }}
            onDragOver={(e) => {
              // only same-parent reordering is meaningful
              if (e.dataTransfer?.types.includes('application/x-pc-step')) e.preventDefault();
            }}
            onDrop={(e) => {
              const from = e.dataTransfer?.getData('application/x-pc-step') ?? '';
              if (from === '') return;
              const path = from.split('.').map(Number);
              if (path.slice(0, -1).join('.') !== parent) return; // keep nesting intact
              e.preventDefault();
              const to = fs.path.at(-1);
              if (to !== undefined) props.ops.move(path, to);
            }}
          >
            <button
              type="button"
              data-testid={`step-${i}`}
              style={`padding-left: ${8 + fs.depth * 14}px`}
              onClick={() => props.ops.select(fs.path)}
            >
              <span class={`flow-step-kind kind-${fs.step.type}`}>{s(fs.step.type)}</span>
              <span class="flow-step-title">{stepTitle(fs.step)}</span>
            </button>
            <button
              type="button"
              class="flow-step-btn"
              data-testid={`step-play-${i}`}
              title={s("Play from this step")}
              aria-label={s('Play from step {n}', { n: i + 1 })}
              onClick={() => props.ops.playFrom(i)}
            >
              {s("▶")}{' '}</button>
            <button
              type="button"
              class="flow-step-btn"
              data-testid={`step-dup-${i}`}
              title={s("Duplicate step")}
              aria-label={s('Duplicate step {n}', { n: i + 1 })}
              onClick={() => props.ops.duplicate(fs.path)}
            >
              {s("⧉")}{' '}</button>
            {!isBlockStep(fs.step.type) && (
              <input
                type="number"
                min={0}
                step={100}
                class="flow-step-delay"
                data-testid={`step-delay-${i}`}
                aria-label={s('Step {n} delay in milliseconds', { n: i + 1 })}
                placeholder={s("delay")}
                value={fs.step.delayMs ?? ''}
                onInput={(e) => {
                  const raw = (e.target as HTMLInputElement).value;
                  props.ops.delay(fs.path, raw === '' ? undefined : Number(raw));
                }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FlowList(props: {
  flows: Flow[];
  selFlow: string;
  onPick(flowKey: string): void;
  onPlay(flowKey: string): void;
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
}) {
  return (
    <ul class="flow-list" data-testid="flow-list">
      {props.flows.map((f) => {
        const key = f.id ?? f.title ?? '';
        return (
          <li key={f.id ?? f.title} class={props.selFlow === key ? 'active' : ''}>
            <button type="button" data-testid={`flow-row-${key}`} onClick={() => props.onPick(key)}>
              {f.title ?? f.id}
            </button>
            <button type="button" title={s("Play")} data-testid={`flow-play-${key}`} onClick={() => props.onPlay(key)}>
              {s("▶")}{' '}</button>
            {props.onIllustration && props.selFlow === key && (
              <select
                class="flow-illustration"
                data-testid="flow-illustration"
                aria-label={s("Illustration style")}
                title={s("How this flow is illustrated")}
                value={props.illustration ?? 'auto'}
                onChange={(e) =>
                  props.onIllustration?.((e.target as HTMLSelectElement).value as IllustrationId | 'auto')
                }
              >
                <option value="auto">{s("auto")}</option>
                {ILLUSTRATION_IDS.map((id) => (
                  <option key={id} value={id}>
                    {s(ILLUSTRATION_LABELS[id])}
                  </option>
                ))}
              </select>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StepBar(props: { addKindRef: { current: HTMLSelectElement | null }; onAdd: () => void }) {
  return (
    <div class="flow-stepbar">
      <select ref={props.addKindRef} data-testid="step-add-kind" defaultValue="msg">
        {KINDS.map((k) => (
          <option key={k} value={k}>{s(k)}</option>
        ))}
      </select>
      <button type="button" data-testid="step-add" onClick={props.onAdd}>{s("+ step")}</button>
    </div>
  );
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

/** Resolve the selected flow + step + flattened rows for the editor. */
function locate(doc: Doc, sel: Sel | null): { flow: Flow | null; step: FlowStep | null; flat: FlatStep[] } {
  const flow = sel === null ? null : (doc.flows.find((f) => f.id === sel.flow || f.title === sel.flow) ?? null);
  const step = sel !== null && flow !== null && sel.step.length > 0 ? getAt(flow, sel.step) : null;
  const flat = flow === null ? [] : flatSteps(flow);
  return { flow, step, flat };
}

/** Build a mutator that patches the selected flow through retext. */
function mutator(
  sel: Sel | null,
  apply: (fn: (d: Doc) => void) => void,
): (fn: (f: Flow, path: number[]) => void) => void {
  return (fn) => {
    if (sel === null || sel.step.length === 0) return;
    apply((d) => {
      const f = d.flows.find((x) => x.id === sel.flow || x.title === sel.flow);
      if (f !== undefined) fn(f, sel.step);
    });
  };
}

function makeActions(
  mutateSel: (fn: (f: Flow, path: number[]) => void) => void,
  step: FlowStep | null,
): InspectActions {
  return {
    patch: (p) => mutateSel((f, path) => patchStep(f, path, p)),
    move: (d) =>
      mutateSel((f, path) => {
        const i = path.at(-1);
        if (i !== undefined) moveStep(f, path, i + d);
      }),
    remove: () => mutateSel((f, path) => removeAt(f, path)),
    addBranch: () =>
      mutateSel((f, path) => addBranch(f, path, s('option {n}', { n: (step?.type === 'alt' ? step.branches.length : 0) + 1 }))),
    addLane: () => mutateSel((f, path) => addLane(f, path)),
  };
}

/** Append a step of `kind`, seeding msg/process with real object ids. */
function addKindStep(
  doc: Doc,
  flowKey: string,
  addKindRef: { current: HTMLSelectElement | null },
  apply: (fn: (d: Doc) => void) => void,
): void {
  const kind = (addKindRef.current?.value ?? 'intro') as FlowStep['type'];
  const a0 = doc.objects[0]?.id ?? 'x';
  const a1 = doc.objects[1]?.id ?? a0;
  apply((d) => {
    const f = d.flows.find((x) => x.id === flowKey || x.title === flowKey);
    if (f === undefined) return;
    const s = newStep(kind);
    if (s.type === 'msg') {
      s.from = a0;
      s.to = a1;
    } else if (s.type === 'process') {
      s.target = a0;
    }
    appendStep(f, s);
  });
}

function FlowDetail(props: {
  ops: StepOps;
  dirty?: boolean;
  flat: FlatStep[];
  selStep: number[];
  step: FlowStep | null;
  actions: InspectActions;
  addKindRef: { current: HTMLSelectElement | null };
  onPickStep(p: number[]): void;
  onAddStep(): void;
  onExport(): void;
}) {
  return (
    <>
      <div class="flow-detail-head">
        <span class="panel-title">{s("Steps")}</span>
        <button type="button" data-testid="flow-export-seq" title={s("Export selected flow as Mermaid sequenceDiagram")} onClick={props.onExport}>
          {s(".seq.mmd")}{' '}</button>
        {props.dirty === true && (
          <span class="chip chip-dirty" data-testid="flow-dirty" title={s("Unapplied code edits")}>
            {s("unsaved")}{' '}</span>
        )}
      </div>
      <StepList steps={props.flat} sel={props.selStep} ops={props.ops} />
      <StepBar addKindRef={props.addKindRef} onAdd={props.onAddStep} />
      {props.step !== null && <StepInspector step={props.step} a={props.actions} />}
    </>
  );
}

/** Sidebar "Flows" tab: list flows, edit the selected one, play it. */
export function FlowPane(props: FlowPaneProps) {
  const [sel, setSel] = useState<Sel | null>(null);
  const addKindRef = useRef<HTMLSelectElement | null>(null);
  const text = props.activePath === null ? null : props.textOf(props.activePath);
  const doc: Doc | null = text === null ? null : parsePDL(text).doc;
  if (props.activePath === null || doc === null) {
    return <ErrorPane noFile={props.activePath === null} />;
  }

  const apply = (fn: (d: Doc) => void): void => {
    if (text !== null) {
      const next = retext(text, fn);
      if (next !== null) props.onChangeText(next);
    }
  };
  const pick = (flowKey: string): void => setSel({ flow: flowKey, step: [] });
  const { flow, step, flat } = locate(doc, sel);
  const mutateSel = mutator(sel, apply);
  const actions = makeActions(mutateSel, step);
  const selFlow = sel?.flow ?? '';
  const selStep = sel?.step ?? [];
  /** Mutate the selected flow by its key (stable across edits). */
  const withFlow = (fn: (f: Flow) => void): void => {
    apply((d) => {
      const f = d.flows.find((x) => (x.id ?? x.title ?? '') === selFlow);
      if (f !== undefined) fn(f);
    });
  };
  const ops: StepOps = {
    select: (p) => setSel({ flow: selFlow, step: p }),
    move: (p, to) => withFlow((f) => moveStep(f, p, to)),
    duplicate: (p) => withFlow((f) => duplicateStep(f, p)),
    delay: (p, ms) => withFlow((f) => patchStep(f, p, { delayMs: ms })),
    playFrom: (i) => props.onPlayFrom?.(selFlow, i + 1),
  };

  const addStep = (): void => {
    if (sel !== null) addKindStep(doc, sel.flow, addKindRef, apply);
  };
  const addFlowRow = (): void => {
    const seq = doc.flows.length + 1;
    apply((d) => addFlow(d, s('New flow'), seq));
    pick(`flow${seq}`);
  };

  return (
    <div class="flow-pane" data-testid="flow-pane">
      <FlowList
        flows={doc.flows}
        selFlow={selFlow}
        onPick={pick}
        onPlay={props.onPlay}
        illustration={props.illustration}
        onIllustration={props.onIllustration}
      />
      <button type="button" data-testid="flow-add" onClick={addFlowRow}>{s("+ flow")}</button>
      {flow !== null && (
        <FlowDetail
          ops={ops}
          dirty={props.dirty}
          flat={flat}
          selStep={selStep}
          step={step}
          actions={actions}
          addKindRef={addKindRef}
          onPickStep={(p) => setSel({ flow: selFlow, step: p })}
          onAddStep={addStep}
          onExport={() => {
            if (props.activePath !== null) {
              downloadText(flowToMermaid(doc, flow).text, `${stem(props.activePath)}.seq.mmd`);
            }
          }}
        />
      )}
    </div>
  );
}
