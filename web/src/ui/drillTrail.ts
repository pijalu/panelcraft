// SPDX-License-Identifier: GPL-3.0-only
// Drill-down trail (IR v10, FILE-FORMAT.md §3.2): the breadcrumb stack a reader walks when
// they open a subordinate diagram from an element. Pure data so the navigation
// can be tested without a browser, and so the shell only has to render it.
//
// One entry = "I opened this file from that element". The trail always starts at
// the file the reader was on before the first drill-down, which is why the root
// crumb carries no element.
import { parsePDL } from '../engine/format/parser';
import { resolveDrilldown } from '../engine/model/hierarchy';

export interface TrailEntry {
  /** Workspace path of the diagram at this depth. */
  path: string;
  /** View id requested for that path, when the relation named one. */
  view?: string;
  /** Present for every entry except the root: the element that was opened. */
  from?: {
    /** Workspace path of the parent diagram. */
    path: string;
    objectId: string;
    /** Display name of the parent element (falls back to its id). */
    label: string;
  };
}

export interface TrailProblem {
  code: 'cycle' | 'escape' | 'not-pcd';
  message: string;
}

/** A trail is the ordered stack from the root diagram to the current one. */
export type Trail = TrailEntry[];

export const emptyTrail: Trail = [];

/** The diagram the reader started from (`null` for an empty trail). */
export function rootOf(trail: Trail): TrailEntry | undefined {
  return trail[0];
}

/** The parent relation that opened the current diagram, if any. */
export function parentOfTrail(trail: Trail): TrailEntry['from'] | undefined {
  return trail.length > 1 ? trail[trail.length - 1]?.from : undefined;
}

/**
 * Append `path` to the trail as opened from `from`. A path already in the trail
 * is refused (P216 at the UI level): re-entering it would make the breadcrumbs
 * lie about where the reader is, and the document already reports the cycle.
 */
export function pushEntry(
  trail: Trail,
  path: string,
  from: NonNullable<TrailEntry['from']>,
  view?: string,
): { trail: Trail; problem?: TrailProblem } {
  if (trail.some((entry) => entry.path === path)) {
    return {
      trail,
      problem: {
        code: 'cycle',
        message: `${path} is already open in this trail — go back instead of opening it again`,
      },
    };
  }
  const entry: TrailEntry = view === undefined ? { path, from } : { path, from, view };
  return { trail: [...trail, entry] };
}

/** Truncate the trail to `index` (inclusive) — what a breadcrumb click does. */
export function popTo(trail: Trail, index: number): Trail {
  if (index < 0 || index >= trail.length) return trail;
  return trail.slice(0, index + 1);
}

export interface Crumb {
  index: number;
  path: string;
  /** Element label that opened this level; the root uses the file name. */
  label: string;
  current: boolean;
}

/** Breadcrumbs for rendering: root first, current last. */
export function crumbs(trail: Trail): Crumb[] {
  return trail.map((entry, index) => ({
    index,
    path: entry.path,
    label: entry.from?.label ?? basename(entry.path),
    current: index === trail.length - 1,
  }));
}

/** Last path segment of a workspace path ('' → 'workspace'). */
export function basename(path: string): string {
  const parts = path.split('/').filter((p) => p !== '');
  return parts.length === 0 ? 'workspace' : (parts[parts.length - 1] ?? path);
}

/** Human description of the parent boundary drawn around the current diagram. */
export function contextLabel(from: NonNullable<TrailEntry['from']>): string {
  return `${from.label} · ${basename(from.path)}`;
}

/**
 * Resolve the decomposition target of `objectId` in the document at `file`, so
 * the shell can either open it or explain why it cannot. `read` serves the file
 * probe and keeps this pure.
 */
export function resolveTarget(
  file: string,
  objectId: string,
  read: (path: string) => string | null,
): { path: string; view?: string } | TrailProblem {
  const text = read(file);
  if (text === null) return { code: 'escape', message: `cannot read ${file}` };
  const doc = parsePDL(text).doc;
  if (doc === null) return { code: 'escape', message: `${file} does not parse` };
  const obj = doc.objects.find((o) => o.id === objectId);
  if (obj?.drilldown === undefined) {
    return { code: 'escape', message: `"${objectId}" has no drilldown line` };
  }
  const target = resolveDrilldown(file, obj.drilldown.path);
  if (!target.ok) {
    return {
      code: target.problem,
      message: target.problem === 'not-pcd'
        ? `drilldown target is not a .pcd path: "${obj.drilldown.path}"`
        : `drilldown target escapes the workspace: "${obj.drilldown.path}"`,
    };
  }
  return obj.drilldown.view === undefined
    ? { path: target.path }
    : { path: target.path, view: obj.drilldown.view };
}
