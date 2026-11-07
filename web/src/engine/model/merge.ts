// SPDX-License-Identifier: GPL-3.0-only
// Doc-preserving canvas merge (F-01; review §2 D1/D6/D7/D8).
//
// The canvas is a *view* of the document, never a lossy rewrite of it. A canvas
// interaction may only update the objects/links it actually touches; every
// other construct in the file — flows, views (and their `position` lines),
// style statements, imports, meta directives, comments, raw attributes,
// link tags/waypoints — is carried through untouched.
//
// Contract:
//  - objects/links are matched by id; an existing statement is updated in
//    place (untouched fields preserved), new ids are appended in canvas order,
//    ids the canvas no longer has are dropped (the user deleted them there).
//  - links without an id in the file are matched by (from, to) so a canvas
//    edit does not stamp ids onto arrows that never had one.
//  - the document's section order is preserved; appended ids go last so a
//    canvas edit produces the smallest possible diff.
//  - fields the canvas models but the format stores inside `style` (object
//    `dashed`, link `dashed`) are folded into that block, never duplicated.

import type { Doc, Kind, Link, Obj, Pos, StyleBlock } from './types';

/** Structural subset of the UI's canvas object (model sits below ui/). */
export interface CanvasObjectLike {
  id: string;
  kind: Kind;
  name?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  dashed?: boolean;
  icon?: string;
  /** Explicit `size <w> <h>` geometry in document units (F-13). */
  size?: { w: number; h: number };
}

/** Structural subset of the UI's canvas link. */
export interface CanvasLinkLike {
  id: string;
  from: string;
  to: string;
  /** Arrow type (`-requests->`); absent = untyped arrow (F-08). */
  type?: string;
  label?: string;
  dashed?: boolean;
  /** `<->` double-headed link (F-07). */
  bidir?: boolean;
}

export interface CanvasStateLike {
  objects: CanvasObjectLike[];
  links: CanvasLinkLike[];
}

const EMPTY_POS: Pos = { line: 0, col: 0 };

const styleIsEmpty = (s: StyleBlock | undefined): boolean =>
  !s ||
  Object.entries(s).every(
    ([, v]) => v === undefined || v === false || (Array.isArray(v) && v.length === 0),
  );

/**
 * Set/clear one style key, dropping the block when it becomes empty (the
 * printer omits empty blocks, so this keeps output stable — F-05).
 */
function withStyleKey(
  style: StyleBlock | undefined,
  key: 'dashed',
  value: boolean | undefined,
): StyleBlock | undefined {
  const next: StyleBlock = { ...(style ?? {}) };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return styleIsEmpty(next) ? undefined : next;
}

/** Assign or drop an optional field so the printer omits absent values. */
function setField<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function mergeObject(existing: Obj | undefined, c: CanvasObjectLike): Obj {
  const o: Obj = existing ? { ...existing } : { kind: c.kind, id: c.id, pos: EMPTY_POS };
  o.kind = c.kind;
  o.id = c.id;
  setField(o, 'name', c.name);
  setField(o, 'description', c.description);
  setField(o, 'technology', c.technology);
  setField(o, 'icon', c.icon);
  setField(o, 'tags', c.tags && c.tags.length > 0 ? [...c.tags] : undefined);
  // explicit geometry (F-13): written only when the canvas knows it
  setField(o, 'size', c.size === undefined ? undefined : { w: c.size.w, h: c.size.h });
  // dashed lives in the style block on disk (D6)
  const style = withStyleKey(o.style, 'dashed', c.dashed === true ? true : undefined);
  if (style === undefined) delete o.style;
  else o.style = style;
  return o;
}

function mergeLink(existing: Link | undefined, c: CanvasLinkLike): Link {
  const l: Link = existing ? { ...existing } : { from: c.from, to: c.to, pos: EMPTY_POS };
  if (existing === undefined) l.id = c.id;
  l.from = c.from;
  l.to = c.to;
  // untyped stays untyped: no `uses` default (D7/F-08)
  setField(l, 'type', c.type === undefined || c.type === '' ? undefined : c.type);
  setField(l, 'label', c.label);
  setField(l, 'bidir', c.bidir === true ? true : undefined);
  const style = withStyleKey(l.style, 'dashed', c.dashed === true ? true : undefined);
  if (style === undefined) delete l.style;
  else l.style = style;
  return l;
}

const linkKey = (l: Link): string => l.id ?? `${l.from}\u0001${l.to}`;

/** Keep document order for survivors, append ids the canvas added at the end. */
function orderBy<T>(previous: T[], merged: Map<string, T>, key: (x: T) => string): T[] {
  const out: T[] = [];
  const used = new Set<string>();
  for (const item of previous) {
    const k = key(item);
    const next = merged.get(k);
    if (next !== undefined && !used.has(k)) {
      out.push(next);
      used.add(k);
    }
  }
  for (const [k, v] of merged) if (!used.has(k)) out.push(v);
  return out;
}

/**
 * Merge a canvas state into a parsed document (F-01). Pure: returns a new Doc,
 * `doc` is never mutated. State ids with no document counterpart are appended.
 */
export function applyCanvasState(doc: Doc, state: CanvasStateLike): Doc {
  const prevObjects = new Map(doc.objects.map((o) => [o.id, o]));
  const objectsById = new Map<string, Obj>();
  for (const c of state.objects) {
    if (objectsById.has(c.id)) continue; // duplicate canvas ids: first wins
    objectsById.set(c.id, mergeObject(prevObjects.get(c.id), c));
  }

  const prevLinks = new Map(doc.links.map((l) => [linkKey(l), l]));
  const linksById = new Map<string, Link>();
  for (const c of state.links) {
    if (!objectsById.has(c.from) || !objectsById.has(c.to)) continue; // dangling
    const existing = prevLinks.get(c.id) ?? prevLinks.get(`${c.from}\u0001${c.to}`);
    const merged = mergeLink(existing, c);
    const key = linkKey(merged);
    if (linksById.has(key)) continue; // duplicate canvas links: first wins
    linksById.set(key, merged);
  }

  return {
    ...doc,
    objects: orderBy(doc.objects, objectsById, (o) => o.id),
    // canvas links are keyed by their canvas id; an id-less file link keeps
    // its key through linkKey() because mergeLink preserves a missing id
    links: orderBy(doc.links, linksById, linkKey),
  };
}
