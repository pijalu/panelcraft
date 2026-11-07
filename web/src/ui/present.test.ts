// SPDX-License-Identifier: GPL-3.0-only
// F-16 present-mode model: which keys drive playback, the presenting predicate,
// progress dots and the reduced-motion probe.

import { describe, expect, it } from 'vitest';
import { isPresenting, prefersReducedMotion, presentAction, progressDots } from './present';

describe('isPresenting', () => {
  it('is true for every non-idle state', () => {
    expect(isPresenting('idle')).toBe(false);
    for (const s of ['playing', 'paused', 'ended'] as const) expect(isPresenting(s)).toBe(true);
  });
});

describe('presentAction', () => {
  it('maps the advance keys (Space, →, PageDown)', () => {
    for (const key of [' ', 'Spacebar', 'ArrowRight', 'PageDown']) {
      expect(presentAction(key)).toBe('next');
    }
  });

  it('maps the back keys (←, PageUp)', () => {
    expect(presentAction('ArrowLeft')).toBe('back');
    expect(presentAction('PageUp')).toBe('back');
  });

  it('maps pause/resume, restart and exit', () => {
    expect(presentAction('p')).toBe('toggle');
    expect(presentAction('P')).toBe('toggle');
    expect(presentAction('r')).toBe('restart');
    expect(presentAction('Escape')).toBe('exit');
  });

  it('ignores modified keys and unknown keys', () => {
    expect(presentAction(' ', true)).toBeNull(); // Ctrl+Space is a platform shortcut
    expect(presentAction('ArrowRight', true)).toBeNull();
    expect(presentAction('x')).toBeNull();
  });
});

describe('progressDots', () => {
  it('marks the current step and keeps the count', () => {
    const dots = progressDots(2, 4);
    expect(dots).toHaveLength(4);
    expect(dots.filter((d) => d.current)).toEqual([{ step: 2, current: true }]);
  });

  it('is empty for a zero-step flow and capped for huge flows', () => {
    expect(progressDots(1, 0)).toEqual([]);
    expect(progressDots(1, 500)).toHaveLength(64);
  });
});

describe('prefersReducedMotion', () => {
  it('reports false when matchMedia is unavailable (node)', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
