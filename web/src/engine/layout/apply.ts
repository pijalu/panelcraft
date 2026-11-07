// SPDX-License-Identifier: GPL-3.0-only
// "Apply layout to file" (M6-WP3, FILE-FORMAT §7.2) — explicit-commit pure
// function. Writes computed positions into the target view as `position`
// lines; nothing else mutates the doc. Never called automatically.
import type { Doc, View, ViewLine } from '../model/types';

export const DEFAULT_VIEW_NAME = 'Default';

export interface ApplyLayoutReport {
  doc: Doc;
  /** ids actually written (known objects; unknown ids filtered). */
  written: string[];
}

/**
 * Write `position` lines into the named view (or the first view when
 * `viewName` is undefined — matching the UI's active-view lookup). A doc with
 * zero views gets a created view named "Default" (the implicit default view
 * has no syntax representation — M6 decision). Existing position lines for
 * the same ids are replaced; other view lines are preserved in order. Output
 * lines are sorted by id for canonical, stable printing.
 */
export function applyLayoutToView(
  doc: Doc,
  viewName: string | undefined,
  positions: Record<string, { x: number; y: number }>,
): ApplyLayoutReport {
  const known = new Set(doc.objects.map((o) => o.id));
  const ids = Object.keys(positions)
    .filter((id) => known.has(id))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const next: Doc = structuredClone(doc);
  // `viewName === undefined` = the implicit default view: target the explicit
  // "Default" view (create it when absent) — never the first named view.
  let view: View | undefined = viewName
    ? next.views.find((v) => v.name === viewName)
    : next.views.find((v) => v.name === DEFAULT_VIEW_NAME);

  if (!view) {
    view = { name: viewName ?? DEFAULT_VIEW_NAME, lines: [], pos: { line: 0, col: 0 } };
    next.views.push(view);
  }

  const byId = new Map(ids.map((id) => [id, { x: positions[id]!.x, y: positions[id]!.y }]));
  const kept: ViewLine[] = [];
  for (const l of view.lines) {
    if (l.type === 'position' && byId.has(l.id)) continue; // replaced below
    kept.push(l);
  }
  for (const id of ids) {
    kept.push({ type: 'position', id, x: byId.get(id)!.x, y: byId.get(id)!.y, pos: { line: 0, col: 0 } });
  }
  view.lines = kept;

  return { doc: next, written: ids };
}
