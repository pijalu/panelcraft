// SPDX-License-Identifier: GPL-3.0-only
// Virtual default flow: a document that has connections but no authored flow can
// still be presented, by deriving one from the links in the same stable order
// `addFlow` already uses. The derivation is pure and never touches the document:
// opening, presenting, formatting, saving or reloading writes nothing, appends no
// flow and creates no undo entry. The first real edit materialises it through the
// ordinary text round-trip (one undoable command).
import type { Doc, Flow, FlowStep, Link } from '../../engine/model/types';
import { s } from '../strings';
import { topologicalLinks } from './flowDoc';

/** Title of the derived flow (also its printed name once materialised). */
export function derivedFlowTitle(): string {
  return s('Default flow');
}

/**
 * Id the derived flow would get if it were authored now. Using the same id a
 * `New flow` command would produce keeps the selection stable across the edit
 * that materialises it, and keeps presentation keys valid afterwards.
 */
function derivedFlowId(doc: Doc): string {
  return `flow${doc.flows.length + 1}`;
}

function connectionStep(link: Link): FlowStep {
  return {
    type: 'msg',
    from: link.from,
    to: link.to,
    ...(link.label === undefined ? {} : { label: link.label }),
    // Only an existing id is referenced: the derivation must not rewrite links.
    ...(link.id === undefined ? {} : { linkRef: link.id }),
    pos: { line: 0, col: 0 },
  };
}

/**
 * The derived flow, or null. Requirements: a parsed document, no authored flow
 * (an authored flow is always authoritative), and at least one connection that
 * names two shapes the document defines.
 */
export function derivedFlow(doc: Doc | null): Flow | null {
  if (doc === null || doc.flows.length > 0) return null;
  const ids = new Set(doc.objects.map((obj) => obj.id));
  const usable = topologicalLinks(doc).filter(
    ({ link }) => ids.has(link.from) && ids.has(link.to),
  );
  if (usable.length === 0) return null;
  return {
    id: derivedFlowId(doc),
    title: derivedFlowTitle(),
    steps: usable.map(({ link }) => connectionStep(link)),
    pos: { line: 0, col: 0 },
  };
}

/** Flows to show for a document: authored ones, else the derived one. */
export function flowsForDisplay(doc: Doc | null): Flow[] {
  if (doc === null) return [];
  if (doc.flows.length > 0) return doc.flows;
  const derived = derivedFlow(doc);
  return derived === null ? [] : [derived];
}

/**
 * Resolve a flow key the way the player and the editor both need: an authored
 * flow first, then the derived one. Never returns a flow that does not exist.
 */
export function findFlow(doc: Doc | null, key: string): Flow | null {
  if (doc === null) return null;
  const authored =
    doc.flows.find((flow) => flow.id === key) ?? doc.flows.find((flow) => flow.title === key);
  if (authored !== undefined) return authored;
  const derived = derivedFlow(doc);
  if (derived === null) return null;
  return derived.id === key || derived.title === key ? derived : null;
}

/**
 * The flow to mutate for `key`, materialising the derived flow into `doc` first
 * when the edit targets it. Returns null when nothing matches. The caller owns
 * the parse/print cycle, so the materialisation is an ordinary undoable command.
 */
export function flowForEdit(doc: Doc, key: string): Flow | null {
  const authored =
    doc.flows.find((flow) => flow.id === key) ?? doc.flows.find((flow) => flow.title === key);
  if (authored !== undefined) return authored;
  const derived = derivedFlow(doc);
  if (derived === null || (derived.id !== key && derived.title !== key)) return null;
  doc.flows.push(derived);
  return derived;
}
