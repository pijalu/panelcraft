// SPDX-License-Identifier: GPL-3.0-only
// Types shared by the two flow surfaces: the step list in the Flow Steps panel
// and the properties that open in the Properties panel when a step is selected.
// They live here so neither surface has to import the other.
import type { CameraSpec, Doc, Flow, FlowStep } from '../../engine/model/types';
import type { FlatStep } from './flowDoc';
import { getAt, flatSteps } from './flowDoc';
import { findFlow } from './derivedFlow';

/** Canvas point in diagram coordinates plus its zoom. */
export interface ViewPoint {
  x: number;
  y: number;
  k: number;
}

/** What the canvas currently offers the flow editor. */
export interface FlowCanvasContext {
  /** Selected object ids. */
  objects: string[];
  /** Selected connector, already resolved to its endpoints. */
  link: { id: string; from: string; to: string; label?: string } | null;
}

/** Which flow and which step inside it the user is working on. */
export interface FlowSelection {
  flow: string; // flow id
  step: number[]; // path into the flow ([] = flow-level, nothing selected)
}

/** id → display name, so no surface asks the reader to memorise ids. */
export type Names = Map<string, string>;

export type Patch = (p: Partial<FlowStep>) => void;

/** Step edits the properties panel performs on the selected step. */
export interface InspectActions {
  patch: Patch;
  move: (d: -1 | 1) => void;
  remove: () => void;
  addBranch: () => void;
  addLane: () => void;
  /** Set (or clear, `null`) the step's camera override. */
  camera: (spec: CameraSpec | null) => void;
  /** Per-step dwell; `undefined` clears it. */
  delay: (ms: number | undefined) => void;
}

/** The flow and step a selection resolves to, plus its flattened rows. */
export interface FlowTarget {
  flow: Flow;
  step: FlowStep | null;
  path: number[];
  flat: FlatStep[];
}

/** Resolve what the selection points at; null when the flow is gone. */
export function resolveTarget(doc: Doc, selection: FlowSelection | null): FlowTarget | null {
  if (selection === null) return null;
  const flow = findFlow(doc, selection.flow);
  if (flow === null) return null;
  const step = selection.step.length === 0 ? null : getAt(flow, selection.step);
  return { flow, step, path: selection.step, flat: flatSteps(flow) };
}

/** id → display name for every shape in the document. */
export function objectNames(doc: Doc): Names {
  return new Map(doc.objects.map((obj) => [obj.id, obj.name ?? obj.id]));
}
