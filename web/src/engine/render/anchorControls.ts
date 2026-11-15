// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP09: the Properties `Start`/`End` controls speak "side + percentage",
// while the document stores one normalized side-quarter anchor (CX-01, IR v4).
// Every side is measured in reading order (left→right, top→bottom), so the same
// percentage means a different `t` on each side.

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

export const ANCHOR_SIDES: readonly AnchorSide[] = ['top', 'right', 'bottom', 'left'];

export interface AnchorChoice {
  side: AnchorSide;
  /** 0–100 along the side, in reading order. */
  percent: number;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Where a side + percentage lands on the perimeter. Each side owns a quarter of
 * `t`; bottom and left run "backwards" because their quarters are wound the
 * other way round (see `perimeterPoint`).
 */
export function choiceToAnchor(side: AnchorSide, percent: number): number {
  const p = clamp01(percent / 100);
  switch (side) {
    case 'top':
      return 0.25 * p;
    case 'right':
      return 0.25 + 0.25 * p;
    case 'bottom':
      return 0.75 - 0.25 * p;
    case 'left':
      return 1 - 0.25 * p;
  }
}

/** The side + percentage a stored anchor corresponds to (for the picker). */
export function anchorToChoice(t: number): AnchorChoice {
  const normalized = clamp01(t);
  const index = Math.min(3, Math.floor(normalized * 4));
  const side = ANCHOR_SIDES[index]!;
  const fraction = normalized * 4 - index;
  // Top/right quarters grow with the fraction; bottom/left are reversed.
  const percent = (index < 2 ? fraction : 1 - fraction) * 100;
  return { side, percent: Math.round(percent) };
}
