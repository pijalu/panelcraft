// SPDX-License-Identifier: GPL-3.0-only
// LayoutEngine port (M6-WP3, FR-V3/V4) — pure contract; engine/layout never
// imports ui or browser globals. Concrete adapter: dagre.ts (ARCHITECTURE.md
// port rule). Tests substitute fake engines.
import type { Dir } from '../model/types';

export interface LayoutSize {
  width: number;
  height: number;
}

export interface LayoutNodeInput {
  id: string;
  size: LayoutSize;
  /** Optional compound parent id (C4 boundary / flowchart subgraph). */
  parent?: string;
  /** Saved/pinned position (canvas units, top-left) — wins over computed layout. */
  pinnedAt?: LayoutPoint;
}

export interface LayoutEdgeInput {
  from: string;
  to: string;
  /** Optional label; parallel edges (same from+to) are deduped (first wins). */
  label?: string;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutOptions {
  /** Layered direction: LR | TB | RL | BT (FILE-FORMAT meta `direction`). */
  dir: Dir;
}

/** id → top-left position (canvas units). */
export type LayoutResult = Record<string, LayoutPoint>;

/** Positions plus measured compound-node sizes (canvas units). */
export interface LayoutGeometryResult {
  positions: LayoutResult;
  sizes: Record<string, LayoutSize>;
}

export interface LayoutEngine {
  /**
   * Deterministic layered layout. Pinned nodes keep their `pinnedAt`
   * positions. Same inputs (in any order) must produce identical output.
   */
  layout(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[], opts: LayoutOptions): LayoutResult;
}
