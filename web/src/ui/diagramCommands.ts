// SPDX-License-Identifier: GPL-3.0-only
// Diagram commands shared by the canvas context menu and the application menu
// (ADR 0007). Both adapters call the same pure selection policy and the same
// controller operations, so an action is enabled and behaves identically
// wherever it is offered. "Reset diagram layout" is one undoable command: it
// clears the file's saved positions and persists a deterministic auto-layout.
import type { CanvasController } from './CanvasController';
import { DEFAULT_SHAPE } from './CanvasController';
import type { Doc } from '../engine/model/types';
import { dagreLayoutEngine } from '../engine/layout/dagre';
import type { RouteResetTarget } from './commandPolicy';

/** Deterministic positions for the whole diagram, from the document's nodes/links. */
export function autoLayoutPositions(doc: Doc, dir: 'LR' | 'TB' | 'RL' | 'BT'): Record<string, { x: number; y: number }> {
  const current: Record<string, { x: number; y: number }> = {};
  const parentOf = new Map<string, string>();
  for (const o of doc.objects) {
    for (const child of o.contains ?? []) parentOf.set(child, o.id);
  }
  const nodes = doc.objects.map((o) => ({
    id: o.id,
    parent: parentOf.get(o.id),
    size: { width: DEFAULT_SHAPE[o.kind]?.w ?? 120, height: DEFAULT_SHAPE[o.kind]?.h ?? 60 },
    pinnedAt: doc.layout?.pins.includes(o.id) === true
      ? (doc.layout.positions.find((p) => p.id === o.id) ?? current[o.id])
      : undefined,
  }));
  const edges = doc.links.map((l) => ({ from: l.from, to: l.to, label: l.label }));
  return dagreLayoutEngine().layout(nodes, edges, { dir });
}

/** Apply one undoable route-reset command chosen by the shared selection policy. */
export function runRouteReset(ctrl: CanvasController, target: RouteResetTarget): void {
  if (target.kind === 'all') ctrl.resetAllRoutes();
  else if (target.kind === 'one') ctrl.resetLinkRoute(target.linkId);
}
