// SPDX-License-Identifier: GPL-3.0-only
// Pure flow-document editing (M5-WP4). The flow editor is "just another text
// producer": it parses the file text, mutates the doc's flows, and prints —
// the resulting text goes through the M4 sync machine (machine.textChanged)
// so persistence, canvas projection, and the sync chip stay honest (D-M4-6).
//
// Step addressing: a path is a list of child indices walking containers —
// [i] top-level step i; alt at i: [i, branch, step, ...]; par at i:
// [i, lane, step, ...]. Mutators operate in place on a caller-owned Flow —
// retext() owns the parse/print lifecycle.
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Branch, Doc, Flow, FlowStep } from '../../engine/model/types';

type StepList = FlowStep[];

/** The list that holds the step addressed by `path` (walks alt branches /
 * par lanes pairwise: [container, branch|lane, step, …]). */
function listAt(flow: Flow, path: number[]): StepList | null {
  let list: StepList = flow.steps;
  let d = 0;
  while (d < path.length) {
    const i = path[d];
    const step = i === undefined ? undefined : list[i];
    if (step === undefined) return null;
    if (d + 1 >= path.length) return list; // path's last index lives in `list`
    const k = path[d + 1];
    if (k === undefined) return null;
    if (step.type === 'alt') {
      const b = step.branches[k];
      if (b === undefined) return null;
      list = b.steps;
    } else if (step.type === 'par') {
      const l = step.lanes[k];
      if (l === undefined) return null;
      list = l;
    } else {
      return null;
    }
    d += 2;
  }
  return list;
}

/** Fetch the step at `path` (child indices through alt branches / par lanes). */
export function getAt(flow: Flow, path: number[]): FlowStep | null {
  const list = listAt(flow, path);
  if (list === null) return null;
  const i = path[path.length - 1];
  const step = i === undefined ? undefined : list[i];
  return step ?? null;
}

/** The list holding the step at `path`, plus its index (for mutators). */
function holder(flow: Flow, path: number[]): { list: StepList; index: number } | null {
  const list = listAt(flow, path);
  const index = path[path.length - 1];
  if (list === null || index === undefined) return null;
  return { list, index };
}

/** Pre-order listing for the editor UI (row rendering + drag context). */
export interface FlatStep {
  path: number[];
  step: FlowStep;
  depth: number;
  branch?: string;
  lane?: number;
}

export function flatSteps(flow: Flow): FlatStep[] {
  const out: FlatStep[] = [];
  const walk = (
    steps: StepList,
    prefix: number[],
    depth: number,
    tag: FlatStep | null,
  ): void => {
    steps.forEach((step, i) => {
      const here = [...prefix, i];
      const meta: FlatStep = {
        path: here,
        step,
        depth,
        ...(tag?.branch === undefined ? {} : { branch: tag.branch }),
        ...(tag?.lane === undefined ? {} : { lane: tag.lane }),
      };
      out.push(meta);
      if (step.type === 'alt') {
        step.branches.forEach((b: Branch, bi: number) => walk(b.steps, [...here, bi], depth + 1, { path: here, step, depth, branch: b.label }));
      } else if (step.type === 'par') {
        step.lanes.forEach((lane: StepList, li: number) => walk(lane, [...here, li], depth + 1, { path: here, step, depth, lane: li }));
      }
    });
  };
  walk(flow.steps, [], 0, null);
  return out;
}

// --- templates ---------------------------------------------------------------

/** Blank step of `kind` (editor "add step"); pos 0:0 (synthetic). */
export function newStep(kind: FlowStep['type']): FlowStep {
  const pos = { line: 0, col: 0 };
  switch (kind) {
    case 'intro':
      return { type: 'intro', text: 'New intro', pos };
    case 'msg':
      return { type: 'msg', from: '', to: '', pos };
    case 'process':
      return { type: 'process', target: '', pos };
    case 'alt':
      return {
        type: 'alt',
        label: 'Alternative',
        pos,
        branches: [
          { label: 'option 1', steps: [], pos },
          { label: 'option 2', steps: [], pos },
        ],
      };
    case 'par':
      return { type: 'par', label: 'In parallel', pos, lanes: [[], []] };
    case 'goto':
      return { type: 'goto', flow: '', pos };
    case 'info':
      return { type: 'info', text: 'Note', pos };
    case 'conclusion':
      return { type: 'conclusion', text: 'Summary', pos };
  }
}

// --- mutators (in place on caller-owned Flow) --------------------------------

export function appendStep(flow: Flow, step: FlowStep): void {
  flow.steps.push(step);
}

export function patchStep(flow: Flow, path: number[], patch: Partial<FlowStep>): void {
  const loc = holder(flow, path);
  if (loc === null) return;
  const cur = loc.list[loc.index];
  if (cur === undefined) return;
  loc.list[loc.index] = { ...cur, ...patch } as FlowStep;
}

export function removeAt(flow: Flow, path: number[]): void {
  const loc = holder(flow, path);
  if (loc === null) return;
  loc.list.splice(loc.index, 1);
}

/** Move a step to `toIndex` within ITS OWN list (drag reorder, FR-F1). */
export function moveStep(flow: Flow, path: number[], toIndex: number): void {
  const loc = holder(flow, path);
  if (loc === null) return;
  const clamped = Math.max(0, Math.min(loc.list.length - 1, toIndex));
  const [moved] = loc.list.splice(loc.index, 1);
  if (moved === undefined) return;
  loc.list.splice(clamped, 0, moved);
}

export function addBranch(flow: Flow, altPath: number[], label: string): void {
  const step = getAt(flow, altPath);
  if (step?.type !== 'alt') return;
  step.branches.push({ label, steps: [], pos: { line: 0, col: 0 } });
}

export function addLane(flow: Flow, parPath: number[]): void {
  const step = getAt(flow, parPath);
  if (step?.type !== 'par') return;
  step.lanes.push([]);
}

// --- doc-level ---------------------------------------------------------------

export function addFlow(doc: Doc, title: string, seq: number): void {
  doc.flows.push({ title, id: `flow${seq}`, steps: [], pos: { line: 0, col: 0 } });
}

/** Parse → mutate → print. null when the text does not parse (editor blocked). */
export function retext(text: string, mutate: (doc: Doc) => void): string | null {
  const { doc } = parsePDL(text);
  if (doc === null) return null;
  mutate(doc);
  return printDoc(doc);
}
