// SPDX-License-Identifier: GPL-3.0-only
// Properties of the selected flow step, rendered in the Properties panel. The
// sections are ordered by how often a reader changes them: what the step is and
// who takes part, then where the camera looks, then playback timing, then the
// shared connector animation, and last the repair-level switches.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Branch, CameraSpec, FlowStep } from '../../engine/model/types';
import {
  SPARK_COUNT_BOUNDS,
  SPARK_SPEED_BOUNDS,
  validSparkCount,
  validSparkSpeed,
  type LinkStylePatch,
  type LinkStyleTarget,
} from '../../engine/flows/linkStyle';
import type { FlowCanvasContext, InspectActions, Patch, ViewPoint } from './flowTypes';
import type { InspectorTargets } from './flowEdit';
import { patchLabel } from './flowEdit';
import { newStep } from './flowDoc';
import { CheckField, Field, KnownValueField, TextArea, clampNumber } from './fields';
import { s } from '../strings';
import { ArrowDownIcon, ArrowUpIcon, CloseIcon } from '../icons';

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
 * Collapsible group in the properties panel. The open state is the layout's
 * persisted section state, so a reader who collapses Advanced keeps it closed
 * for every step.
 */
function Group(props: {
  id: string;
  title: string;
  open: boolean;
  onToggle?: (id: string) => void;
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

function TextFields({ step, patch }: { step: { text: string }; patch: Patch }) {
  return <Field variant="stacked" label={s('Text')} value={step.text} onInput={(v) => patch({ text: v })} testid="insp-text" />;
}

function MsgFields(props: {
  step: Extract<FlowStep, { type: 'msg' }>;
  patch: Patch;
  objects: InspectorTargets['objects'];
  links: InspectorTargets['links'];
}) {
  const { step, patch } = props;
  return (
    <>
      <KnownValueField
        label={s('From')}
        testid="insp-from"
        value={step.from}
        options={props.objects}
        noneLabel={s('— none —')}
        onChange={(from) => patch({ from, linkRef: undefined } as Partial<FlowStep>)}
      />
      <KnownValueField
        label={s('To')}
        testid="insp-to"
        value={step.to}
        options={props.objects}
        noneLabel={s('— none —')}
        onChange={(to) => patch({ to, linkRef: undefined } as Partial<FlowStep>)}
      />
      <KnownValueField
        label={s('Connector')}
        testid="insp-link"
        value={step.linkRef ?? ''}
        options={props.links}
        noneLabel={s('Match the endpoints')}
        onChange={(id) => patch({ linkRef: id === '' ? undefined : id })}
      />
      <Field
        label={s('Label')}
        value={step.label ?? ''}
        onInput={(v) => patch({ label: v === '' ? undefined : v })}
        testid="insp-label"
      />
    </>
  );
}

function ProcessFields(props: {
  step: Extract<FlowStep, { type: 'process' }>;
  patch: Patch;
  objects: InspectorTargets['objects'];
}) {
  return (
    <>
      <KnownValueField
        label={s('Target')}
        testid="insp-target"
        value={props.step.target}
        options={props.objects}
        noneLabel={s('— none —')}
        onChange={(target) => props.patch({ target })}
      />
      <Field
        label={s('Note')}
        value={props.step.text ?? ''}
        onInput={(v) => props.patch({ text: v === '' ? undefined : v })}
        testid="insp-process-note"
      />
    </>
  );
}

function AltFields(props: {
  step: Extract<FlowStep, { type: 'alt' }>;
  patch: Patch;
  addBranch: () => void;
}) {
  return (
    <>
      <Field label={s('Label')} value={props.step.label ?? ''} onInput={(v) => patchLabel(props.patch, v)} testid="insp-alt-label" />
      {props.step.branches.map((b: Branch, i) => (
        <Field
          key={i}
          label={s('Branch {n}', { n: i + 1 })}
          value={b.label}
          onInput={(v) => {
            const branches = props.step.branches.map((bb, j) => (j === i ? { ...bb, label: v } : bb));
            props.patch({ branches } as Partial<FlowStep>);
          }}
          testid={`insp-branch-${i}`}
        />
      ))}
      <button type="button" data-testid="insp-branch-add" onClick={props.addBranch}>{s('+ branch')}</button>
    </>
  );
}

function GotoFields(props: {
  step: Extract<FlowStep, { type: 'goto' }>;
  patch: Patch;
  targets: InspectorTargets;
}) {
  const fileOptions = props.targets.files.map((path) => ({ value: path, label: path }));
  // Flow choices depend on the chosen file; without one, use this file's flows.
  const file = props.step.file ?? '';
  const flowOptions = props.targets.flowsOf(file).map((key) => ({ value: key, label: key }));
  return (
    <>
      <KnownValueField
        label={s('File')}
        testid="insp-goto-file"
        value={file}
        options={fileOptions}
        noneLabel={s('Same file')}
        onChange={(value) => props.patch({ file: value === '' ? undefined : value })}
      />
      <KnownValueField
        label={s('Flow')}
        testid="insp-goto-flow"
        value={props.step.flow}
        options={flowOptions}
        onChange={(flow) => props.patch({ flow })}
      />
      <CheckField
        label={s('Return here')}
        testid="insp-goto-here"
        checked={props.step.ret === 'here'}
        onChange={(checked) => props.patch({ ret: checked ? 'here' : undefined })}
      />
    </>
  );
}

/** Shared connector animation for the selected message, not a step field. */
function SparkFields(props: { target: LinkStyleTarget; linkStyle: (p: LinkStylePatch) => void }) {
  const target = props.target;
  const style = target.status === 'ok' ? target.link.style : undefined;
  const reason =
    target.status === 'unresolved-ref'
      ? s('This step points to connector {ref}, which is not in the diagram.', { ref: target.ref })
      : target.status === 'ambiguous'
        ? s('Several connectors match these endpoints. Select one on the canvas to set its reference.')
        : target.status === 'missing'
          ? s("No connector matches this step's endpoints.")
          : null;
  const edit = (key: 'sparks' | 'speed', raw: string, valid: (n: number) => boolean, fallback: number): void => {
    if (target.status !== 'ok') return;
    const value = Number(raw);
    if (raw.trim() === '' || !valid(value)) return;
    props.linkStyle({ [key]: value === fallback ? null : value });
  };
  return (
    <div class="flow-shared-style" role="group" aria-label={s('Shared link animation')} data-testid="insp-shared-style">
      <p class="flow-hint">{s('Changes apply to every step using this connector.')}</p>
      <label class="flow-field">
        <span class="flow-field-label">{s('Max sparks')}</span>
        <input
          type="number"
          min={SPARK_COUNT_BOUNDS.min}
          max={SPARK_COUNT_BOUNDS.max}
          step="1"
          data-testid="insp-sparks"
          disabled={reason !== null}
          value={style?.sparks ?? 1}
          onInput={(e) => edit('sparks', (e.target as HTMLInputElement).value, validSparkCount, 1)}
        />
      </label>
      <label class="flow-field">
        <span class="flow-field-label">{s('Spark speed')}</span>
        <input
          type="number"
          min={SPARK_SPEED_BOUNDS.min}
          max={SPARK_SPEED_BOUNDS.max}
          step={SPARK_SPEED_BOUNDS.step}
          data-testid="insp-speed"
          disabled={reason !== null}
          value={style?.speed ?? 1}
          onInput={(e) => edit('speed', (e.target as HTMLInputElement).value, validSparkSpeed, 1)}
        />
      </label>
      {reason !== null && (
        <p class="flow-hint flow-unresolved" role="status" data-testid="insp-spark-reason">{reason}</p>
      )}
    </div>
  );
}

/**
 * The Presentation block — camera mode, recorded view, zoom and transition.
 * Automatic removes the override so the plan's locked table applies; "Use
 * current view" stores the viewport centre in canvas coordinates plus its zoom,
 * so the framing survives a different presentation window size.
 */
function CameraFields(props: { step: FlowStep; camera: (spec: CameraSpec | null) => void; view?: () => ViewPoint | null }) {
  const spec = props.step.camera;
  const mode = spec?.mode ?? 'auto';
  const here = (): CameraSpec => {
    const p = props.view?.() ?? null;
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
            if (next === 'auto') props.camera(null);
            else if (next === 'hold') props.camera({ mode: 'hold' });
            else props.camera(here());
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
            onClick={() => props.camera({ ...here(), ...(spec.durationMs === undefined ? {} : { durationMs: spec.durationMs }) })}
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
              onChange={(e) => props.camera({ ...spec, zoom: clampNumber((e.target as HTMLInputElement).value, 0.1, 4) })}
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
            onChange={(e) => props.camera({ ...spec, durationMs: clampNumber((e.target as HTMLInputElement).value, 0, 300) })}
          />
        </label>
      )}
      <p class="flow-hint">{s('Automatic fits each step; Hold keeps the previous view.')}</p>
    </div>
  );
}

/** Per-step dwell. Keystrokes stay local until the value settles: one edit, one undo. */
function DelayField(props: { index: number; value?: number; onCommit(ms: number | undefined): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The value the document already holds, in the input's own spelling. The quiet
  // period can fire before the field is left, so blur must not write the same
  // delay a second time.
  const written = useRef<string>(props.value === undefined ? '' : String(props.value));
  useEffect(() => {
    written.current = props.value === undefined ? '' : String(props.value);
  }, [props.value]);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  const commit = (raw: string): void => {
    if (raw !== written.current) {
      written.current = raw;
      props.onCommit(raw === '' ? undefined : Number(raw));
    }
    setDraft(null);
  };
  const edit = (raw: string): void => {
    setDraft(raw);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      commit(raw);
    }, 120);
  };
  return (
    <label class="flow-field">
      <span class="flow-field-label">{s('Delay (ms)')}</span>
      <input
        type="number"
        min={0}
        step={100}
        class="flow-step-delay"
        data-testid={`step-delay-${props.index}`}
        aria-label={s('Step {n} delay in milliseconds', { n: props.index + 1 })}
        placeholder={s('delay')}
        value={draft ?? props.value ?? ''}
        onInput={(e) => edit((e.target as HTMLInputElement).value)}
        onBlur={(e) => {
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = null;
          commit((e.target as HTMLInputElement).value);
        }}
      />
    </label>
  );
}

export interface StepPropertiesProps {
  step: FlowStep;
  /** Row index of the step, so row-scoped test ids stay meaningful. */
  index: number;
  a: InspectActions;
  canvas?: FlowCanvasContext;
  view?: () => ViewPoint | null;
  targets: InspectorTargets;
  sparkTarget: LinkStyleTarget | null;
  /** Edit the resolved connector's shared animation (message steps only). */
  linkStyle: (patch: LinkStylePatch) => void;
  sections?: Record<string, boolean>;
  onToggleSection?: (id: string) => void;
}

/** Fields that only make sense for one step kind. */
function KindFields(props: {
  step: FlowStep;
  a: InspectActions;
  targets: InspectorTargets;
}) {
  const { step, a, targets } = props;
  switch (step.type) {
    case 'msg':
      return <MsgFields step={step} patch={a.patch} objects={targets.objects} links={targets.links} />;
    case 'process':
      return <ProcessFields step={step} patch={a.patch} objects={targets.objects} />;
    case 'alt':
      return <AltFields step={step} patch={a.patch} addBranch={a.addBranch} />;
    case 'par':
      return (
        <>
          <Field label={s('Label')} value={step.label ?? ''} onInput={(v) => patchLabel(a.patch, v)} testid="insp-par-label" />
          <button type="button" data-testid="insp-lane-add" onClick={a.addLane}>{s('+ lane')}</button>
        </>
      );
    case 'goto':
      return <GotoFields step={step} patch={a.patch} targets={targets} />;
    default:
      return <TextFields step={step} patch={a.patch} />;
  }
}

export function StepProperties(props: StepPropertiesProps) {
  const { step, a, sections, onToggleSection } = props;
  const open = (id: string): boolean => sections?.[id] !== false;
  const group = (id: string, title: string, children: ComponentChildren) => (
    <Group id={id} title={title} open={open(id)} onToggle={onToggleSection}>{children}</Group>
  );
  return (
    <div class="flow-inspector" data-testid="step-inspector">
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
      {group(
        'step',
        s('Step'),
        <>
          <KindFields step={step} a={a} targets={props.targets} />
          <TextArea
            variant="stacked"
            label={s('Description')}
            hint={s('Shown beside the drawing while presenting. Markdown.')}
            value={step.description ?? ''}
            onInput={(v) => a.patch({ description: v === '' ? undefined : v })}
            testid="insp-description"
          />
        </>,
      )}
      {group('step-camera', s('Camera'), <CameraFields step={step} camera={a.camera} {...(props.view === undefined ? {} : { view: props.view })} />)}
      {group(
        'step-playback',
        s('Playback'),
        <>
          {!isBlockStep(step.type) && <DelayField index={props.index} value={step.delayMs} onCommit={a.delay} />}
          <label class="flow-field">
            <span class="flow-field-label">{s('Advance')}</span>
            <select
              data-testid="insp-advance"
              value={step.advance ?? 'end'}
              onChange={(e) => {
                const value = (e.target as HTMLSelectElement).value as 'click' | 'end';
                a.patch({ advance: value === 'end' ? undefined : value });
              }}
            >
              <option value="end">{s('At end of animation')}</option>
              <option value="click">{s('At click')}</option>
            </select>
          </label>
        </>,
      )}
      {step.type === 'msg' && props.sparkTarget !== null &&
        group('step-connector', s('Connector animation'), <SparkFields target={props.sparkTarget} linkStyle={props.linkStyle} />)}
      {group(
        'step-advanced',
        s('Advanced'),
        <>
          {step.type === 'msg' && (
            <>
              <CheckField
                label={s('Flip')}
                testid="insp-flip"
                checked={step.flip === true}
                onChange={(checked) => a.patch({ flip: checked || undefined })}
              />
              {step.linkRef !== undefined && (
                <p class="muted" data-testid="insp-link-ref">{s('connector:')}{' '}{step.linkRef}</p>
              )}
              <button type="button" data-testid={`hide-connection-${props.index}`} onClick={a.remove}>
                {s('Hide connection in this flow')}
              </button>
            </>
          )}
        </>,
      )}
    </div>
  );
}

const isBlockStep = (t: FlowStep['type']): boolean => t === 'alt' || t === 'par';
