// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { stackObjects } from './stacking';

describe('CX-03 stable object stacking', () => {
  it('preserves the exact all-auto document projection', () => {
    const objects: Array<{ id: string; z?: number }> = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(stackObjects(objects)).toBe(objects);
    expect(stackObjects(objects).map((o) => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts negative, auto/zero and positive z with stable document-order ties', () => {
    const objects: Array<{ id: string; z?: number }> = [
      { id: 'auto-a' },
      { id: 'positive-a', z: 4 },
      { id: 'negative', z: -2 },
      { id: 'zero', z: 0 },
      { id: 'positive-b', z: 4 },
      { id: 'auto-b' },
    ];
    expect(stackObjects(objects).map((o) => o.id)).toEqual([
      'negative', 'auto-a', 'zero', 'auto-b', 'positive-a', 'positive-b',
    ]);
    expect(objects.map((o) => o.id)).toEqual([
      'auto-a', 'positive-a', 'negative', 'zero', 'positive-b', 'auto-b',
    ]);
  });

  it('applies the same rule to groups without rewriting containment', () => {
    const objects: Array<{ id: string; kind?: string; z?: number; contains?: string[] }> = [
      { id: 'child', z: 1 },
      { id: 'group', kind: 'group', z: -1, contains: ['child'] },
      { id: 'auto', kind: 'system' },
    ];
    expect(stackObjects(objects).map((o) => o.id)).toEqual(['group', 'auto', 'child']);
    expect(objects[1]?.contains).toEqual(['child']);
  });
});
