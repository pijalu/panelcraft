// SPDX-License-Identifier: GPL-3.0-only
// Flow-level properties, rendered in the Properties panel when the flow itself
// (not one of its steps) is being edited: the walkthrough's name and purpose, its
// Markdown notes, the introduction and conclusion prose, and what it becomes when
// presented or exported. The introduction and conclusion are always offered —
// an empty one simply does not exist in the document, so a fresh flow has no
// empty row to clean up.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ILLUSTRATION_IDS, type IllustrationId } from '../../engine/anim/illustrations';
import { flowToMermaid } from '../../engine/format/mermaidSequenceExport';
import { flowMarkdown, markdownFileName } from '../../engine/format/flowMarkdown';
import type { Flow } from '../../engine/model/types';
import { downloadText } from '../download';
import { stem } from '../paths';
import { s } from '../strings';
import { PlayIcon } from '../icons';
import { Field, TextArea, CheckField, fieldClass } from './fields';
import type { FlowSession } from './flowSession';
import { editFlow, flowKey } from './flowEdit';
import { framingPath, framingText, patchFlow, setFraming, type FlowPatch } from './flowDoc';
import type { Doc } from '../../engine/model/types';
import type { FlowSelection } from './flowTypes';

const ILLUSTRATION_LABELS = {
  'travel-token': 'travel token',
  pulse: 'pulse',
  'sequential-glow': 'sequential glow',
  'packet-burst': 'packet burst',
  'compare-split': 'compare split',
  'trail-fade': 'trail fade',
} as const;

/** Same collapsible group the object and step properties use. */
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

export interface FlowPropertiesProps {
  flow: Flow;
  /** Parsed document of the open file (exports and step lookups read it). */
  doc: Doc;
  selection: FlowSelection;
  session: FlowSession;
  /** Path of the open file, for export file names. */
  activePath: string | null;
  dirty?: boolean;
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
  onPlay(flowKey: string): void;
  onSelect(selection: FlowSelection): void;
  /** A framing field to focus, with a counter so a repeat request refocuses. */
  focusField?: { kind: 'intro' | 'conclusion'; nonce: number };
  sections?: Record<string, boolean>;
  onToggleSection?: (id: string) => void;
}

/**
 * Introduction and conclusion are flow furniture, not steps a reader places: the
 * field is always there, and clearing it removes the step from the document so
 * nothing empty is printed or listed.
 */
function FramingField(props: {
  flow: Flow;
  kind: 'intro' | 'conclusion';
  onSet(text: string): void;
  /** Set when this field is the target of a framing-row edit request. */
  focus?: { nonce: number } | undefined;
}) {
  const present = framingPath(props.flow, props.kind) !== null;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (props.focus === undefined) return;
    const el = ref.current;
    if (el === null) return;
    el.focus();
    // Put the caret at the end so typing continues the authored prose.
    el.setSelectionRange(el.value.length, el.value.length);
  }, [props.focus?.nonce]);
  return (
    <>
      <TextArea
        variant="stacked"
        label={s(props.kind === 'intro' ? 'Introduction' : 'Conclusion')}
        hint={s('Shown before the first step')}
        value={framingText(props.flow, props.kind)}
        onInput={(v) => props.onSet(v)}
        testid={`flow-${props.kind}`}
        inputRef={ref}
      />
      {!present && <p class="flow-hint" data-testid={`flow-${props.kind}-hint`}>{s('Empty: not part of this flow.')}</p>}
    </>
  );
}

/** Both framing fields, each able to receive a focus request from a row button. */
function FramingFields(props: {
  flow: Flow;
  focusField?: { kind: 'intro' | 'conclusion'; nonce: number } | undefined;
  onSet(kind: 'intro' | 'conclusion', text: string): void;
}) {
  const focusOf = (kind: 'intro' | 'conclusion'): { nonce: number } | undefined =>
    props.focusField?.kind === kind ? { nonce: props.focusField.nonce } : undefined;
  return (
    <>
      {(['intro', 'conclusion'] as const).map((kind) => (
        <FramingField
          key={kind}
          flow={props.flow}
          kind={kind}
          onSet={(text) => props.onSet(kind, text)}
          focus={focusOf(kind)}
        />
      ))}
    </>
  );
}

export function FlowProperties(props: FlowPropertiesProps) {
  const { flow, doc, selection, session } = props;
  const open = (id: string): boolean => props.sections?.[id] !== false;
  const key = selection.flow;
  const patch = (value: FlowPatch): void => {
    session.apply((doc) => editFlow(doc, key, (target) => patchFlow(target, value)));
    // A flow written without an id is keyed by its title, so follow a rename.
    if (flow.id === undefined && value.title !== undefined && value.title !== '') {
      props.onSelect({ flow: value.title, step: [] });
    }
  };
  const framing = (kind: 'intro' | 'conclusion', text: string): void => {
    session.apply((doc) => editFlow(doc, key, (target) => setFraming(target, kind, text)));
  };
  return (
    <aside class="properties" data-testid="flow-properties" aria-label={s('Properties')}>
      <h2 class="panel-title" data-testid="flow-props-title">{flow.title ?? flow.id}</h2>
      {props.dirty === true && (
        <span class="chip chip-dirty" data-testid="flow-dirty" title={s('Unapplied code edits')}>
          {s('unsaved')}{' '}
        </span>
      )}
      <Group id="flow" title={s('Flow')} open={open('flow')} onToggle={props.onToggleSection}>
        <Field
          variant="stacked"
          label={s('Flow name')}
          hint={s('Shown in the flow list')}
          value={flow.title ?? flow.id ?? ''}
          onInput={(v) => patch({ title: v })}
          testid="flow-title"
        />
        <TextArea
          variant="stacked"
          label={s('Flow purpose')}
          hint={s('What this walkthrough explains')}
          value={flow.description ?? ''}
          onInput={(v) => patch({ description: v })}
          testid="flow-description"
        />
        <TextArea
          variant="stacked"
          label={s('Flow notes (Markdown)')}
          hint={s('Headings, bold, italic, code, lists and links')}
          value={flow.descriptionLines?.join('\n') ?? ''}
          onInput={(v) => patch({ notes: v })}
          testid="flow-notes"
        />
        <FramingFields flow={flow} focusField={props.focusField} onSet={framing} />
      </Group>
      <Group id="flow-presentation" title={s('Presentation')} open={open('flow-presentation')} onToggle={props.onToggleSection}>
        <CheckField
          label={s('Show during presentation')}
          testid="flow-present-notes"
          checked={flow.presentation === true}
          onChange={(checked) => patch({ presentation: checked })}
        />
        {props.onIllustration && (
          <label class={fieldClass('stacked')}>
            <span class="flow-field-label">{s('Illustration style')}</span>
            <select
              data-testid="flow-illustration"
              aria-label={s('Illustration style')}
              title={s('How this flow is illustrated')}
              value={props.illustration ?? 'auto'}
              onChange={(e) => props.onIllustration?.((e.target as HTMLSelectElement).value as IllustrationId | 'auto')}
            >
              <option value="auto">{s('auto')}</option>
              {ILLUSTRATION_IDS.map((id) => (
                <option key={id} value={id}>{s(ILLUSTRATION_LABELS[id])}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          class="flow-action"
          data-testid="flow-present"
          title={s('Play this flow from the start')}
          onClick={() => props.onPlay(flowKey(flow))}
        >
          <PlayIcon />{s('Present')}
        </button>
      </Group>
      <Group id="flow-share" title={s('Share')} open={open('flow-share')} onToggle={props.onToggleSection}>
        <p class="flow-hint">{s('Exports are generated from this flow alone.')}</p>
        <div class="flow-actions">
          <button
            type="button"
            data-testid="flow-export-seq"
            title={s('Export selected flow as Mermaid sequenceDiagram')}
            onClick={() => {
              if (props.activePath !== null) {
                const text = flowToMermaid(doc, flow).text;
                downloadText(text, `${stem(props.activePath)}.seq.mmd`);
              }
            }}
          >
            {s('.seq')}
          </button>
          <button
            type="button"
            data-testid="flow-export-doc"
            title={s('Export selected flow as Markdown documentation')}
            onClick={() => {
              downloadText(flowMarkdown(doc, flow), markdownFileName(flow, props.activePath), 'text/markdown');
            }}
          >
            {s('.md')}
          </button>
        </div>
      </Group>
    </aside>
  );
}
