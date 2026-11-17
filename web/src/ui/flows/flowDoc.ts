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
import type { Branch, CameraSpec, Doc, Flow, FlowStep, Link } from '../../engine/model/types';
import { resolveMsg } from '../../engine/flows/plan';
import { s } from '../strings';

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
      return { type: 'intro', text: s('New intro'), pos };
    case 'msg':
      return { type: 'msg', from: '', to: '', pos };
    case 'process':
      return { type: 'process', target: '', pos };
    case 'alt':
      return {
        type: 'alt',
        label: s('Alternative'),
        pos,
        branches: [
          { label: s('option 1'), steps: [], pos },
          { label: s('option 2'), steps: [], pos },
        ],
      };
    case 'par':
      return { type: 'par', label: s('In parallel'), pos, lanes: [[], []] };
    case 'goto':
      return { type: 'goto', flow: '', pos };
    case 'info':
      return { type: 'info', text: s('Note'), pos };
    case 'conclusion':
      return { type: 'conclusion', text: s('Summary'), pos };
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

/** UX08-WP13: set or clear a step's camera override (`null` = Automatic). */
export function setStepCamera(flow: Flow, path: number[], camera: CameraSpec | null): void {
  patchStep(flow, path, camera === null ? { camera: undefined } : { camera });
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

/**
 * F-18: clone the step at `path` and insert the copy right after it (deep
 * clone — branches/lanes travel with it). Returns false for an unknown path.
 */
export function duplicateStep(flow: Flow, path: number[]): boolean {
  const at = holder(flow, path);
  if (at === null) return false;
  const step = at.list[at.index];
  if (step === undefined) return false;
  at.list.splice(at.index + 1, 0, structuredClone(step));
  return true;
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

export interface IndexedLink {
  link: Link;
  index: number;
}

/** Stable entity ranks: creation order breaks ties, and cyclic leftovers retain
 * their original order. Flow order is a default snapshot, never a live resort. */
function entityRanks(doc: Doc): Map<string, number> {
  const remaining = new Set(doc.objects.map((obj) => obj.id));
  const ordered: string[] = [];
  while (remaining.size > 0) {
    const next = doc.objects.find((obj) =>
      remaining.has(obj.id) && !doc.links.some((link) =>
        link.to === obj.id && link.from !== obj.id && remaining.has(link.from),
      ),
    );
    if (next === undefined) {
      ordered.push(...doc.objects.filter((obj) => remaining.has(obj.id)).map((obj) => obj.id));
      break;
    }
    ordered.push(next.id);
    remaining.delete(next.id);
  }
  return new Map(ordered.map((id, index) => [id, index]));
}

/** Existing connections in topological source order, then creation order. */
export function topologicalLinks(doc: Doc): IndexedLink[] {
  const ranks = entityRanks(doc);
  return doc.links
    .map((link, index) => ({ link, index }))
    .sort((a, b) =>
      (ranks.get(a.link.from) ?? 0) - (ranks.get(b.link.from) ?? 0) || a.index - b.index,
    );
}

/** Explicit references keep parallel links distinct when steps are restored. */
function ensureLinkIds(doc: Doc): void {
  const used = new Set(doc.links.flatMap((link) => link.id === undefined ? [] : [link.id]));
  let seq = 1;
  doc.links.forEach((link) => {
    if (link.id !== undefined) return;
    while (used.has(`L${seq}`)) seq += 1;
    link.id = `L${seq}`;
    used.add(link.id);
    seq += 1;
  });
}

function connectionStep(link: Link): FlowStep {
  return {
    type: 'msg',
    from: link.from,
    to: link.to,
    ...(link.label === undefined ? {} : { label: link.label }),
    ...(link.id === undefined ? {} : { linkRef: link.id }),
    pos: { line: 0, col: 0 },
  };
}

/** Diagram connections absent from this flow's message projection. */
export function hiddenLinks(doc: Doc, flow: Flow): IndexedLink[] {
  const visible = new Set(
    flatSteps(flow)
      .filter(({ step }) => step.type === 'msg')
      .map(({ step }) => step.type === 'msg' ? resolveMsg(doc, step)?.index : undefined)
      .filter((index) => index !== undefined),
  );
  return doc.links.flatMap((link, index) => visible.has(index) ? [] : [{ link, index }]);
}

/** Restore a hidden connection at the end of the manually ordered flow. */
export function showFlowLink(doc: Doc, flowId: string, linkIndex: number): void {
  const flow = doc.flows.find((candidate) => (candidate.id ?? candidate.title) === flowId);
  if (flow === undefined) return;
  ensureLinkIds(doc);
  const link = doc.links[linkIndex];
  if (link !== undefined) appendStep(flow, connectionStep(link));
}

export function addFlow(doc: Doc, title: string, seq: number): void {
  ensureLinkIds(doc);
  const steps = topologicalLinks(doc).map(({ link }) => connectionStep(link));
  doc.flows.push({ title, id: `flow${seq}`, steps, pos: { line: 0, col: 0 } });
}

export interface FlowPatch {
  title?: string;
  description?: string;
  notes?: string;
  presentation?: boolean;
}

/**
 * UX08-WP12: flow-level metadata edits. An empty title is ignored (the grammar
 * needs one). The two description forms are atomic: editing one removes the
 * other, so a flow never carries two competing sources of prose.
 */
export function patchFlow(flow: Flow, patch: FlowPatch): void {
  if (patch.title !== undefined && patch.title !== '') flow.title = patch.title;
  if (patch.description !== undefined) {
    delete flow.descriptionLines;
    if (patch.description === '') delete flow.description;
    else flow.description = patch.description;
  }
  if (patch.notes !== undefined) {
    delete flow.description;
    const value = patch.notes.replace(/\r\n?/g, '\n');
    if (value === '') delete flow.descriptionLines;
    else flow.descriptionLines = value.split('\n');
  }
  if (patch.presentation !== undefined) {
    if (patch.presentation) flow.presentation = true;
    else delete flow.presentation;
  }
}

/** Parse → mutate → print. null when the text does not parse (editor blocked).
 *  A blank file has no header yet, so it is seeded with one before the first
 *  edit — otherwise the first authored flow would print into an invalid file. */
export function retext(text: string, mutate: (doc: Doc) => void): string | null {
  const { doc } = parsePDL(text.trim() === '' ? 'pcd 1.0\n' : text);
  if (doc === null) return null;
  mutate(doc);
  return printDoc(doc);
}
