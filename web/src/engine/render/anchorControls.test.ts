// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP09: the Properties `Start`/`End` controls speak "side + percentage",
// while the document stores one normalized side-quarter anchor (CX-01, IR v4).
// These two functions are the only translation between the two vocabularies.
import { describe, expect, it } from 'vitest';
import { anchorToChoice, choiceToAnchor, ANCHOR_SIDES } from './anchorControls';

describe('anchor side controls (UX08-WP09)', () => {
  it('maps a side midpoint to its percentage', () => {
    expect(choiceToAnchor('top', 50)).toBe(0.125);
    expect(choiceToAnchor('right', 50)).toBe(0.375);
    expect(choiceToAnchor('bottom', 50)).toBe(0.625);
    expect(choiceToAnchor('left', 50)).toBe(0.875);
  });

  it('runs each side in reading order (left→right, top→bottom)', () => {
    expect(choiceToAnchor('top', 0)).toBe(0);
    expect(choiceToAnchor('top', 100)).toBe(0.25);
    expect(choiceToAnchor('bottom', 0)).toBe(0.75); // left end of the bottom
    expect(choiceToAnchor('bottom', 100)).toBe(0.5); // right end of the bottom
    expect(choiceToAnchor('left', 0)).toBe(1); // top end of the left side
    expect(choiceToAnchor('left', 100)).toBe(0.75); // bottom end
  });

  it('treats a shared corner as the same anchor on both sides', () => {
    expect(choiceToAnchor('top', 100)).toBe(choiceToAnchor('right', 0));
    expect(choiceToAnchor('right', 100)).toBe(choiceToAnchor('bottom', 100));
    expect(choiceToAnchor('bottom', 0)).toBe(choiceToAnchor('left', 100));
  });

  it('clamps a percentage outside 0–100', () => {
    expect(choiceToAnchor('top', -20)).toBe(0);
    expect(choiceToAnchor('top', 140)).toBe(0.25);
  });

  it('recovers the side and percentage from a stored anchor', () => {
    expect(anchorToChoice(0.125)).toEqual({ side: 'top', percent: 50 });
    expect(anchorToChoice(0.375)).toEqual({ side: 'right', percent: 50 });
    expect(anchorToChoice(0.625)).toEqual({ side: 'bottom', percent: 50 });
    expect(anchorToChoice(0.875)).toEqual({ side: 'left', percent: 50 });
  });

  it('round-trips the geometry for every side and every percentage', () => {
    for (const side of ANCHOR_SIDES) {
      for (const percent of [0, 33, 50, 75, 100]) {
        const t = choiceToAnchor(side, percent);
        const back = anchorToChoice(t);
        expect(choiceToAnchor(back.side, back.percent)).toBeCloseTo(t, 6);
      }
    }
  });

  it('recovers the same side for every interior percentage', () => {
    // Corners belong to two sides at once, so only interior points name one.
    for (const side of ANCHOR_SIDES) {
      for (const percent of [25, 50, 75]) {
        expect(anchorToChoice(choiceToAnchor(side, percent))).toEqual({ side, percent });
      }
    }
  });

  it('keeps every anchor inside the normalized range', () => {
    for (const side of ANCHOR_SIDES) {
      for (const percent of [-40, 0, 33, 100, 250]) {
        const t = choiceToAnchor(side, percent);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });

  it('offers the five choices the panel renders (Auto + four sides)', () => {
    expect(ANCHOR_SIDES).toEqual(['top', 'right', 'bottom', 'left']);
  });
});
