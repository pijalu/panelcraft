// SPDX-License-Identifier: GPL-3.0-only
// Pure document operations for route/layout reset (bugs.md, ADR 0007).
// Every operation returns a new Doc (never mutates its input) so one caller can
// commit one undoable change. Route operations deliberately never touch layout
// positions; layout reset clears them and writes the computed layout atomically.
import type { Doc } from './types';

type Point = { x: number; y: number };

/** Clear waypoints and both endpoint anchors on exactly one link. */
export function resetLinkRouteDoc(doc: Doc, linkId: string): Doc {
  const link = doc.links.find((l) => l.id === linkId);
  if (link === undefined) return doc;
  const next = structuredClone(doc);
  const target = next.links.find((l) => l.id === linkId)!;
  delete target.waypoints;
  delete target.fromAnchor;
  delete target.toAnchor;
  return next;
}

/** Reset every link's route in one document operation (no object positions change). */
export function resetAllRoutes(doc: Doc): Doc {
  const next = structuredClone(doc);
  for (const link of next.links) {
    delete link.waypoints;
    delete link.fromAnchor;
    delete link.toAnchor;
  }
  return next;
}

/**
 * Clear all saved positions, then write the deterministic auto-layout in one
 * document operation. Unknown ids are ignored and ids are sorted so identical
 * input always prints identically (ADR 0007 command contract).
 */
export function resetDiagramLayout(doc: Doc, positions: Record<string, Point>): Doc {
  const next = structuredClone(doc);
  if (next.layout !== undefined) next.layout.positions = [];
  const known = new Set(next.objects.map((o) => o.id));
  const ids = Object.keys(positions)
    .filter((id) => known.has(id))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ids.length === 0) return next;
  next.layout ??= { positions: [], pins: [], hidden: [], hiddenTags: [], pos: { line: 0, col: 0 } };
  next.layout.positions = ids.map((id) => ({ id, x: positions[id]!.x, y: positions[id]!.y }));
  return next;
}
