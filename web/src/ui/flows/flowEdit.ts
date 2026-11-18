// SPDX-License-Identifier: GPL-3.0-only
// Flow reading and editing rules shared by the step list and the properties
// panel: how a selection resolves, how a step is named for a reader, and the two
// mutation paths (an ordinary flow edit, and a connector-style edit that must not
// materialise a derived flow).
import { parsePDL } from '../../engine/format/parser';
import {
  patchMsgLinkStyle,
  resolveMsgLink,
  type LinkStylePatch,
  type LinkStyleTarget,
} from '../../engine/flows/linkStyle';
import type { Doc, Flow, FlowStep } from '../../engine/model/types';
import { flowForEdit, flowsForDisplay } from './derivedFlow';
import type { FlowSession } from './flowSession';
import { getAt, addBranch, addLane, moveStep, patchStep, removeAt, setStepCamera } from './flowDoc';
import { objectNames, type FlowSelection, type InspectActions, type Names, type Patch } from './flowTypes';
import type { TargetOption } from './fields';
import { s } from '../strings';

/** Flow key used by selection and by every lookup (id first, then title). */
export function flowKey(flow: Flow): string {
  return flow.id ?? flow.title ?? '';
}

export function nameOf(names: Names, id: string): string {
  return id === '' ? s('no shape') : (names.get(id) ?? id);
}

export function stepTitle(step: FlowStep, names: Names): string {
  // A message card shows its label as the title; the actor summary below
  // already carries "from → to", so an unlabelled message has no title.
  if (step.type === 'msg') return step.label ?? '';
  if (step.type === 'process') return step.text ?? nameOf(names, step.target);
  if (step.type === 'alt' || step.type === 'par') return step.label ?? s(step.type);
  if (step.type === 'goto') return `→ ${step.file === undefined ? '' : `${step.file}#`}${step.flow}`;
  return step.text;
}

/** Actor/link summary shown on the row, independent of the title. */
export function stepSummary(step: FlowStep, names: Names): string {
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

/** Shapes the step points at that the diagram does not define. */
export function stepProblems(step: FlowStep, names: Names): string[] {
  const ids =
    step.type === 'msg' ? [step.from, step.to] : step.type === 'process' ? [step.target] : [];
  return ids
    .filter((id) => !names.has(id))
    .map((id) => s('The shape {id} is not in this diagram.', { id: nameOf(names, id) }));
}

/** Canvas ids a step refers to (used for the canvas highlight). */
export function participantsOf(step: FlowStep): string[] {
  if (step.type === 'msg') return [step.from, step.to].filter((id) => id !== '');
  if (step.type === 'process') return step.target === '' ? [] : [step.target];
  return [];
}

/** Canvas ids to highlight for the step at `path` (null clears the fade). */
export function highlightFor(flow: Flow | null, path: number[]): string[] | null {
  const step = flow === null ? null : getAt(flow, path);
  if (step === null) return null;
  const ids = participantsOf(step);
  return ids.length === 0 ? null : ids;
}

/** Parse for a lookup; a blank file counts as an empty document. */
export function parseText(text: string): Doc | null {
  return parsePDL(text.trim() === '' ? 'pcd 1.0\n' : text).doc;
}

/** Flow keys of a workspace file, read through the same text port as the editor. */
export function flowsInFile(path: string, textOf: (path: string) => string | null): string[] {
  const text = textOf(path);
  if (text === null) return [];
  const doc = parseText(text);
  return doc === null ? [] : flowsForDisplay(doc).map(flowKey);
}

/**
 * Edit the flow behind `key`, materialising the derived default flow into the
 * document on the first real edit (one ordinary undoable command, never on
 * open/present).
 */
export function editFlow(doc: Doc, key: string, fn: (flow: Flow) => void): void {
  const flow = flowForEdit(doc, key);
  if (flow !== null) fn(flow);
}

/** Mutation of the selected flow, written through the one session. */
export type FlowMutator = (fn: (flow: Flow, path: number[]) => void) => void;

export function flowMutator(session: FlowSession, selection: FlowSelection | null): FlowMutator {
  return (fn) => {
    if (selection === null) return;
    session.apply((doc) => editFlow(doc, selection.flow, (flow) => fn(flow, selection.step)));
  };
}

/** Closed domains the properties panel offers for known-value targets. */
export interface InspectorTargets {
  objects: TargetOption[];
  /** Connectors that can be referenced by id, named by their endpoints. */
  links: TargetOption[];
  files: string[];
  flowsOf(path: string): string[];
}

export function inspectorTargets(args: {
  doc: Doc;
  files?: string[];
  activePath: string | null;
  textOf: (path: string) => string | null;
}): InspectorTargets {
  const names: Names = objectNames(args.doc);
  return {
    objects: Array.from(names, ([value, label]) => ({ value, label })),
    links: args.doc.links
      .filter((link) => link.id !== undefined)
      .map((link) => ({
        value: link.id!,
        label: `${nameOf(names, link.from)} → ${nameOf(names, link.to)}${link.label === undefined ? '' : `: ${link.label}`}`,
      })),
    files: args.files ?? [],
    flowsOf: (path) => flowsInFile(path === '' ? (args.activePath ?? '') : path, args.textOf),
  };
}

/**
 * Step actions. A connector-style edit applies to the parsed document rather
 * than to a flow, so a virtual derived flow stays virtual when only a shared
 * animation changes.
 */
export function stepActions(args: {
  session: FlowSession;
  selection: FlowSelection | null;
  step: FlowStep | null;
  linkStyle: (patch: LinkStylePatch) => void;
}): InspectActions {
  const mutate = flowMutator(args.session, args.selection);
  return {
    patch: (p) => mutate((flow, path) => patchStep(flow, path, p)),
    move: (d) =>
      mutate((flow, path) => {
        const i = path.at(-1);
        if (i !== undefined) moveStep(flow, path, i + d);
      }),
    remove: () => mutate((flow, path) => removeAt(flow, path)),
    addBranch: () =>
      mutate((flow, path) =>
        addBranch(flow, path, s('option {n}', { n: (args.step?.type === 'alt' ? args.step.branches.length : 0) + 1 })),
      ),
    addLane: () => mutate((flow, path) => addLane(flow, path)),
    camera: (spec) => mutate((flow, path) => setStepCamera(flow, path, spec)),
    delay: (ms) => mutate((flow, path) => patchStep(flow, path, { delayMs: ms })),
  };
}

/** Connector style edits of a message step, written through the session. */
export function messageLinkStyle(
  session: FlowSession,
  step: FlowStep | null,
): (patch: LinkStylePatch) => void {
  return (patch) => {
    if (step?.type !== 'msg') return;
    session.apply((doc) => patchMsgLinkStyle(doc, step, patch));
  };
}

export function sparkTargetFor(doc: Doc, step: FlowStep | null): LinkStyleTarget | null {
  return step?.type === 'msg' ? resolveMsgLink(doc, step) : null;
}

/** Step patch helper for the optional label field. */
export function patchLabel(patch: Patch, v: string): void {
  patch({ label: v === '' ? undefined : v } as Partial<FlowStep>);
}
