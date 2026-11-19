// SPDX-License-Identifier: GPL-3.0-only
// Every non-empty document has a virtual Default flow derived from its current
// elements. Presenting never writes it. Editing creates an ordinary custom copy,
// while Default flow remains beside it and continues to follow the diagram.
import type { Doc, Flow } from '../../engine/model/types';
import { s } from '../strings';
import { diagramSteps, ensureLinkIds } from './flowDoc';

/** Title of the derived flow. Custom copies receive their own title and id. */
export function derivedFlowTitle(): string {
  return s('Default flow');
}

/** A stable virtual key that cannot collide with an authored id or title. */
function derivedFlowId(doc: Doc): string {
  const used = new Set(doc.flows.flatMap((flow) =>
    [flow.id, flow.title].filter((key): key is string => key !== undefined),
  ));
  let id = 'default';
  let seq = 2;
  while (used.has(id)) {
    id = `default-${seq}`;
    seq += 1;
  }
  return id;
}

/** Turn a fresh derived value into an authored, independently editable copy. */
function customCopy(doc: Doc, derived: Flow): Flow {
  if (derived.steps.some((step) => step.type === 'msg' && step.linkRef?.startsWith('#') === true)) {
    ensureLinkIds(doc);
    derived.steps = diagramSteps(doc);
  }
  derived.id = customFlowId(doc);
  derived.title = s('Custom flow');
  doc.flows.push(derived);
  return derived;
}

/** First free ordinary flow id for a custom copy. */
function customFlowId(doc: Doc): string {
  const used = new Set(doc.flows.map((flow) => flow.id));
  let seq = doc.flows.length + 1;
  while (used.has(`flow${seq}`)) seq += 1;
  return `flow${seq}`;
}

/**
 * Derive a complete walkthrough without changing the document. Connections are
 * message steps; objects not represented by a connection become process steps.
 */
export function derivedFlow(doc: Doc | null): Flow | null {
  if (doc === null || doc.objects.length === 0) return null;
  const steps = diagramSteps(doc);
  if (steps.length === 0) return null;
  return {
    id: derivedFlowId(doc),
    title: derivedFlowTitle(),
    steps,
    pos: { line: 0, col: 0 },
  };
}

/** Flows to show: the current virtual default first, then every custom flow. */
export function flowsForDisplay(doc: Doc | null): Flow[] {
  if (doc === null) return [];
  const derived = derivedFlow(doc);
  return derived === null ? doc.flows : [derived, ...doc.flows];
}

/** Resolve ids before titles; the derived id is reserved by `derivedFlowId`. */
export function findFlow(doc: Doc | null, key: string): Flow | null {
  if (doc === null) return null;
  const byId = doc.flows.find((flow) => flow.id === key);
  if (byId !== undefined) return byId;
  const derived = derivedFlow(doc);
  // `flow1` was the virtual key in earlier builds; accept old presentation URLs.
  if (derived !== null && (derived.id === key || (doc.flows.length === 0 && key === 'flow1'))) {
    return derived;
  }
  const byTitle = doc.flows.find((flow) => flow.title === key);
  if (byTitle !== undefined) return byTitle;
  return derived?.title === key ? derived : null;
}

/**
 * Resolve the flow to mutate. Targeting Default flow creates one custom copy and
 * returns it so both editing surfaces can follow its new id. The derived flow is
 * intentionally not appended itself: it stays virtual and current.
 */
export function flowForEdit(doc: Doc, key: string): Flow | null {
  const byId = doc.flows.find((flow) => flow.id === key);
  if (byId !== undefined) return byId;
  const derived = derivedFlow(doc);
  if (derived !== null && (derived.id === key || (doc.flows.length === 0 && key === 'flow1'))) {
    return customCopy(doc, derived);
  }
  const byTitle = doc.flows.find((flow) => flow.title === key);
  if (byTitle !== undefined) return byTitle;
  if (derived === null || derived.title !== key) return null;
  return customCopy(doc, derived);
}
