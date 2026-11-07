// SPDX-License-Identifier: GPL-3.0-only
// F-20 import resolution: ghosts (`alias.objectId`), missing files, cycles,
// workspace escapes and unparseable sources.

import { describe, expect, it } from 'vitest';
import { parsePDL } from '../format/parser';
import { isImportRef, normalisePath, resolveImportGhosts, resolvePath } from './imports';

const docOf = (text: string) => parsePDL(text).doc!;

const ROOT = 'svc/main.pcd';
const read =
  (files: Record<string, string>) =>
  (path: string): string | null =>
    files[path] ?? null;

describe('path helpers', () => {
  it('normalises workspace paths', () => {
    expect(normalisePath('a/./b/../c')).toBe('a/c');
    expect(normalisePath('/a/b')).toBe('a/b');
  });

  it('resolves imports relative to the importing file', () => {
    expect(resolvePath(ROOT, '../shared/actors.pcd')).toBe('shared/actors.pcd');
    expect(resolvePath('a.pcd', 'b.pcd')).toBe('b.pcd');
  });

  it('rejects paths that escape the workspace', () => {
    expect(resolvePath('a.pcd', '../outside.pcd')).toBeNull();
    expect(resolvePath(ROOT, '/abs.pcd')).toBeNull();
  });

  it('recognises alias-qualified refs only', () => {
    expect(isImportRef('shared.psp')).toBe(true);
    expect(isImportRef('psp')).toBe(false);
    expect(isImportRef('shared.psp.extra')).toBe(false);
  });
});

describe('resolveImportGhosts (F-20)', () => {
  it('exposes the imported objects as ghosts with qualified refs', () => {
    const doc = docOf('pcd 1.0\nimport shared as "../shared/actors.pcd"\nsystem api "API"\n');
    const res = resolveImportGhosts(
      doc,
      ROOT,
      read({ 'shared/actors.pcd': 'pcd 1.0\nperson psp "PSP"\nsystem auth "Auth"\n' }),
    );
    expect(res.errors).toEqual([]);
    expect(res.ghosts.map((g) => g.ref)).toEqual(['shared.psp', 'shared.auth']);
    expect(res.ghosts[0]?.path).toBe('shared/actors.pcd');
    expect(res.ghosts[0]?.obj.name).toBe('PSP');
  });

  it('reports a missing imported file', () => {
    const doc = docOf('pcd 1.0\nimport ghost as "./nope.pcd"\n');
    const res = resolveImportGhosts(doc, ROOT, read({}));
    expect(res.ghosts).toEqual([]);
    expect(res.errors[0]?.code).toBe('missing');
  });

  it('reports a self-import cycle', () => {
    const doc = docOf('pcd 1.0\nimport self as "main.pcd"\n');
    const res = resolveImportGhosts(doc, ROOT, read({ 'svc/main.pcd': 'pcd 1.0\n' }));
    expect(res.errors[0]?.code).toBe('cycle');
  });

  it('reports an escape attempt', () => {
    const doc = docOf('pcd 1.0\nimport out as "../../outside.pcd"\n');
    const res = resolveImportGhosts(doc, ROOT, read({}));
    expect(res.errors[0]?.code).toBe('escape');
  });

  it('reports an unparseable imported file', () => {
    const doc = docOf('pcd 1.0\nimport bad as "./bad.pcd"\n');
    const res = resolveImportGhosts(doc, ROOT, read({ 'svc/bad.pcd': 'pcd 1.0\nsystem' }));
    expect(res.ghosts).toEqual([]);
    expect(res.errors[0]?.code).toBe('unreadable');
  });

  it('flags nested imports instead of guessing at alias chains', () => {
    const doc = docOf('pcd 1.0\nimport outer as "./outer.pcd"\n');
    const res = resolveImportGhosts(
      doc,
      ROOT,
      read({ 'svc/outer.pcd': 'pcd 1.0\nimport inner as "./inner.pcd"\nsystem x "X"\n' }),
    );
    expect(res.errors.some((e) => e.message.includes('not flattened'))).toBe(true);
    // the objects are still exposed (useful even when the chain is flattened away)
    expect(res.ghosts.map((g) => g.ref)).toEqual(['outer.x']);
  });
});
