// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13 presentation catalog: the launcher lists every flow in the active
// file with its title, one-line purpose, step count and estimated wall-clock
// length. Pure (Doc in, entries out) so it is testable without a browser and
// shares the plan's own estimate rather than a second timing model.
import { buildPlan } from '../../engine/flows/plan';
import type { Doc, Flow } from '../../engine/model/types';
import { flowsForDisplay, derivedFlow } from './derivedFlow';

export interface FlowEntry {
  /** what the player resolves by: flow id, else the title */
  key: string;
  /** authored id, when the flow has one — the only linkable address */
  flowId?: string;
  title: string;
  description?: string;
  /** playback beats (alt/par expanded) — the honest count for a launcher */
  steps: number;
  /** dwell + camera transit, from the playback plan */
  estimatedMs: number;
  /** true for the virtual flow derived from connections (item 10) */
  derived?: boolean;
}

/** One catalog entry for a flow, derived from its own playback plan. */
function entryFor(doc: Doc, flow: Flow, derived: boolean): FlowEntry {
  const plan = buildPlan({ doc, flow });
  return {
    key: flow.id ?? flow.title ?? plan.flowTitle,
    ...(doc.flows.includes(flow) && flow.id !== undefined ? { flowId: flow.id } : {}),
    title: plan.flowTitle,
    ...(flow.description === undefined ? {} : { description: flow.description }),
    steps: plan.beats.length,
    estimatedMs: plan.estimatedMs,
    ...(derived ? { derived: true } : {}),
  };
}

/** Every presentable flow in the document, in source order. A link-only document
 *  contributes its derived default flow, so it is presentable immediately. */
export function flowCatalog(doc: Doc | null): FlowEntry[] {
  if (doc === null) return [];
  const derived = derivedFlow(doc);
  return flowsForDisplay(doc).map((flow) => entryFor(doc, flow, derived !== null));
}

/** Human duration for the launcher ("8 s", "1 min 35 s"). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds} s`;
}
