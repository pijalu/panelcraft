// SPDX-License-Identifier: GPL-3.0-only
// What the Properties panel shows while a flow is being edited: the selected
// step's properties, or the flow's own when no step is selected. The panel hosts
// this instead of the object/link fields, because a reader who is working on a
// walkthrough should not have to hunt for its controls in the step list.
import type { IllustrationId } from '../../engine/anim/illustrations';
import type { Doc } from '../../engine/model/types';
import { s } from '../strings';
import type { FlowSession } from './flowSession';
import { inheritedStepValues, inspectorTargets, messageLinkStyle, sparkTargetFor, stepActions } from './flowEdit';
import { resolveTarget, type FlowCanvasContext, type FlowSelection, type ViewPoint } from './flowTypes';
import { FlowProperties, type FlowPropertiesProps } from './FlowProperties';
import { StepProperties, type StepPropertiesProps } from './StepProperties';
import type { Flow, FlowStep } from '../../engine/model/types';
import { pick } from './pick';
import { flowHistoryKeyDown } from './flowHistory';

export interface FlowPanelProps {
  /** Parsed document of the open file. */
  doc: Doc;
  selection: FlowSelection;
  /** The same editing session the step list writes through. */
  session: FlowSession;
  activePath: string | null;
  /** Read access to any workspace file, for `goto` targets. */
  textOf(path: string): string | null;
  files?: string[];
  canvas?: FlowCanvasContext;
  view?: () => ViewPoint | null;
  dirty?: boolean;
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
  onPlay(flowKey: string): void;
  onSelect(selection: FlowSelection): void;
  sections?: Record<string, boolean>;
  onToggleSection?(id: string): void;
  /** A framing field to focus, with a counter so a repeat request refocuses. */
  focusField?: { kind: 'intro' | 'conclusion'; nonce: number };
}

export function FlowPanel(props: FlowPanelProps) {
  const target = resolveTarget(props.doc, props.selection);
  if (target === null) {
    return (
      <aside class="properties" data-testid="flow-panel" aria-label={s('Properties')}>
        <p class="muted panel-empty">{s('A flow is not open. Pick one in Flow Steps, or add a new one.')}</p>
      </aside>
    );
  }
  // Each view owns its own `<aside>`: nesting two would double the panel chrome,
  // and would give a selected step a flow-level panel id it does not have.
  if (target.step === null) return <FlowProperties {...flowPropsOf(props, target.flow)} />;
  return (
    <aside class="properties" data-testid="step-panel" aria-label={s('Properties')} onKeyDown={flowHistoryKeyDown}>
      <StepProperties {...stepPropsOf(props, target.step)} index={rowIndexOf(target.flat, props.selection.step)} />
    </aside>
  );
}

/** Props of the flow-level view. */
function flowPropsOf(props: FlowPanelProps, flow: Flow): FlowPropertiesProps {
  return {
    flow,
    doc: props.doc,
    selection: props.selection,
    session: props.session,
    activePath: props.activePath,
    ...pick({
      dirty: props.dirty,
      illustration: props.illustration,
      onIllustration: props.onIllustration,
      sections: props.sections,
      onToggleSection: props.onToggleSection,
    }),
    onPlay: props.onPlay,
    onSelect: props.onSelect,
    ...(props.focusField === undefined ? {} : { focusField: props.focusField }),
  };
}

/** Props of the step view; the step's own edits go through the shared session. */
function stepPropsOf(props: FlowPanelProps, step: FlowStep): Omit<StepPropertiesProps, 'index'> {
  const linkStyle = messageLinkStyle(props.session, step);
  return {
    step,
    a: stepActions({ session: props.session, selection: props.selection, step, linkStyle, onSelect: props.onSelect }),
    inherited: inheritedStepValues(props.doc, step),
    targets: inspectorTargets({
      doc: props.doc,
      ...(props.files === undefined ? {} : { files: props.files }),
      activePath: props.activePath,
      textOf: props.textOf,
    }),
    sparkTarget: sparkTargetFor(props.doc, step),
    linkStyle,
    ...pick({
      canvas: props.canvas,
      view: props.view,
      sections: props.sections,
      onToggleSection: props.onToggleSection,
    }),
  };
}

/** Position of the selected path among the flattened rows (for row-scoped ids). */
function rowIndexOf(flat: Array<{ path: number[] }>, path: number[]): number {
  const index = flat.findIndex((row) => row.path.length === path.length && row.path.every((v, i) => v === path[i]));
  return index === -1 ? 0 : index;
}
