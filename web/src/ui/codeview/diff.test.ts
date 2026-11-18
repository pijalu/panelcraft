// SPDX-License-Identifier: GPL-3.0-only
// F-03 regression suite: machine→editor writes must be a minimal diff, so the
// caret survives. The old full-document dispatch replaced 0..length and the
// selection collapsed to offset 0 on every canvas/flow/view write.

import { describe, expect, it } from 'vitest';
import { minimalChange, trailingWhitespaceOnly } from './diff';

describe('minimalChange (F-03)', () => {
  it('identical texts produce an empty change', () => {
    expect(minimalChange('abc', 'abc')).toEqual({ from: 0, to: 0, insert: '' });
  });

  it('an inserted character keeps everything else untouched', () => {
    expect(minimalChange('ac', 'abc')).toEqual({ from: 1, to: 1, insert: 'b' });
  });

  it('a deletion in the middle is one range', () => {
    expect(minimalChange('abcd', 'ad')).toEqual({ from: 1, to: 3, insert: '' });
  });

  it('appending at the end does not touch the prefix', () => {
    // the common suffix is the closing quote, so the insert lands before it
    expect(minimalChange('system a "A"', 'system a "AB"')).toEqual({ from: 11, to: 11, insert: 'B' });
  });

  it('a rename in the middle of a document keeps the head and tail', () => {
    const before = 'pcd 1.0\n\n# header\nsystem a "Alpha"\n\nlayout saved\n';
    const after = 'pcd 1.0\n\n# header\nsystem a "Beta"\n\nlayout saved\n';
    const change = minimalChange(before, after);
    // the change stays inside the name: head and tail are untouched
    expect(change.from).toBeGreaterThanOrEqual(before.indexOf('Alpha'));
    expect(change.to).toBeLessThanOrEqual(before.indexOf('Alpha') + 'Alpha"'.length);
    expect(change.insert.length).toBeLessThan(8);
    expect(before.slice(change.to)).toContain('layout saved');
    // applying it reproduces the target exactly
    expect(before.slice(0, change.from) + change.insert + before.slice(change.to)).toBe(after);
  });

  it('a fully different text is a single whole-document replacement', () => {
    const change = minimalChange('aaa', 'zzz');
    expect(change).toEqual({ from: 0, to: 3, insert: 'zzz' });
  });

  it('never splits a surrogate pair', () => {
    const before = 'a😀b';
    const after = 'a😀c';
    const change = minimalChange(before, after);
    expect(before.slice(0, change.from) + change.insert + before.slice(change.to)).toBe(after);
    expect(change.from).toBe(3); // after the emoji, not inside it
  });

  it('round-trips for a sample of edits', () => {
    const cases: [string, string][] = [
      ['', 'pcd 1.0\n'],
      ['pcd 1.0\n', ''],
      ['abc', 'abXc'],
      ['line1\nline2\n', 'line1\nline2\nline3\n'],
    ];
    for (const [before, after] of cases) {
      const c = minimalChange(before, after);
      expect(before.slice(0, c.from) + c.insert + before.slice(c.to)).toBe(after);
    }
  });
});

describe('trailingWhitespaceOnly', () => {
  it('is true for texts differing only in trailing whitespace', () => {
    expect(trailingWhitespaceOnly('a\n', 'a\n\n')).toBe(true);
    expect(trailingWhitespaceOnly('a ', 'a')).toBe(true);
  });

  it('is false when real content differs', () => {
    expect(trailingWhitespaceOnly('a\n', 'b\n')).toBe(false);
  });
});
