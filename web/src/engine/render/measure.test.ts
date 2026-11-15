// SPDX-License-Identifier: GPL-3.0-only
// F-13 fit-to-name suite: measurement port, wrapping, clamps (review §3.4).
// The port keeps the engine DOM-free: tests inject a deterministic stub, the
// browser injects an offscreen canvas.

import { describe, expect, it } from 'vitest';
import {
  autoSize, canvasMeasurer, FONT, MAX_BOX, MIN_BOX, PADDING, stubMeasurer, wrapLabel,
  type TextMeasurer,
} from './measure';

/** 10 px per character — easier arithmetic than the 7 px stub. */
const tenPx: TextMeasurer = { measure: (t) => ({ w: t.length * 10, h: FONT.lineHeight }) };

describe('stubMeasurer', () => {
  it('is deterministic and proportional to length', () => {
    expect(stubMeasurer.measure('abcd')).toEqual({ w: 28, h: FONT.lineHeight });
    expect(stubMeasurer.measure('')).toEqual({ w: 0, h: FONT.lineHeight });
  });
});

describe('canvasMeasurer', () => {
  it('falls back to the stub when there is no 2D context (jsdom)', () => {
    const m = canvasMeasurer();
    expect(m.measure('abc')).toEqual(stubMeasurer.measure('abc'));
  });
});

describe('wrapLabel (F-13 two-line wrapping)', () => {
  it('never drops words when folding to two lines (F-13)', () => {
    const text = 'a b c d e f g h i j k l m n o p q r s t';
    const lines = wrapLabel(text, tenPx);
    expect(lines.join(' ')).toBe(text);
  });

  it('keeps a short label on one line', () => {
    expect(wrapLabel('API', tenPx)).toEqual(['API']);
  });

  it('splits a long label at a word boundary', () => {
    const lines = wrapLabel('Payments Orchestration Service', tenPx);
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).toBe('Payments Orchestration Service');
    // the first line respects the wrap width; the folded tail may exceed it and
    // the box then grows to fit (no clipped text)
    expect(tenPx.measure(lines[0]!).w).toBeLessThanOrEqual(180);
  });

  it('never produces more than two lines', () => {
    const lines = wrapLabel('a b c d e f g h i j k l m n o p q r s t', tenPx);
    expect(lines).toHaveLength(2);
  });

  it('uses additional lines for an explicitly narrow shape without dropping words', () => {
    const text = 'Payments Orchestration Service';
    const lines = wrapLabel(text, tenPx, 130, Number.POSITIVE_INFINITY);
    expect(lines).toEqual(['Payments', 'Orchestration', 'Service']);
    expect(lines.every((line) => tenPx.measure(line).w <= 130)).toBe(true);
  });

  it('leaves an unbreakable long word alone', () => {
    const long = 'x'.repeat(40);
    expect(wrapLabel(long, tenPx)).toEqual([long]);
  });
});

describe('autoSize', () => {
  it('fits the text plus padding', () => {
    const fit = autoSize({ text: 'API', kind: 'system' }, tenPx);
    expect(fit.w).toBe(3 * 10 + 2 * PADDING.x);
    expect(fit.h).toBe(FONT.lineHeight + 2 * PADDING.y);
    expect(fit.lines).toEqual(['API']);
  });

  it('clamps to the minimum box for a tiny label', () => {
    const fit = autoSize({ text: '', kind: 'system' }, tenPx);
    expect(fit.w).toBe(MIN_BOX.w);
    // one line + padding already exceeds MIN_BOX.h — the clamp only floors
    expect(fit.h).toBe(Math.max(MIN_BOX.h, FONT.lineHeight + 2 * PADDING.y));
  });

  it('clamps to the maximum box for a very long label', () => {
    const fit = autoSize({ text: 'x'.repeat(200), kind: 'system' }, tenPx);
    expect(fit.w).toBe(MAX_BOX.w);
    expect(fit.w).toBeLessThanOrEqual(MAX_BOX.w);
  });

    it('reserves the same glyph and icon regions used by shape rendering', () => {
      const plain = autoSize({ text: 'Payments', kind: 'system' }, tenPx);
      const icon = autoSize({ text: 'Payments', kind: 'system', icon: 'cloud' }, tenPx);
      const queue = autoSize({ text: 'Payments', kind: 'queue' }, tenPx);
      const person = autoSize({ text: 'Payments', kind: 'person' }, tenPx);
      // UX08-WP07: the icon sits in its own top band, so it reserves height (not
      // width) and no longer narrows the label.
      expect(icon.w).toBe(plain.w);
      expect(icon.h).toBeGreaterThan(plain.h);
      expect(queue.w).toBe(plain.w + 16);
      expect(person.h).toBeGreaterThan(plain.h);
    });

  it('grows in height (not width) when the label wraps', () => {
    const one = autoSize({ text: 'Payments', kind: 'system' }, tenPx);
    const two = autoSize({ text: 'Payments Orchestration Service', kind: 'system' }, tenPx);
    expect(two.lines).toHaveLength(2);
    expect(two.h).toBeGreaterThan(one.h);
    // the box always fits the widest rendered line (+ padding), never clips
    const widest = Math.max(...two.lines.map((l) => tenPx.measure(l).w));
    expect(two.w).toBeGreaterThanOrEqual(widest);
  });

  it('is monotonic: a longer name never shrinks the box', () => {
    let prev = 0;
    for (const name of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      const fit = autoSize({ text: name, kind: 'container' }, tenPx);
      expect(fit.w).toBeGreaterThanOrEqual(prev);
      prev = fit.w;
    }
  });
});
