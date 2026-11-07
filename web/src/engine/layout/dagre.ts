// SPDX-License-Identifier: GPL-3.0-only
// Dagre adapter for the LayoutEngine port (M6-WP3, FR-V3/V4).
//
// Determinism contract: same inputs in any array order → identical output.
// Dagre itself is deterministic for a fixed graph, so the adapter must remove
// input-order as a variable: stable sort nodes by id, edges by (from,to),
// dedupe parallel edges (first wins). Only dagre import in the repo.
import dagre from 'dagre';
import type {
  LayoutEngine,
  LayoutOptions,
  LayoutResult,
} from './ports';

/** Graph cosmetics (canvas units). Kept small; camera fits content anyway. */
const NODESEP = 40;
const RANKSEP = 80;
const MARGIN = 0;

export function dagreLayoutEngine(): LayoutEngine {
  return {
    layout(nodes, edges, opts: LayoutOptions): LayoutResult {
      const g = new dagre.graphlib.Graph({ multigraph: true });
      g.setGraph({
        rankdir: opts.dir,
        nodesep: NODESEP,
        ranksep: RANKSEP,
        marginx: MARGIN,
        marginy: MARGIN,
      });
      g.setDefaultEdgeLabel(() => ({}));

      // Deterministic insertion order (see module doc).
      const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const n of sorted) g.setNode(n.id, { ...n.size });

      const seen = new Set<string>();
      const sortedEdges = [...edges].sort((a, b) =>
        a.from === b.from ? (a.to < b.to ? -1 : a.to > b.to ? 1 : 0) : a.from < b.from ? -1 : 1,
      );
      for (const e of sortedEdges) {
        const key = `${e.from}\u0000${e.to}`;
        if (seen.has(key)) continue; // parallel edges deduped (first wins)
        seen.add(key);
        g.setEdge(e.from, e.to);
      }

      dagre.layout(g);

      const result: LayoutResult = {};
      for (const n of sorted) {
        const placed = g.node(n.id);
        // dagre returns the CENTER; canvas wants top-left (FILE-FORMAT §7.2).
        const p = {
          x: Math.round(placed.x - placed.width / 2),
          y: Math.round(placed.y - placed.height / 2),
        };
        // Pins (FR-V4): saved position wins over computed layout.
        result[n.id] = n.pinnedAt ? { x: n.pinnedAt.x, y: n.pinnedAt.y } : p;
      }
      return result;
    },
  };
}
