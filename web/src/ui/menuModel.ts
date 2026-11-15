// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: pure geometry and roving-focus helpers for the shared menu
// primitive. Keeping them out of the component keeps cyclomatic complexity low
// and lets the keyboard/position rules be unit-tested without a DOM layout.

export interface MenuPoint {
  left: number;
  top: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/** Viewport margin kept free so a clamped menu never touches the edge. */
export const MENU_MARGIN = 8;

/**
 * Clamp a menu rectangle inside the viewport. `anchor` is the trigger's bottom
 * edge; when the menu would overflow the bottom it flips above the trigger.
 */
export function clampMenuPosition(
  anchor: MenuPoint,
  size: MenuSize,
  viewport: ViewportSize,
): MenuPoint {
  const maxLeft = Math.max(MENU_MARGIN, viewport.width - size.width - MENU_MARGIN);
  const left = Math.min(Math.max(anchor.left, MENU_MARGIN), maxLeft);
  const below = anchor.top;
  const above = anchor.top - size.height;
  const fitsBelow = below + size.height + MENU_MARGIN <= viewport.height;
  const unclampedTop = fitsBelow ? below : above;
  const maxTop = Math.max(MENU_MARGIN, viewport.height - size.height - MENU_MARGIN);
  const top = Math.min(Math.max(unclampedTop, MENU_MARGIN), maxTop);
  return { left, top };
}

/**
 * Roving focus index. Wraps at both ends and skips disabled entries, which are
 * represented by `false` in `enabled`.
 */
export function rovingIndex(enabled: readonly boolean[], from: number, delta: number): number {
  const count = enabled.length;
  if (count === 0 || !enabled.some(Boolean)) return -1;
  let index = from;
  for (let step = 0; step < count; step += 1) {
    index = (index + delta + count) % count;
    if (enabled[index] === true) return index;
  }
  return -1;
}

/** First or last enabled index, used by Home/End. */
export function edgeIndex(enabled: readonly boolean[], edge: 'first' | 'last'): number {
  return rovingIndex(enabled, edge === 'first' ? enabled.length - 1 : 0, edge === 'first' ? 1 : -1);
}

/** True when the event target sits inside one of the supplied roots. */
export function isInside(target: EventTarget | null, roots: readonly (Element | null)[]): boolean {
  if (target === null || typeof Node === 'undefined' || !(target instanceof Node)) return false;
  return roots.some((root) => root !== null && root.contains(target));
}
