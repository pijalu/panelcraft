// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13 presentation catalog: the launcher lists every flow in the active
// file with its title, one-line purpose, step count and estimated wall-clock
// length. Pure (Doc in, entries out) so it is testable without a browser and
// shares the plan's own estimate rather than a second timing model.
import { buildPlan } from '../../engine/flows/plan';
import type { Doc } from '../../engine/model/types';

export interface FlowEntry {
  /** what the player resolves by: flow id, else the title */
  key: string;
  title: string;
  description?: string;
  /** playback beats (alt/par expanded) — the honest count for a launcher */
  steps: number;
  /** dwell + camera transit, from the playback plan */
  estimatedMs: number;
}

/** Every flow in the document, in source order. */
export function flowCatalog(doc: Doc | null): FlowEntry[] {
  if (doc === null) return [];
  return doc.flows.map((flow) => {
    const plan = buildPlan({ doc, flow });
    return {
      key: flow.id ?? flow.title ?? plan.flowTitle,
      title: plan.flowTitle,
      ...(flow.description === undefined ? {} : { description: flow.description }),
      steps: plan.beats.length,
      estimatedMs: plan.estimatedMs,
    };
  });
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
