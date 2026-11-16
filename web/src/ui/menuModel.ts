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

/** Anchor rectangle of the row a submenu opens from (viewport coordinates). */
export interface MenuAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SubmenuPlacement {
  left: number;
  top: number;
  /** Which side of the anchor row the submenu was placed on. */
  side: 'right' | 'left';
}

/**
 * Place a submenu beside its row. Preference is the right-hand side; when that
 * would leave the viewport the submenu flips to the left of the row (the bug was
 * a fixed `left: 100%` that pushed deep menus off-screen). Vertically it is
 * clamped, never pushed off the bottom.
 */
export function placeSubmenu(
  anchor: MenuAnchorRect,
  size: MenuSize,
  viewport: ViewportSize,
): SubmenuPlacement {
  const rightRoom = viewport.width - anchor.right - MENU_MARGIN;
  const side: SubmenuPlacement['side'] = rightRoom >= size.width ? 'right' : 'left';
  const preferredLeft = side === 'right' ? anchor.right + 2 : anchor.left - size.width - 2;
  const maxLeft = Math.max(MENU_MARGIN, viewport.width - size.width - MENU_MARGIN);
  const maxTop = Math.max(MENU_MARGIN, viewport.height - size.height - MENU_MARGIN);
  return {
    left: Math.min(Math.max(preferredLeft, MENU_MARGIN), maxLeft),
    top: Math.min(Math.max(anchor.top - 4, MENU_MARGIN), maxTop),
    side,
  };
}

export interface MenuPlacement {
  left: number;
  top: number;
  /** Height the surface may use on the chosen side (it scrolls beyond this). */
  maxHeight: number;
  side: 'below' | 'above';
}

/**
 * Place a menu against its trigger rectangle. The menu opens on the side with
 * room, is clamped inside the viewport margin, and — because a clamped menu that
 * covered its own trigger made the toggle look broken — never overlaps the
 * trigger box: when neither side fits the requested height, the larger side wins
 * and the surface scrolls internally instead of growing over the trigger.
 */
export function placeMenu(
  trigger: MenuAnchorRect,
  size: MenuSize,
  viewport: ViewportSize,
  minHeight = 120,
): MenuPlacement {
  const left = Math.min(
    Math.max(trigger.left, MENU_MARGIN),
    Math.max(MENU_MARGIN, viewport.width - size.width - MENU_MARGIN),
  );
  const roomBelow = viewport.height - trigger.bottom - 2 - MENU_MARGIN;
  const roomAbove = trigger.top - 2 - MENU_MARGIN;
  const side: MenuPlacement['side'] =
    size.height <= roomBelow || roomBelow >= roomAbove ? 'below' : 'above';
  if (side === 'below') {
    return {
      left,
      top: Math.min(trigger.bottom + 2, Math.max(MENU_MARGIN, viewport.height - MENU_MARGIN)),
      maxHeight: Math.max(minHeight, roomBelow),
      side,
    };
  }
  const maxHeight = Math.max(minHeight, roomAbove);
  return { left, top: Math.max(MENU_MARGIN, trigger.top - 2 - maxHeight), maxHeight, side };
}

/**
 * Height a surface may occupy when it opens at `top`: the larger of the space
 * below and above it, so the list scrolls internally instead of extending past
 * the viewport. `viewport` is the *available* box (the window, or the window
 * minus chrome the owner knows about).
 */
export function availableMenuHeight(top: number, viewport: ViewportSize): number {
  const below = viewport.height - top - MENU_MARGIN * 2;
  const above = top - MENU_MARGIN * 2;
  return Math.max(below, above);
}

/** True when a surface of `content` height inside `client` height must scroll. */
export function needsScroll(content: number, client: number): boolean {
  return content > client + 1;
}

/** True when the event target sits inside one of the supplied roots. */
export function isInside(target: EventTarget | null, roots: readonly (Element | null)[]): boolean {
  if (target === null || typeof Node === 'undefined' || !(target instanceof Node)) return false;
  return roots.some((root) => root !== null && root.contains(target));
}
