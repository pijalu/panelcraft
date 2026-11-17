// SPDX-License-Identifier: GPL-3.0-only
// Top-level layout model (ADR 0007): effective layout resolution and fade
// computation for rendering, plus pure mutations of the document's one layout
// block. No DOM, no dagre — the geometry engine stays behind its port.
import type { Dir, Doc } from '../engine/model/types';

export interface EffectiveLayout {
  /** Explicit layout directive or the implicit auto-with-document-direction. */
  layout: { mode: 'auto'; dir: Dir } | { mode: 'saved' };
  /** ids hidden element-level (`hide <id>`). */
  hiddenIds: Set<string>;
  /** tags hidden (`hide tag <t>`). */
  hiddenTags: Set<string>;
  /** Saved positions in canvas units. */
  positions: Map<string, { x: number; y: number }>;
  /** ids excluded from auto-layout (`pin <id>`). */
  pins: Set<string>;
}

/** Resolve the document's single top-level layout to render state. */
export function effectiveLayout(doc: Doc): EffectiveLayout {
  const l = doc.layout;
  const ev: EffectiveLayout = {
    layout: l?.directive ?? { mode: 'auto', dir: doc.direction ?? 'LR' },
    hiddenIds: new Set(l?.hidden ?? []),
    hiddenTags: new Set(l?.hiddenTags ?? []),
    positions: new Map((l?.positions ?? []).map((p) => [p.id, { x: p.x, y: p.y }])),
    pins: new Set(l?.pins ?? []),
  };
  return ev;
}

/** Ensure the one top-level layout block exists for a mutation. */
function ensure(doc: Doc) {
  doc.layout ??= { positions: [], pins: [], hidden: [], hiddenTags: [], pos: { line: 0, col: 0 } };
  return doc.layout;
}

function toggle(list: string[], id: string): string[] {
  const i = list.indexOf(id);
  if (i < 0) return [...list, id];
  return list.filter((x) => x !== id);
}

export function toggleHideTag(doc: Doc, tag: string): void {
  const l = ensure(doc);
  l.hiddenTags = toggle(l.hiddenTags, tag);
}

export function toggleHideId(doc: Doc, id: string): void {
  const l = ensure(doc);
  l.hidden = toggle(l.hidden, id);
}

export function togglePin(doc: Doc, id: string): void {
  const l = ensure(doc);
  l.pins = toggle(l.pins, id);
}

export function setLayoutDirective(doc: Doc, mode: 'auto' | 'saved', dir?: Dir): void {
  ensure(doc).directive = mode === 'saved'
    ? { mode: 'saved' }
    : { mode: 'auto', dir: dir ?? 'LR' };
}

/** One element passes the filters? (id hides win; tags: any hidden tag matches.) */
function passesFilter(ev: EffectiveLayout, id: string, tags: string[] | undefined, tagFilterActive: boolean): boolean {
  if (ev.hiddenIds.has(id)) return false;
  if (!tagFilterActive) return true;
  return (tags ?? []).some((t) => ev.hiddenTags.has(t));
}

/** A link fades when both endpoints fade, or it is explicitly hidden. */
function linkFades(objFade: Map<string, boolean>, ev: EffectiveLayout, from: string, to: string, id?: string): boolean {
  if (id !== undefined && ev.hiddenIds.has(id)) return true;
  return (objFade.get(from) ?? false) && (objFade.get(to) ?? false);
}

/**
 * Fade sets: an element fades when it matches a hidden tag or an
 * element hide. With no active hides nothing fades. A link fades when BOTH
 * endpoints fade (a relation stays crisp while either side matches).
 */
export function fadeSets(
  doc: Doc,
  ev: EffectiveLayout,
): { objects: Set<string>; links: Set<string> } {
  const active = ev.hiddenTags.size > 0 || ev.hiddenIds.size > 0;
  const objects = new Set<string>();
  const links = new Set<string>();
  if (!active) return { objects, links };
  const tagFilter = ev.hiddenTags.size > 0;
  const objFade = new Map<string, boolean>();
  for (const o of doc.objects) {
    const faded = !passesFilter(ev, o.id, o.tags, tagFilter);
    objFade.set(o.id, faded);
    if (faded) objects.add(o.id);
  }
  for (const l of doc.links) {
    if (linkFades(objFade, ev, l.from, l.to, l.id)) links.add(l.id ?? `${l.from}-${l.to}`);
  }
  return { objects, links };
}
