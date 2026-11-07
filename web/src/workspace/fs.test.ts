// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect } from 'vitest';
import {
  newRoot, splitPath, joinPath, parentPath, basename, getNode,
  readFile, createFile, writeFile, deleteNode, renameNode, moveNode,
  duplicateNode, listDir, walkNodes, filesUnder, FsError, MANIFEST_NAME,
  type FsNode,
} from './fs';

function ws(...paths: string[]): FsNode {
  const w = newRoot();
  paths.forEach((p, i) => createFile(w, p, `content-${i}`));
  return w;
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.fail(`expected FsError ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(FsError);
    expect((e as FsError).code).toBe(code);
  }
}

describe('splitPath / path utils', () => {
  it('normalizes relative paths and skips "." segments', () => {
    expect(splitPath('')).toEqual([]);
    expect(splitPath('/')).toEqual([]);
    expect(splitPath('a//b/./c')).toEqual(['a', 'b', 'c']);
  });

  it('rejects traversal', () => {
    expectCode(() => splitPath('../etc/passwd'), 'invalid-path');
    expectCode(() => splitPath('a/../../b'), 'invalid-path');
  });

  it('rejects backslashes and control characters', () => {
    expectCode(() => splitPath('a\\b'), 'invalid-name');
    expectCode(() => splitPath('a\u0000b'), 'invalid-name');
    expectCode(() => splitPath('a\nb'), 'invalid-name');
  });

  it('treats "." as the root (normalizes to []) and rejects overlong names', () => {
    expect(splitPath('.')).toEqual([]);
    expectCode(() => splitPath('x/' + 'y'.repeat(256)), 'invalid-name');
  });

  it('joinPath/parentPath/basename', () => {
    expect(joinPath('', 'a', 'b')).toBe('a/b');
    expect(joinPath('a')).toBe('a');
    expect(parentPath('a/b/c')).toBe('a/b');
    expect(parentPath('a')).toBe('');
    expect(basename('a/b/c.txt')).toBe('c.txt');
    expect(basename('')).toBe('');
  });
});

describe('createFile / writeFile / readFile', () => {
  it('creates files with implicit parent folders (mkdirp)', () => {
    const w = ws();
    createFile(w, 'svc/api/main.pcd', 'x');
    expect(getNode(w, 'svc/api/main.pcd')?.content).toBe('x');
    expect(getNode(w, 'svc')?.kind).toBe('folder');
    expect(getNode(w, 'svc/api')?.kind).toBe('folder');
  });

  it('rejects duplicates, the root, and the reserved manifest name', () => {
    const w = ws('a.pcd');
    expectCode(() => createFile(w, 'a.pcd'), 'exists');
    expectCode(() => createFile(w, ''), 'invalid-path');
    expectCode(() => createFile(w, MANIFEST_NAME), 'reserved-name');
  });

  it('writeFile overwrites existing files but not folders', () => {
    const w = ws('a.pcd');
    writeFile(w, 'a.pcd', 'v2');
    expect(readFile(w, 'a.pcd')).toBe('v2');
    createFile(w, 'd/inner.pcd');
    expectCode(() => writeFile(w, 'd', 'x'), 'is-folder');
    writeFile(w, 'd/b.pcd', 'x');
    expect(readFile(w, 'd/b.pcd')).toBe('x');
  });

  it('readFile errors: not-found, is-folder', () => {
    const w = ws('a.pcd');
    expectCode(() => readFile(w, 'nope.pcd'), 'not-found');
    expectCode(() => readFile(w, ''), 'is-folder');
  });
});

describe('rename / move / duplicate / delete', () => {
  it('renames within the same folder; enforces uniqueness', () => {
    const w = ws('a.pcd', 'b.pcd');
    renameNode(w, 'a.pcd', 'c.pcd');
    expect(getNode(w, 'c.pcd')).not.toBeNull();
    expect(getNode(w, 'a.pcd')).toBeNull();
    expectCode(() => renameNode(w, 'c.pcd', 'b.pcd'), 'exists');
    expectCode(() => renameNode(w, 'ghost.pcd', 'z.pcd'), 'not-found');
    expectCode(() => renameNode(w, '', 'root'), 'invalid-path');
  });

  it('reserves the manifest name at the root on rename, allows it nested', () => {
    const w = ws('a.pcd');
    expectCode(() => renameNode(w, 'a.pcd', MANIFEST_NAME), 'reserved-name');
    createFile(w, 'docs/x.pcd');
    renameNode(w, 'docs/x.pcd', MANIFEST_NAME);
    expect(getNode(w, `docs/${MANIFEST_NAME}`)).not.toBeNull();
  });

  it('moves into another folder and rejects moves into the own subtree', () => {
    const w = ws('a/x.pcd', 'b/keep.pcd');
    moveNode(w, 'a/x.pcd', 'b');
    expect(getNode(w, 'b/x.pcd')).not.toBeNull();
    expect(getNode(w, 'a/x.pcd')).toBeNull();
    expectCode(() => moveNode(w, 'a', 'a/sub'), 'into-self');
    expectCode(() => moveNode(w, '', 'b'), 'invalid-path');
    expectCode(() => moveNode(w, 'a/x.pcd', 'ghost'), 'not-found');
  });

  it('moves a whole folder to the root and enforces collisions', () => {
    const w = ws('a/x.pcd', 'b/y.pcd', 'a/dup.pcd', 'b/dup.pcd');
    moveNode(w, 'a', '');
    expect(getNode(w, 'a/x.pcd')).not.toBeNull();
    expectCode(() => moveNode(w, 'a/dup.pcd', 'b'), 'exists');
    expect(readFile(w, 'a/dup.pcd')).toBe('content-2'); // untouched on collision
  });

  it('duplicates files and folders with unique "copy" names', () => {
    const w = ws('a.pcd', 'svc/x.pcd');
    const p1 = duplicateNode(w, 'a.pcd');
    expect(p1).toBe('a copy.pcd');
    expect(readFile(w, 'a copy.pcd')).toBe('content-0');
    const p2 = duplicateNode(w, 'a.pcd');
    expect(p2).toBe('a copy 2.pcd');
    const p3 = duplicateNode(w, 'svc');
    expect(getNode(w, `${p3}/x.pcd`)?.content).toBe('content-1');
    expect(getNode(w, `${p3}/x.pcd`)).not.toBe(getNode(w, 'svc/x.pcd')); // deep copy
    expectCode(() => duplicateNode(w, ''), 'invalid-path');
    expectCode(() => duplicateNode(w, 'ghost'), 'not-found');
  });

  it('deletes nodes recursively; root is protected', () => {
    const w = ws('a/x.pcd', 'a/y.pcd', 'b.pcd');
    deleteNode(w, 'a');
    expect(getNode(w, 'a')).toBeNull();
    expect(getNode(w, 'b.pcd')).not.toBeNull();
    expectCode(() => deleteNode(w, ''), 'invalid-path');
    expectCode(() => deleteNode(w, 'ghost'), 'not-found');
  });
});

describe('listDir / walkNodes / filesUnder', () => {
  it('lists folders first, then files, both alphabetically', () => {
    const w = newRoot();
    createFile(w, 'zeta.pcd');
    createFile(w, 'dir/b.pcd');
    createFile(w, 'alpha.pcd');
    createFile(w, 'beta/inner.pcd');
    expect(listDir(w, '').map((n) => n.name)).toEqual(['beta', 'dir', 'alpha.pcd', 'zeta.pcd']);
    expect(listDir(w, '').filter((n) => n.kind === 'folder')).toHaveLength(2);
    expectCode(() => listDir(w, 'alpha.pcd'), 'is-file');
    expectCode(() => listDir(w, 'missing'), 'not-found');
  });

  it('walks the tree in pre-order including empty folders', () => {
    const w = newRoot();
    createFile(w, 'b/inner.pcd');
    createFile(w, 'a.pcd');
    createFile(w, 'empty/.keep'); // ensure empty folder survives: create + delete file
    deleteNode(w, 'empty/.keep');
    const paths = walkNodes(w).map((e) => e.path);
    expect(paths).toEqual(['b', 'b/inner.pcd', 'empty', 'a.pcd']); // folders first, pre-order
    expect(filesUnder(w).map((e) => e.path)).toEqual(['b/inner.pcd', 'a.pcd']);
    expect(filesUnder(w, 'b').map((e) => e.path)).toEqual(['b/inner.pcd']);
  });
});
