// SPDX-License-Identifier: GPL-3.0-only
// Canvas command layer (F-19): clipboard, alignment and distribution as pure
// functions over the canvas model. Keeping them out of the controller makes the
// id remapping and the geometry testable without a DOM.

import type { DiagramLink, DiagramObject, DiagramState } from './CanvasController';

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeAxis = 'x' | 'y';

/** Clipboard payload: absolute positions are re-based on paste. */
export interface Clipboard {
  objects: DiagramObject[];
  links: DiagramLink[];
}

/** Free `<prefix><n>` id not present in `taken` (starts at 1). */
function freeId(taken: Set<string>, prefix: 'o' | 'l'): string {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Copy the selected objects and the links whose BOTH ends are selected.
 * Waypoints/positions are kept so a paste at a new origin translates cleanly.
 */
export function copySelection(state: DiagramState, objects: Set<string>, links: Set<string>): Clipboard {
  const picked = state.objects.filter((o) => objects.has(o.id));
  const ids = new Set(picked.map((o) => o.id));
  const pickedLinks = state.links.filter(
    (l) => links.has(l.id) || (ids.has(l.from) && ids.has(l.to)),
  );
  return {
    objects: picked.map((o) => ({ ...o })),
    links: pickedLinks.map((l) => ({ ...l })),
  };
}

/**
 * Paste a clipboard into a state: every object gets a fresh id (so a paste can
 * never duplicate an existing entity), links are remapped to the new ids and
 * links whose endpoints are not in the clipboard are dropped. `offset` moves the
 * pasted geometry. Returns the new state plus the pasted ids (for selection).
 */
export function pasteClipboard(
  state: DiagramState,
  clip: Clipboard,
  offset = { x: 24, y: 24 },
): { state: DiagramState; objects: string[]; links: string[] } {
  const taken = new Set(state.objects.map((o) => o.id));
  const map = new Map<string, string>();
  for (const o of clip.objects) {
    const id = freeId(taken, 'o');
    taken.add(id);
    map.set(o.id, id);
  }
  const objects = clip.objects.map((o) => ({
    ...o,
    id: map.get(o.id)!,
    x: o.x + offset.x,
    y: o.y + offset.y,
    // a pasted copy has a new identity, so any explicit size stays but the
    // derived label lines are recomputed by the controller
    lines: undefined,
  }));
  const linkTaken = new Set(state.links.map((l) => l.id));
  const links: DiagramLink[] = [];
  for (const l of clip.links) {
    const from = map.get(l.from);
    const to = map.get(l.to);
    if (from === undefined || to === undefined) continue;
    const id = freeId(linkTaken, 'l');
    linkTaken.add(id);
    links.push({ ...l, id, from, to });
  }
  return {
    state: { objects: [...state.objects, ...objects], links: [...state.links, ...links] },
    objects: objects.map((o) => o.id),
    links: links.map((l) => l.id),
  };
}

/** Alignment targets for one mode (edge or centre of the selection's bbox). */
function alignTarget(mode: AlignMode, box: { x: number; y: number; w: number; h: number }): number {
  switch (mode) {
    case 'left':
      return box.x;
    case 'centerX':
      return box.x + box.w / 2;
    case 'right':
      return box.x + box.w;
    case 'top':
      return box.y;
    case 'centerY':
      return box.y + box.h / 2;
    case 'bottom':
      return box.y + box.h;
  }
}

/** Bounding box of the given objects (null when the list is empty). */
export function boundsOf(objects: DiagramObject[]): { x: number; y: number; w: number; h: number } | null {
  if (objects.length === 0) return null;
  const x = Math.min(...objects.map((o) => o.x));
  const y = Math.min(...objects.map((o) => o.y));
  const right = Math.max(...objects.map((o) => o.x + o.w));
  const bottom = Math.max(...objects.map((o) => o.y + o.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Align the given objects inside their own bounding box (no-op under 2). */
export function alignObjects(objects: DiagramObject[], mode: AlignMode): DiagramObject[] {
  const box = boundsOf(objects);
  if (box === null || objects.length < 2) return objects;
  const target = alignTarget(mode, box);
  const horizontal = mode === 'left' || mode === 'centerX' || mode === 'right';
  return objects.map((o) => {
    if (horizontal) {
      const x = mode === 'left' ? target : mode === 'right' ? target - o.w : target - o.w / 2;
      return { ...o, x: Math.round(x) };
    }
    const y = mode === 'top' ? target : mode === 'bottom' ? target - o.h : target - o.h / 2;
    return { ...o, y: Math.round(y) };
  });
}

/**
 * Distribute the given objects evenly between the first and last by centre
 * (needs ≥3 objects; the extremes stay put).
 */
export function distributeObjects(objects: DiagramObject[], axis: DistributeAxis): DiagramObject[] {
  if (objects.length < 3) return objects;
  const sorted = [...objects].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const start = axis === 'x' ? first.x + first.w / 2 : first.y + first.h / 2;
  const end = axis === 'x' ? last.x + last.w / 2 : last.y + last.h / 2;
  const step = (end - start) / (sorted.length - 1);
  const moved = new Map<string, DiagramObject>();
  sorted.forEach((o, i) => {
    if (i === 0 || i === sorted.length - 1) return;
    const centre = start + step * i;
    moved.set(
      o.id,
      axis === 'x' ? { ...o, x: Math.round(centre - o.w / 2) } : { ...o, y: Math.round(centre - o.h / 2) },
    );
  });
  return objects.map((o) => moved.get(o.id) ?? o);
}

/** Give every selected object the size of the largest one (≥2 objects). */
export function equalSizeObjects(objects: DiagramObject[]): DiagramObject[] {
  if (objects.length < 2) return objects;
  const w = Math.max(...objects.map((o) => o.w));
  const h = Math.max(...objects.map((o) => o.h));
  return objects.map((o) => ({ ...o, w, h, size: { w, h } }));
}
