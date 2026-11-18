// SPDX-License-Identifier: GPL-3.0-only
// Drill-down trail + breadcrumbs (FILE-FORMAT.md §3.2): the navigation contract, tested
// without a browser.
import { describe, expect, it } from 'vitest';
import {
  basename, contextLabel, crumbs, emptyTrail, parentOfTrail, popTo, pushEntry, resolveTarget,
  rootOf, type Trail,
} from './drillTrail';

const from = (path: string, objectId: string, label: string): {
  path: string; objectId: string; label: string;
} => ({ path, objectId, label });

describe('drill-down trail', () => {
  it('starts empty and grows one level per drill-down', () => {
    expect(emptyTrail).toEqual([]);
    const first = pushEntry([{ path: 'context.pcd' }], 'containers.pcd', from('context.pcd', 'shop', 'Webshop'));
    expect(first.problem).toBeUndefined();
    expect(first.trail.map((e) => e.path)).toEqual(['context.pcd', 'containers.pcd']);
  });

  it('keeps the parent relation on the new trail entry', () => {
    const { trail } = pushEntry(
      [{ path: 'context.pcd' }],
      'containers.pcd',
      from('context.pcd', 'shop', 'Webshop'),
    );
    expect(parentOfTrail(trail)).toEqual(from('context.pcd', 'shop', 'Webshop'));
    expect(trail[1]?.path).toBe('containers.pcd');
  });

  it('refuses a path already in the trail and explains why (cycle)', () => {
    const trail: Trail = [{ path: 'a.pcd' }, { path: 'b.pcd', from: from('a.pcd', 'x', 'X') }];
    const res = pushEntry(trail, 'a.pcd', from('b.pcd', 'y', 'Y'));
    expect(res.trail).toEqual(trail);
    expect(res.problem?.code).toBe('cycle');
    expect(res.problem?.message).toContain('already open');
  });

  it('truncates to a breadcrumb and ignores an out-of-range index', () => {
    const trail: Trail = [
      { path: 'a.pcd' },
      { path: 'b.pcd', from: from('a.pcd', 'x', 'X') },
      { path: 'c.pcd', from: from('b.pcd', 'y', 'Y') },
    ];
    expect(popTo(trail, 0)).toEqual([{ path: 'a.pcd' }]);
    expect(popTo(trail, 9)).toBe(trail);
    expect(popTo(trail, -1)).toBe(trail);
  });

  it('labels the root with its file name and every child with its element', () => {
    const trail: Trail = [
      { path: 'systems/shop.pcd' },
      { path: 'containers/shop.pcd', from: from('systems/shop.pcd', 'shop', 'Webshop') },
    ];
    expect(crumbs(trail)).toEqual([
      { index: 0, path: 'systems/shop.pcd', label: 'shop.pcd', current: false },
      { index: 1, path: 'containers/shop.pcd', label: 'Webshop', current: true },
    ]);
    expect(rootOf(trail)?.path).toBe('systems/shop.pcd');
  });

  it('describes the parent boundary with the element and its file', () => {
    expect(contextLabel(from('systems/shop.pcd', 'shop', 'Webshop'))).toBe('Webshop · shop.pcd');
    expect(basename('')).toBe('workspace');
  });
});

describe('resolveTarget', () => {
  const files: Record<string, string> = {
    'context.pcd': [
      'pcd 1.0',
      'system shop "Webshop" {',
      '  drilldown "containers/shop.pcd"',
      '}',
      'system orphan "Orphan"',
      'system bad "Bad" {',
      '  drilldown "notes.md"',
      '}',
    ].join('\n'),
  };
  const read = (path: string): string | null => files[path] ?? null;

  it('resolves a parent object to its child path', () => {
    expect(resolveTarget('context.pcd', 'shop', read)).toEqual({
      path: 'containers/shop.pcd',
    });
  });

  it('reports an object without a relation', () => {
    const res = resolveTarget('context.pcd', 'orphan', read);
    expect('code' in res && res.message).toContain('no drilldown line');
  });

  it('reports a non-.pcd target instead of navigating', () => {
    const res = resolveTarget('context.pcd', 'bad', read);
    expect('code' in res && res.code).toBe('not-pcd');
  });

  it('reports an unreadable file', () => {
    const res = resolveTarget('gone.pcd', 'shop', read);
    expect('code' in res && res.message).toContain('cannot read');
  });
});
