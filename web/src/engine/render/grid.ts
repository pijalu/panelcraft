// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP05: canvas grid as two independent preferences — what is drawn and
// whether drags snap. Pure model (no DOM) so migration, the visibility toggle
// and the independence of snapping stay unit-testable. These are browser-local
// editor preferences (`WorkspaceSettings.canvasGrid`), never diagram or view
// data: nothing here reaches `.pcd`.

/** What the canvas draws behind the diagram. */
export type GridType = 'off' | 'dots' | 'lines';

export interface GridSettings {
  /**
   * Preference-record version. Version 1 shipped with a hidden default; version
   * 2 shows a subtle grid on a fresh install. The version is informational: the
   * migration decision is made per field (see `normaliseGrid`).
   */
  version: 2;
  type: GridType;
  /** Snapping is independent of visibility: lines may be shown without snapping. */
  snap: boolean;
  /**
   * The last visible type, so the `g` shortcut can restore it. Keeping it here
   * means the shortcut behaves the same after a reload.
   */
  last: Exclude<GridType, 'off'>;
}

export type VisibleGridType = Exclude<GridType, 'off'>;

export const GRID_TYPES: readonly GridType[] = ['off', 'dots', 'lines'];

/** The preference-record version this build writes. */
export const GRID_VERSION = 2;

/**
 * Default for a profile that has never chosen a grid: subtle dots with snapping
 * on. The grid is editor chrome only — showing it moves no shape, so this
 * default cannot alter document geometry.
 */
export function defaultGrid(): GridSettings {
  return { version: GRID_VERSION, type: 'dots', snap: true, last: 'dots' };
}

function isGridType(value: unknown): value is GridType {
  return value === 'off' || value === 'dots' || value === 'lines';
}

/**
 * Normalise a stored value. The migration decision is per field, which is what
 * separates "never chose" from "chose off": a record is only written when the
 * user changes something, so a *present, valid* `type` is an explicit choice and
 * is preserved — including `off`. A missing or corrupt field is a missing
 * preference and takes the current default (visible dots, snapping on).
 */
export function normaliseGrid(stored: unknown): GridSettings {
  const base = defaultGrid();
  if (typeof stored !== 'object' || stored === null) return base;
  const rec = stored as Partial<Record<keyof GridSettings, unknown>>;
  const type = isGridType(rec.type) ? rec.type : base.type;
  const last = isGridType(rec.last) && rec.last !== 'off' ? rec.last : base.last;
  const snap = typeof rec.snap === 'boolean' ? rec.snap : base.snap;
  // A stored `off` still remembers the type it should come back to.
  return { version: GRID_VERSION, type, snap, last: type === 'off' ? last : type };
}

/** Choose a visible grid type (no side effect on snapping). */
export function setGridType(settings: GridSettings, type: GridType): GridSettings {
  return { ...settings, type, last: type === 'off' ? settings.last : type };
}

/** Toggle snapping only. Visibility is untouched. */
export function setGridSnap(settings: GridSettings, snap: boolean): GridSettings {
  return { ...settings, snap };
}

/**
 * `g` shortcut and the old grid button: flip visibility, restoring the last
 * visible type when turning back on.
 */
export function toggleGridVisibility(settings: GridSettings): GridSettings {
  return setGridType(settings, settings.type === 'off' ? settings.last : 'off');
}

/** True when the canvas should paint a grid at all. */
export function gridVisible(settings: GridSettings): boolean {
  return settings.type !== 'off';
}
