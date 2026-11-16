// SPDX-License-Identifier: GPL-3.0-only
// View model ops (M6-WP2, FR-V2/V4) — pure mutations over Doc.views used via
// flowDoc.retext (parse → mutate → print → machine.textChanged single writer).
// Effective-view resolution for rendering lives here too (no DOM, no dagre).
import type { Doc, Dir, View, ViewLine } from '../../engine/model/types';
import { DEFAULT_VIEW_NAME } from '../../engine/layout/apply';

export interface EffectiveView {
  /** Layout directive for the view (default: auto with doc direction, LR fallback). */
  layout: { mode: 'auto'; dir: Dir } | { mode: 'saved' };
  /** ids hidden element-level (`hide <id>`). */
  hiddenIds: Set<string>;
  /** tags hidden (`hide tag <t>`). */
  hiddenTags: Set<string>;
  /** Saved positions (canvas units). */
  positions: Map<string, { x: number; y: number }>;
  /** ids excluded from auto-layout (`pin <id>`). */
  pins: Set<string>;
}

export const DEFAULT_VIEW = DEFAULT_VIEW_NAME;

/** First view with the given name; `undefined` = the implicit default view,
 * resolved to the explicit "Default" view when one exists. */
export function findView(doc: Doc, name?: string): View | undefined {
  if (name === undefined) return doc.views.find((v) => v.name === DEFAULT_VIEW_NAME);
  return doc.views.find((v) => v.name === name);
}

/** Resolve a view (or the implicit default when absent) to render state. */
export function effectiveView(doc: Doc, name?: string): EffectiveView {
  const ev: EffectiveView = {
    layout: { mode: 'auto', dir: doc.direction ?? 'LR' },
    hiddenIds: new Set(),
    hiddenTags: new Set(),
    positions: new Map(),
    pins: new Set(),
  };
  const v = findView(doc, name);
  if (!v) return ev;
  for (const l of v.lines) {
    switch (l.type) {
      case 'layout':
        ev.layout = l.mode === 'saved' ? { mode: 'saved' } : { mode: 'auto', dir: l.dir };
        break;
      case 'hideTag':
        ev.hiddenTags.add(l.id);
        break;
      case 'hide':
        ev.hiddenIds.add(l.id);
        break;
      case 'position':
        ev.positions.set(l.id, { x: l.x, y: l.y });
        break;
      case 'pin':
        ev.pins.add(l.id);
        break;
    }
  }
  return ev;
}

/** Names of all views in file order. */
export function viewNames(doc: Doc): string[] {
  return doc.views.map((v) => v.name);
}

/** Add a view, optionally snapshotting the current geometry so creation cannot reset it. */
export function addView(doc: Doc, name: string, positions: Record<string, { x: number; y: number }> = {}): void {
  if (doc.views.some((v) => v.name === name)) return;
  const lines: ViewLine[] = [];
  for (const object of doc.objects) {
    const point = positions[object.id];
    if (point) lines.push({ type: 'position', id: object.id, x: point.x, y: point.y, pos: { line: 0, col: 0 } });
  }
  doc.views.push({ name, lines, pos: { line: 0, col: 0 } });
}

export function deleteView(doc: Doc, name: string): void {
  doc.views = doc.views.filter((v) => v.name !== name);
}

function mutateLines(doc: Doc, name: string | undefined, fn: (lines: ViewLine[]) => void): void {
  let v = findView(doc, name);
  if (!v) {
    v = { name: name ?? DEFAULT_VIEW_NAME, lines: [], pos: { line: 0, col: 0 } };
    doc.views.push(v);
  }
  fn(v.lines);
}

export function toggleHideTag(doc: Doc, name: string | undefined, tag: string): void {
  mutateLines(doc, name, (lines) => {
    const has = lines.some((l) => l.type === 'hideTag' && l.id === tag);
    if (has) {
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (l && l.type === 'hideTag' && l.id === tag) lines.splice(i, 1);
      }
    } else {
      lines.push({ type: 'hideTag', id: tag, pos: { line: 0, col: 0 } });
    }
  });
}

export function toggleHideId(doc: Doc, name: string | undefined, id: string): void {
  mutateLines(doc, name, (lines) => {
    const has = lines.some((l) => l.type === 'hide' && l.id === id);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l && l.type === 'hide' && l.id === id) lines.splice(i, 1);
    }
    if (!has) lines.push({ type: 'hide', id, pos: { line: 0, col: 0 } });
  });
}

export function togglePin(doc: Doc, name: string | undefined, id: string): void {
  mutateLines(doc, name, (lines) => {
    const has = lines.some((l) => l.type === 'pin' && l.id === id);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l && l.type === 'pin' && l.id === id) lines.splice(i, 1);
    }
    if (!has) lines.push({ type: 'pin', id, pos: { line: 0, col: 0 } });
  });
}

export function setLayout(doc: Doc, name: string | undefined, mode: 'auto' | 'saved', dir?: Dir): void {
  mutateLines(doc, name, (lines) => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l && l.type === 'layout') lines.splice(i, 1);
    }
    lines.unshift(mode === 'saved' ? { type: 'layout', mode: 'saved', pos: { line: 0, col: 0 } } : { type: 'layout', mode: 'auto', dir: dir ?? 'LR', pos: { line: 0, col: 0 } });
  });
}

/** One element passes the view's filters? (ids: element-hide list wins; tags: any-overlap.) */
function passesFilter(ev: EffectiveView, id: string, tags: string[] | undefined, tagFilterActive: boolean): boolean {
  if (ev.hiddenIds.has(id)) return false;
  if (!tagFilterActive) return true;
  return (tags ?? []).some((t) => ev.hiddenTags.has(t));
}

/** Canvas fade decision for one link: both endpoints faded, or id explicitly hidden. */
function linkFades(objFade: Map<string, boolean>, ev: EffectiveView, from: string, to: string, id?: string): boolean {
  if (id !== undefined && ev.hiddenIds.has(id)) return true;
  return (objFade.get(from) ?? false) && (objFade.get(to) ?? false);
}

/**
 * Fade computation (FR-V1): an element fades when it matches neither the tag
 * filter nor passes element hides. With no active filter/hides nothing fades.
 * Tags: object tags + link tags; untagged objects fade. A link fades when
 * BOTH endpoints fade (a relation stays crisp while either side matches).
 */
export function fadeSets(
  doc: Doc,
  ev: EffectiveView,
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

/**
 * F-14 `Reset layout`: drop every `position` line of the active view (creating
 * nothing). The implicit default view has no syntax, so a doc without an
 * explicit "Default" view is returned unchanged.
 */
export function clearPositions(doc: Doc, viewName: string | undefined): Doc {
  const next: Doc = structuredClone(doc);
  const target = next.views.find((v) => v.name === (viewName ?? DEFAULT_VIEW_NAME));
  if (!target) return next;
  target.lines = target.lines.filter((l) => l.type !== 'position');
  return next;
}
