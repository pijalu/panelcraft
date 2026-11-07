// SPDX-License-Identifier: GPL-3.0-only
// Layout for imported (ghost) objects (F-20): they are not document data, so
// their positions are computed for display only — a grid row below the file's
// own objects, deterministic so a reload looks identical.

import type { DiagramObject } from './CanvasController';
import type { CanvasState } from '../workspace/workspace';
import { DEFAULT_SHAPE } from './CanvasController';
import type { GhostObject } from '../engine/model/imports';

const COLS = 5;
const STEP_X = 190;
const STEP_Y = 140;

/** Ghosts placed in rows below the document's objects. */
export function layoutGhosts(
  ghosts: GhostObject[],
  state: CanvasState,
): Array<DiagramObject & { path: string }> {
  if (ghosts.length === 0) return [];
  const bottom = state.objects.reduce((max, o) => Math.max(max, o.y + o.h), 0);
  const startY = bottom + STEP_Y;
  return ghosts.map((g, i) => {
    const size = DEFAULT_SHAPE[g.obj.kind] ?? { w: 160, h: 60 };
    return {
      id: g.ref,
      kind: g.obj.kind,
      x: 40 + (i % COLS) * STEP_X,
      y: startY + Math.floor(i / COLS) * STEP_Y,
      w: size.w,
      h: size.h,
      name: g.obj.name ?? g.obj.id,
      path: g.path,
    };
  });
}
