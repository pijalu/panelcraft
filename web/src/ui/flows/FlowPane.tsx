// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP12 guided flow authoring (FR-F1): Flows pane with an empty state, flow
// name/purpose editing, numbered step cards that name shapes instead of ids, and
// selection-based primary actions (message from the selected connector, process
// from the selected shape, note/intro/conclusion). alt/par/goto stay available
// under "Advanced step". Every edit still round-trips through retext() and
// surfaces as onChangeText(newText) — App forwards to code.machine.textChanged so
// the sync machine stays the single writer (D-M4-6). The pane takes narrow ports
// (textOf, canvas) and never invents a diagram link.
import { useRef, useState } from 'preact/hooks';
import { ILLUSTRATION_IDS, type IllustrationId } from '../../engine/anim/illustrations';
import { parsePDL } from '../../engine/format/parser';
import { flowToMermaid } from '../../engine/format/mermaidSequenceExport';
import { flowMarkdown, flowsMarkdown, markdownFileName } from '../../engine/format/flowMarkdown';
import { downloadText } from '../download';
import { stem } from '../paths';
import type { Branch, CameraSpec, Doc, Flow, FlowStep } from '../../engine/model/types';
import { s } from '../strings';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon, CopyIcon, PlayIcon } from '../icons';
import {
  addBranch,
  addFlow,
  addLane,
  appendStep,
  duplicateStep,
  flatSteps,
  getAt,
  hiddenLinks,
  moveStep,
  newStep,
  patchFlow,
  patchStep,
  removeAt,
  retext,
  setStepCamera,
  showFlowLink,
  type FlatStep,
  type FlowPatch,
} from './flowDoc';
import { derivedFlow, findFlow, flowForEdit, flowsForDisplay } from './derivedFlow';

/** Canvas point in diagram coordinates plus its zoom (UX08-WP13). */
export interface ViewPoint {
  x: number;
  y: number;
  k: number;
}

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
  /** Optional session-owned selection survives docking and close/reopen remounts. */
  selection?: FlowSelection | null;
  onSelection?(selection: FlowSelection): void;
  /** F-17: illustration style for playback ('auto' follows the beat kind). */
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
  /** FLOW-01 canvas context for assisted targeting (never invents links). */
  canvas?: FlowCanvasContext;
  /** Closed domain for `goto` file picks: workspace `.pcd` paths (may be empty). */
  files?: string[];
  /** FLOW-01: fade everything except these participants (null clears). */
  onHighlight?(ids: string[] | null): void;
  /** UX08-WP13: current viewport centre in canvas coords + zoom ("use current view"). */
  currentView?(): ViewPoint | null;
}

/** What the canvas currently offers the flow editor (FLOW-01). */
export interface FlowCanvasContext {
  /** Selected object ids. */
  objects: string[];
  /** Selected connector, already resolved to its endpoints. */
  link: { id: string; from: string; to: string; label?: string } | null;
}

export interface FlowSelection {
  flow: string; // flow id
  step: number[]; // path into the flow ([] = flow-level, nothing selected)
}

type Patch = (p: Partial<FlowStep>) => void;

/** id → display name, so cards never ask the reader to memorise ids. */
type Names = Map<string, string>;

interface InspectActions {
  patch: Patch;
  move: (d: -1 | 1) => void;
  remove: () => void;
  addBranch: () => void;
  addLane: () => void;
  /** UX08-WP13: set (or clear, `null`) the step's camera override. */
  camera: (spec: CameraSpec | null) => void;
}

const ILLUSTRATION_LABELS = {
  'travel-token': 'travel token',
  pulse: 'pulse',
  'sequential-glow': 'sequential glow',
  'packet-burst': 'packet burst',
  'compare-split': 'compare split',
  'trail-fade': 'trail fade',
} as const;

/** Inspector kind conversion order (advanced repair path, not the primary flow). */
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

/**
 * Local draft for a field whose value comes from the file (UX08-WP12). The file
 * round-trip is asynchronous, so binding the input straight to it made every
 * keystroke race the previous apply and drop characters. While the user types,
 * the draft owns the value; elsewhere the file wins (undo, step switch).
 */
function useDraft(value: string): {
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

function Field(props: { label: string; value: string; onInput: (v: string) => void; testid: string }) {
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

/** One option of a closed-domain step target. `reason` disables the choice. */
interface TargetOption {
  value: string;
  label: string;
  reason?: string;
}

/**
 * A known-value step target as a native select. The stored value stays selected
 * even when the domain no longer contains it — shown as a disabled choice with
 * a diagnostic — so loading or editing a file cannot silently drop a target.
 */
function KnownValueField(props: {
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

function TextArea(props: { label: string; value: string; hint: string; onInput: (v: string) => void; testid: string }) {
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

function TextFields({ step, patch }: { step: { text: string }; patch: Patch }) {
  return <Field label={s('Text')} value={step.text} onInput={(v) => patch({ text: v })} testid="insp-text" />;
}

function MsgFields({
  step,
  patch,
  canvas,
}: {
  step: Extract<FlowStep, { type: 'msg' }>;
  patch: Patch;
  canvas?: FlowCanvasContext;
}) {
  const picked = canvas?.objects ?? [];
  return (
    <>
      <div class="flow-field">
        <span class="flow-field-label">{s('From')}</span>
        <output data-testid="insp-from">{step.from === '' ? s('— none —') : step.from}</output>
      </div>
      <div class="flow-field">
        <span class="flow-field-label">{s('To')}</span>
        <output data-testid="insp-to">{step.to === '' ? s('— none —') : step.to}</output>
      </div>
      <p class="flow-hint">{s('Set from the canvas selection')}</p>
      <div class="flow-picks" data-testid="insp-picks">
        <button
          type="button"
          data-testid="insp-pick-from"
          disabled={picked.length !== 1}
          onClick={() => patch({ from: picked[0]! })}
        >
          {s('From selection')}
        </button>
        <button
          type="button"
          data-testid="insp-pick-to"
          disabled={picked.length !== 1}
          onClick={() => patch({ to: picked[0]! })}
        >
          {s('To selection')}
        </button>
        <button
          type="button"
          data-testid="insp-pick-link"
          disabled={canvas?.link == null}
          onClick={() => {
            const link = canvas?.link;
            if (link) patch({ from: link.from, to: link.to });
          }}
        >
          {s('Use connector')}
        </button>
      </div>
      <Field
        label={s('Label')}
        value={step.label ?? ''}
        onInput={(v) => patch({ label: v === '' ? undefined : v })}
        testid="insp-label"
      />
      <label class="flow-field">
        <span class="flow-field-label">{s('Flip')}</span>
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

function ProcessFields({
  step,
  patch,
  canvas,
  objects,
}: {
  step: Extract<FlowStep, { type: 'process' }>;
  patch: Patch;
  canvas?: FlowCanvasContext;
  objects: TargetOption[];
}) {
  const picked = canvas?.objects ?? [];
  return (
    <>
      <KnownValueField
        label={s('Target')}
        testid="insp-target"
        value={step.target}
        options={objects}
        noneLabel={s('— none —')}
        onChange={(target) => patch({ target })}
      />
      <div class="flow-picks">
        <button
          type="button"
          data-testid="insp-pick-target"
          disabled={picked.length !== 1}
          onClick={() => patch({ target: picked[0]! })}
        >
          {s('Target selection')}
        </button>
      </div>
      <Field
        label={s('Note')}
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
      <Field label={s('Label')} value={step.label ?? ''} onInput={(v) => patchLabel(patch, v)} testid="insp-alt-label" />
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
      <button type="button" data-testid="insp-branch-add" onClick={addBranch}>{s('+ branch')}</button>
    </>
  );
}

function GotoFields({
  step,
  patch,
  files,
  flowsOf,
}: {
  step: Extract<FlowStep, { type: 'goto' }>;
  patch: Patch;
  files: string[];
  flowsOf(path: string): string[];
}) {
  const fileOptions: TargetOption[] = files.map((path) => ({ value: path, label: path }));
  // Flow choices depend on the chosen file; without one, use this file's flows.
  const file = step.file ?? '';
  const flowOptions: TargetOption[] = flowsOf(file).map((key) => ({ value: key, label: key }));
  return (
    <>
      <KnownValueField
        label={s('File')}
        testid="insp-goto-file"
        value={file}
        options={fileOptions}
        noneLabel={s('Same file')}
        onChange={(value) => patch({ file: value === '' ? undefined : value })}
      />
      <KnownValueField
        label={s('Flow')}
        testid="insp-goto-flow"
        value={step.flow}
        options={flowOptions}
        onChange={(flow) => patch({ flow })}
      />
      <label class="flow-field">
        <span class="flow-field-label">{s('Return here')}</span>
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

function patchLabel(patch: Patch, v: string): void {
  patch({ label: v === '' ? undefined : v } as Partial<FlowStep>);
}

/** Per-kind inline inspector for the selected step (advanced repair path). */
/** UX08-WP13: the Presentation block — camera mode, recorded view, zoom and
 * transition. Automatic removes the override so the plan's locked table applies;
 * "Use current view" stores the viewport centre in canvas coordinates plus its
 * zoom, so the framing survives a different presentation window size. */
function CameraFields({
  step,
  camera,
  view,
}: {
  step: FlowStep;
  camera: (spec: CameraSpec | null) => void;
  view?: () => ViewPoint | null;
}) {
  const spec = step.camera;
  const mode = spec?.mode ?? 'auto';
  const here = (): CameraSpec => {
    const p = view?.() ?? null;
    return {
      mode: 'focus',
      x: Math.round(p?.x ?? 0),
      y: Math.round(p?.y ?? 0),
      ...(p === null ? {} : { zoom: Math.round(p.k * 100) / 100 }),
    };
  };
  return (
    <div class="flow-camera" data-testid="insp-camera-block">
      <label class="flow-field">
        <span>{s('Camera')}</span>
        <select
          data-testid="insp-camera"
          value={mode}
          onChange={(e) => {
            const next = (e.target as HTMLSelectElement).value;
            if (next === 'auto') camera(null);
            else if (next === 'hold') camera({ mode: 'hold' });
            else camera(here());
          }}
        >
          <option value="auto">{s('Automatic')}</option>
          <option value="hold">{s('Hold')}</option>
          <option value="focus">{s('Use current view')}</option>
        </select>
      </label>
      {spec?.mode === 'focus' && (
        <>
          <button
            type="button"
            class="flow-action"
            data-testid="insp-camera-here"
            onClick={() => camera({ ...here(), ...(spec.durationMs === undefined ? {} : { durationMs: spec.durationMs }) })}
          >
            {s('Use current view')}
          </button>
          <label class="flow-field">
            <span>{s('Zoom')}</span>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="4"
              data-testid="insp-zoom"
              value={spec.zoom ?? ''}
              onChange={(e) =>
                camera({ ...spec, zoom: clampNumber((e.target as HTMLInputElement).value, 0.1, 4) })
              }
            />
          </label>
        </>
      )}
      {spec !== undefined && (
        <label class="flow-field">
          <span>{s('Transition (ms)')}</span>
          <input
            type="number"
            step="10"
            min="0"
            max="300"
            data-testid="insp-duration"
            value={spec.durationMs ?? ''}
            onChange={(e) => camera({ ...spec, durationMs: clampNumber((e.target as HTMLInputElement).value, 0, 300) }) }
          />
        </label>
      )}
      <p class="flow-hint">{s('Automatic fits each step; Hold keeps the previous view.')}</p>
    </div>
  );
}

/** Clamp a numeric field to its documented range (invalid input → nearest). */
function clampNumber(raw: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Closed domains offered by the inspector for known-value step targets. */
interface InspectorTargets {
  objects: TargetOption[];
  files: string[];
  flowsOf(path: string): string[];
}

function StepInspector({ step, a, canvas, view, targets }: {
  step: FlowStep;
  a: InspectActions;
  canvas?: FlowCanvasContext;
  view?: () => ViewPoint | null;
  targets: InspectorTargets;
}) {
  return (
    <div class="flow-inspector" data-testid="flow-inspector">
      <div class="flow-insp-head">
        <select
          data-testid="step-kind"
          aria-label={s('Step type')}
          value={step.type}
          onChange={(e) => a.patch(newStep((e.target as HTMLSelectElement).value as FlowStep['type']))}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{s(k)}</option>
          ))}
        </select>
        <button type="button" data-testid="step-up" aria-label={s('Move step up')} onClick={() => a.move(-1)}><ArrowUpIcon /></button>
        <button type="button" data-testid="step-down" aria-label={s('Move step down')} onClick={() => a.move(1)}><ArrowDownIcon /></button>
        <button type="button" data-testid="step-remove" aria-label={s('Remove step')} onClick={a.remove}><CloseIcon /></button>
      </div>
      <Field
        label={s('Description')}
        value={step.description ?? ''}
        onInput={(v) => a.patch({ description: v === '' ? undefined : v })}
        testid="insp-description"
      />
      <CameraFields step={step} camera={a.camera} {...(view === undefined ? {} : { view })} />
      {step.type === 'msg' ? (
        <MsgFields step={step} patch={a.patch} canvas={canvas} />
      ) : step.type === 'process' ? (
        <ProcessFields step={step} patch={a.patch} canvas={canvas} objects={targets.objects} />
      ) : step.type === 'alt' ? (
        <AltFields step={step} patch={a.patch} addBranch={a.addBranch} />
      ) : step.type === 'par' ? (
        <>
          <Field label={s('Label')} value={step.label ?? ''} onInput={(v) => patchLabel(a.patch, v)} testid="insp-par-label" />
          <button type="button" data-testid="insp-lane-add" onClick={a.addLane}>{s('+ lane')}</button>
        </>
      ) : step.type === 'goto' ? (
        <GotoFields step={step} patch={a.patch} files={targets.files} flowsOf={targets.flowsOf} />
      ) : (
        <TextFields step={step} patch={a.patch} />
      )}
    </div>
  );
}

/** id → display name for every shape in the document. */
function objectNames(doc: Doc): Names {
  const names: Names = new Map();
  for (const obj of doc.objects) names.set(obj.id, obj.name ?? obj.id);
  return names;
}

function nameOf(names: Names, id: string): string {
  return id === '' ? s('no shape') : (names.get(id) ?? id);
}

function stepTitle(step: FlowStep, names: Names): string {
  // A message card shows its label as the title; the actor summary below
  // already carries "from → to", so an unlabelled message has no title.
  if (step.type === 'msg') return step.label ?? '';
  if (step.type === 'process') return step.text ?? nameOf(names, step.target);
  if (step.type === 'alt' || step.type === 'par') return step.label ?? s(step.type);
  if (step.type === 'goto') return `→ ${step.file === undefined ? '' : `${step.file}#`}${step.flow}`;
  return step.text;
}

/** FLOW-01: actor/link summary shown on the card, independent of the title. */
function stepSummary(step: FlowStep, names: Names): string {
  if (step.type === 'msg') {
    const pair = `${nameOf(names, step.from)} → ${nameOf(names, step.to)}`;
    return step.flip === true ? `${pair} (flipped)` : pair;
  }
  if (step.type === 'process') return nameOf(names, step.target);
  if (step.type === 'alt') return s('{n} branches', { n: step.branches.length });
  if (step.type === 'par') return s('{n} lanes', { n: step.lanes.length });
  if (step.type === 'goto') return step.flow;
  return s(step.type);
}

/** Shapes the step points at that the diagram does not define (WP12). */
function stepProblems(step: FlowStep, names: Names): string[] {
  const ids =
    step.type === 'msg' ? [step.from, step.to] : step.type === 'process' ? [step.target] : [];
  return ids
    .filter((id) => !names.has(id))
    .map((id) => s('The shape {id} is not in this diagram.', { id: nameOf(names, id) }));
}

/** FLOW-01: canvas ids a step refers to (used for the highlight). */
export function participantsOf(step: FlowStep): string[] {
  if (step.type === 'msg') return [step.from, step.to].filter((id) => id !== '');
  if (step.type === 'process') return step.target === '' ? [] : [step.target];
  return [];
}

export interface StepOps {
  select(path: number[]): void;
  /** Move the step at `path` to sibling index `to` (drag-reorder). */
  move(path: number[], to: number): void;
  duplicate(path: number[]): void;
  hide(path: number[]): void;
  /** Per-step dwell; undefined clears it (F-18 format attribute). */
  delay(path: number[], ms: number | undefined): void;
  /** Start playback at this step (1-based beat-ish index). */
  playFrom(index: number): void;
}

const isBlockStep = (t: FlowStep['type']): boolean => t === 'alt' || t === 'par';

function StepCard(props: { row: FlatStep; index: number; selected: boolean; ops: StepOps; names: Names }) {
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
  // Keyboard equivalent of the drag handle (WP12): Alt+↑/↓ reorders siblings.
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
        style={`padding-left: ${8 + row.depth * 14}px`}
        onClick={() => ops.select(row.path)}
        onKeyDown={key}
      >
        <span class="flow-step-num" data-testid={`step-number-${index}`}>{index + 1}</span>
        <span class={`flow-step-kind kind-${row.step.type}`}>{s(row.step.type)}</span>
        {title !== '' && <span class="flow-step-title" data-testid={`step-title-${index}`}>{title}</span>}
        <span class="flow-step-summary" data-testid={`step-summary-${index}`}>{stepSummary(row.step, names)}</span>
        {row.step.description !== undefined && (
          <span class="flow-step-desc" data-testid={`step-desc-${index}`}>{row.step.description}</span>
        )}
      </button>
      {row.step.type === 'msg' && (
        <button
          type="button"
          class="flow-step-btn"
          data-testid={`hide-connection-${index}`}
          title={s('Hide connection in this flow')}
          aria-label={s('Hide connection at step {n}', { n: index + 1 })}
          onClick={() => ops.hide(row.path)}
        >
          <CloseIcon />
        </button>
      )}
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
      {!isBlockStep(row.step.type) && (
        <input
          type="number"
          min={0}
          step={100}
          class="flow-step-delay"
          data-testid={`step-delay-${index}`}
          aria-label={s('Step {n} delay in milliseconds', { n: index + 1 })}
          placeholder={s('delay')}
          value={row.step.delayMs ?? ''}
          onInput={(e) => {
            const raw = (e.target as HTMLInputElement).value;
            ops.delay(row.path, raw === '' ? undefined : Number(raw));
          }}
        />
      )}
      {problems.length > 0 && (
        <p class="flow-step-warn" data-testid={`step-warn-${index}`} role="note">
          {problems.join(' ')}
        </p>
      )}
    </li>
  );
}

function StepList(props: { steps: FlatStep[]; sel: number[]; ops: StepOps; names: Names }) {
  return (
    <ol class="flow-steps" data-testid="flow-steps">
      {props.steps.map((fs, i) => (
        <StepCard
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

function HiddenConnections(props: {
  doc: Doc;
  flow: Flow;
  names: Names;
  onShow(index: number): void;
}) {
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

function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
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
          <li key={key} class={props.selFlow === key ? 'active' : ''}>
            <button type="button" data-testid={`flow-row-${key}`} title={f.title ?? f.id} onClick={() => props.onPick(key)}>
              {f.title ?? f.id}
            </button>
            <button type="button" title={s('Play')} aria-label={s('Play flow {title}', { title: key })} data-testid={`flow-play-${key}`} onClick={() => props.onPlay(key)}>
              <PlayIcon />
            </button>
            {props.onIllustration && props.selFlow === key && (
              <select
                class="flow-illustration"
                data-testid="flow-illustration"
                aria-label={s('Illustration style')}
                title={s('How this flow is illustrated')}
                value={props.illustration ?? 'auto'}
                onChange={(e) =>
                  props.onIllustration?.((e.target as HTMLSelectElement).value as IllustrationId | 'auto')
                }
              >
                <option value="auto">{s('auto')}</option>
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

function ActionButton(props: {
  testid: string;
  label: string;
  hint: string;
  enabled: boolean;
  onAdd: () => void;
}) {
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
function ActionBar(props: {
  ready: { msg: boolean; process: boolean };
  onAdd(kind: FlowStep['type']): void;
}) {
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
        <ActionButton testid="add-intro" label={s('Add introduction')} hint={s('Add an introduction step')} enabled={true} onAdd={() => props.onAdd('intro')} />
        <ActionButton testid="add-conclusion" label={s('Add conclusion')} hint={s('Add a conclusion step')} enabled={true} onAdd={() => props.onAdd('conclusion')} />
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

function FlowMeta(props: {
  flow: Flow;
  dirty?: boolean;
  onPatch(patch: FlowPatch): void;
  onPresent(): void;
  onExport(): void;
  onExportDoc(): void;
}) {
  return (
    <>
      <div class="flow-detail-head">
        <span class="panel-title">{s('Steps')}</span>
        <div class="flow-head-actions">
          <button type="button" data-testid="flow-present" title={s('Play this flow from the start')} onClick={props.onPresent}>
            <PlayIcon />{s('Present')}
          </button>
          <button type="button" data-testid="flow-export-seq" title={s('Export selected flow as Mermaid sequenceDiagram')} onClick={props.onExport}>
            {s('.seq')}
          </button>
          <button type="button" data-testid="flow-export-doc" title={s('Export selected flow as Markdown documentation')} onClick={props.onExportDoc}>
            {s('.md')}
          </button>
        </div>
        {props.dirty === true && (
          <span class="chip chip-dirty" data-testid="flow-dirty" title={s('Unapplied code edits')}>
            {s('unsaved')}{' '}
          </span>
        )}
      </div>
      <div class="flow-meta">
        <Field
          label={s('Flow name')}
          value={props.flow.title ?? props.flow.id ?? ''}
          onInput={(v) => props.onPatch({ title: v })}
          testid="flow-title"
        />
        <TextArea
          label={s('Flow purpose')}
          hint={s('What this walkthrough explains')}
          value={props.flow.description ?? ''}
          onInput={(v) => props.onPatch({ description: v })}
          testid="flow-description"
        />
        <TextArea
          label={s('Flow notes (Markdown)')}
          hint={s('Headings, bold, italic, code, lists and links')}
          value={props.flow.descriptionLines?.join('\n') ?? ''}
          onInput={(v) => props.onPatch({ notes: v })}
          testid="flow-notes"
        />
        <label class="flow-field">
          <span class="flow-field-label">{s('Show during presentation')}</span>
          <input
            type="checkbox"
            data-testid="flow-present-notes"
            checked={props.flow.presentation === true}
            onChange={(e) => props.onPatch({ presentation: (e.currentTarget as HTMLInputElement).checked })}
          />
        </label>
      </div>
    </>
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
function locate(doc: Doc, sel: FlowSelection | null): { flow: Flow | null; step: FlowStep | null; flat: FlatStep[] } {
  const flow = sel === null ? null : findFlow(doc, sel.flow);
  const step = sel !== null && flow !== null && sel.step.length > 0 ? getAt(flow, sel.step) : null;
  const flat = flow === null ? [] : flatSteps(flow);
  return { flow, step, flat };
}

/**
 * Edit the flow behind `key`, materialising the derived default flow into `doc`
 * on the first real edit (one ordinary undoable command, never on open/present).
 */
function editFlow(doc: Doc, key: string, fn: (flow: Flow) => void): void {
  const flow = flowForEdit(doc, key);
  if (flow !== null) fn(flow);
}

/** Build a mutator that patches the selected flow through retext. */
function mutator(
  sel: FlowSelection | null,
  apply: (fn: (d: Doc) => void) => void,
): (fn: (f: Flow, path: number[]) => void) => void {
  return (fn) => {
    if (sel === null || sel.step.length === 0) return;
    apply((d) => {
      editFlow(d, sel.flow, (f) => fn(f, sel.step));
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
    camera: (spec) => mutateSel((f, path) => setStepCamera(f, path, spec)),
  };
}

/** Flow key used by selection and by every lookup (id first, then title). */
function flowKey(flow: Flow): string {
  return flow.id ?? flow.title ?? '';
}

/** Flow keys of a workspace file, read through the same text port as the editor. */
function flowsInFile(path: string, textOf: FlowPaneProps['textOf']): string[] {
  const text = textOf(path);
  if (text === null) return [];
  const doc = parseForEditor(text);
  return doc === null ? [] : flowsForDisplay(doc).map(flowKey);
}

/**
 * Append a step of `kind` seeded from the canvas selection. Impossible actions
 * (no selected connector/shape) append nothing — the editor never invents links.
 */
function addKindStep(
  apply: (fn: (d: Doc) => void) => void,
  key: string,
  kind: FlowStep['type'],
  canvas: FlowCanvasContext | undefined,
): void {
  const step = seedFor(kind, canvas);
  if (step === null) return;
  apply((d) => {
    editFlow(d, key, (f) => appendStep(f, step));
  });
}

/** Canvas ids to highlight for the step at `path` (null clears the fade). */
function highlightFor(flow: Flow | null, path: number[]): string[] | null {
  const step = flow === null ? null : getAt(flow, path);
  if (step === null) return null;
  const ids = participantsOf(step);
  return ids.length === 0 ? null : ids;
}

interface EditorProps {
  pane: FlowPaneProps;
  text: string;
  doc: Doc;
  sel: FlowSelection | null;
  setSel(next: FlowSelection): void;
}

/**
 * Flows to offer and whether the selection is the virtual derived one (item 10).
 * A link-only document shows its derived default flow so it is presentable before
 * anyone authors a flow.
 */
function displayState(doc: Doc, sel: FlowSelection | null): { flows: Flow[]; virtual: boolean; effective: FlowSelection | null } {
  const flows = flowsForDisplay(doc);
  const first = flows[0];
  // A fresh panel opens on the first flow: the editor is always ready to edit.
  const effective = sel ?? (first === undefined ? null : { flow: flowKey(first), step: [] });
  return { flows, virtual: derivedFlow(doc) !== null, effective };
}

/**
 * The file round-trip is asynchronous. Keep the last applied source so a
 * second edit immediately after the first cannot rebuild from stale text and
 * silently drop it; a workspace version bump means the file is authoritative.
 */
function usePendingText(text: string, version: number): { read(): string; write(next: string): void } {
  const pending = useRef(text);
  const seen = useRef(version);
  if (seen.current !== version) {
    seen.current = version;
    pending.current = text;
  }
  return {
    read: () => pending.current,
    write: (next) => { pending.current = next; },
  };
}

/** The authored half of the pane: one parsed document, one selection. */
function FlowEditor({ pane, text, doc, sel, setSel }: EditorProps) {
  const source = usePendingText(text, pane.version);
  const apply = (fn: (d: Doc) => void): void => {
    const next = retext(source.read(), fn);
    if (next !== null) {
      source.write(next);
      pane.onChangeText(next);
    }
  };
  const names = objectNames(doc);
  // Closed domains for the inspector's known-value pickers. Object labels use
  // the same name map as the step cards; a `goto` file's flows are read through
  // the text port, so no second source of truth is introduced.
  const targets: InspectorTargets = {
    objects: Array.from(names, ([value, label]) => ({ value, label })),
    files: pane.files ?? [],
    flowsOf: (path) => flowsInFile(path === '' ? (pane.activePath ?? '') : path, pane.textOf),
  };
  const { flows, virtual, effective } = displayState(doc, sel);
  const { flow, step, flat } = locate(doc, effective);
  const selKey = effective?.flow ?? '';
  const selStep = effective?.step ?? [];
  const ready = canvasReady(pane.canvas);
  const pick = (key: string): void => setSel({ flow: key, step: [] });

  /** Mutate the selected flow by its key (stable across edits). The derived flow
   *  is written into the file on this first real edit and not before. */
  const withFlow = (fn: (f: Flow) => void): void => {
    apply((d) => editFlow(d, selKey, fn));
  };
  const actions = makeActions(mutator(effective, apply), step);
  const ops: StepOps = {
    select: (p) => {
      setSel({ flow: selKey, step: p });
      pane.onHighlight?.(highlightFor(flow, p)); // FLOW-01 canvas highlight
    },
    move: (p, to) => withFlow((f) => moveStep(f, p, to)),
    duplicate: (p) => withFlow((f) => duplicateStep(f, p)),
    hide: (p) => withFlow((f) => removeAt(f, p)),
    delay: (p, ms) => withFlow((f) => patchStep(f, p, { delayMs: ms })),
    playFrom: (i) => pane.onPlayFrom?.(selKey, i + 1),
  };

  const addFlowRow = (): void => {
    const seq = doc.flows.length + 1;
    apply((d) => addFlow(d, s('New flow'), seq));
    pick(`flow${seq}`);
  };
  const onPatch = (patch: FlowPatch): void => {
    withFlow((f) => patchFlow(f, patch));
    // A flow written without `as <id>` is keyed by its title; follow the rename.
    if (flow !== null && flow.id === undefined && patch.title !== undefined) pick(patch.title);
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
          <FlowList
            flows={flows}
            selFlow={selKey}
            onPick={pick}
            onPlay={pane.onPlay}
            illustration={pane.illustration}
            onIllustration={pane.onIllustration}
          />
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
          <FlowMeta
            flow={flow}
            {...(pane.dirty === undefined ? {} : { dirty: pane.dirty })}
            onPatch={onPatch}
            onPresent={() => pane.onPlay(selKey)}
            onExport={() => {
              if (pane.activePath !== null) {
                downloadText(flowToMermaid(doc, flow).text, `${stem(pane.activePath)}.seq.mmd`);
              }
            }}
            onExportDoc={() => {
              downloadText(flowMarkdown(doc, flow), markdownFileName(flow, pane.activePath), 'text/markdown');
            }}
          />
          <StepList steps={flat} sel={selStep} ops={ops} names={names} />
          <HiddenConnections doc={doc} flow={flow} names={names} onShow={(index) => apply((d) => showFlowLink(d, selKey, index))} />
          <ActionBar ready={ready} onAdd={(kind) => addKindStep(apply, selKey, kind, pane.canvas)} />
          {step !== null && <StepInspector step={step} a={actions} canvas={pane.canvas} targets={targets} {...(pane.currentView === undefined ? {} : { view: pane.currentView })} />}
        </>
      )}
    </div>
  );
}

/** Parse for the editor; a blank file counts as an empty document. */
function parseForEditor(text: string): Doc | null {
  return parsePDL(text.trim() === '' ? 'pcd 1.0\n' : text).doc;
}

/** Sidebar "Flows" tab: create, describe, build and play a flow. */
export function FlowPane(props: FlowPaneProps) {
  const [localSel, setLocalSel] = useState<FlowSelection | null>(null);
  const sel = props.selection === undefined ? localSel : props.selection;
  const setSel = (next: FlowSelection): void => {
    if (props.selection === undefined) setLocalSel(next);
    props.onSelection?.(next);
  };
  const text = props.activePath === null ? null : props.textOf(props.activePath);
  const doc = text === null ? null : parseForEditor(text);
  if (text === null || doc === null) return <ErrorPane noFile={props.activePath === null} />;
  return <FlowEditor pane={props} text={text} doc={doc} sel={sel} setSel={setSel} />;
}
