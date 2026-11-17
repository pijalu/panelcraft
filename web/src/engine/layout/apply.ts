// SPDX-License-Identifier: GPL-3.0-only
// "Apply layout to file" (M6-WP3, FILE-FORMAT §7.2, ADR 0007) — explicit-commit
// pure function. Writes computed positions into the single top-level `layout`
// state; nothing else mutates the doc. Never called automatically.
import type { Doc } from '../model/types';

export interface ApplyLayoutReport {
  doc: Doc;
  /** ids actually written (known objects; unknown ids filtered). */
  written: string[];
}

/**
 * Persist computed object positions in the top-level layout block. Existing
 * entries for the same ids are replaced; pins, hides, the layout directive and
 * every other document statement are preserved. Ids are sorted so the printed
 * document is canonical and stable. One call = one document change.
 */
export function writePositions(
  doc: Doc,
  positions: Record<string, { x: number; y: number }>,
): ApplyLayoutReport {
  const known = new Set(doc.objects.map((o) => o.id));
  const ids = Object.keys(positions)
    .filter((id) => known.has(id))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const next: Doc = structuredClone(doc);
  if (ids.length === 0) return { doc: next, written: [] };
  next.layout ??= { positions: [], pins: [], hidden: [], hiddenTags: [], pos: { line: 0, col: 0 } };

  const byId = new Map(ids.map((id) => [id, positions[id]!]));
  const kept = next.layout.positions.filter((p) => !byId.has(p.id));
  for (const id of ids) {
    kept.push({ id, x: byId.get(id)!.x, y: byId.get(id)!.y });
  }
  next.layout.positions = kept;
  return { doc: next, written: ids };
}
