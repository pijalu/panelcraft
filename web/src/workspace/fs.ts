// SPDX-License-Identifier: GPL-3.0-only
// M3-WP1: virtual file system — path utilities + tree operations.
// Pure data module (no DOM, no storage): this is the frozen API that the
// store (M3-WP2), zip (M3-WP3) and UI layers build on.
//
// Paths are '/'-separated and relative to the workspace root; the root
// itself is the empty string ''. Traversal (".."), absolute paths,
// backslashes and control characters are rejected (SPEC N6 hardening).

export type NodeKind = 'file' | 'folder';

export interface FsNode {
  kind: NodeKind;
  name: string;
  /** File payload (UTF-8 text, e.g. .pcd source). Folders: undefined. */
  content?: string;
  /** Folder children, kept sorted (folders first). Files: undefined. */
  children?: FsNode[];
}

export type FsErrorCode =
  | 'invalid-path'
  | 'invalid-name'
  | 'reserved-name'
  | 'not-found'
  | 'exists'
  | 'is-folder'
  | 'is-file'
  | 'into-self';

export class FsError extends Error {
  constructor(
    readonly code: FsErrorCode,
    readonly path: string,
    message?: string,
  ) {
    super(message ?? `${code}: ${path}`);
    this.name = 'FsError';
  }
}

/** Reserved: the workspace manifest lives only inside exported ZIPs (FR-W5). */
export const MANIFEST_NAME = 'panelcraft.workspace.json';

const MAX_NAME = 255;
// eslint-disable-next-line no-control-regex -- deliberate: reject control chars in names
const CONTROL_CHARS = /[\0-\x1f]/;

/** Fresh workspace tree root (display name lives in app state / storage). */
export function newRoot(): FsNode {
  return { kind: 'folder', name: '', children: [] };
}

function validateName(name: string, ctx: string): void {
  if (name.length === 0 || name.length > MAX_NAME) {
    throw new FsError('invalid-name', ctx, `invalid name length: ${JSON.stringify(name)}`);
  }
  if (name === '.' || name === '..') {
    throw new FsError('invalid-name', ctx, `relative segment rejected: ${name}`);
  }
  if (name.includes('\\')) {
    throw new FsError('invalid-name', ctx, `backslash rejected: ${JSON.stringify(name)}`);
  }
  if (CONTROL_CHARS.test(name)) {
    throw new FsError('invalid-name', ctx, `control characters rejected: ${JSON.stringify(name)}`);
  }
}

/** Split + validate a path into segments; '' resolves to the root ( []). */
export function splitPath(path: string): string[] {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      throw new FsError('invalid-path', path, `path traversal rejected: ${path}`);
    }
    validateName(seg, path);
    out.push(seg);
  }
  return out;
}

export function joinPath(...parts: string[]): string {
  return parts.filter((p) => p !== '').join('/');
}

export function parentPath(path: string): string {
  const segs = splitPath(path);
  segs.pop();
  return segs.join('/');
}

export function basename(path: string): string {
  const segs = splitPath(path);
  return segs.pop() ?? '';
}

/** Resolve a path to its node, or null when absent. */
export function getNode(root: FsNode, path: string): FsNode | null {
  let node = root;
  for (const seg of splitPath(path)) {
    if (node.kind !== 'folder') return null;
    const next = node.children?.find((c) => c.name === seg);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Read a file's content; throws not-found / is-folder. */
export function readFile(root: FsNode, path: string): string {
  const node = getNode(root, path);
  if (!node) throw new FsError('not-found', path);
  if (node.kind !== 'file') throw new FsError('is-folder', path, `not a file: ${path}`);
  return node.content ?? '';
}

function sortChildren(folder: FsNode): void {
  folder.children?.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function childrenOf(folder: FsNode): FsNode[] {
  const list = folder.children ?? [];
  folder.children = list;
  return list;
}

/** mkdir -p: ensure the folder chain for `path` exists; returns deepest folder. */
function mkdirp(root: FsNode, path: string): FsNode {
  let node = root;
  let walked = '';
  for (const seg of splitPath(path)) {
    if (node.kind !== 'folder') {
      throw new FsError('is-file', walked, `folder path traverses a file: ${walked}`);
    }
    let next = node.children?.find((c) => c.name === seg);
    if (!next) {
      next = { kind: 'folder', name: seg, children: [] };
      childrenOf(node).push(next);
      sortChildren(node);
    }
    node = next;
    walked = walked === '' ? seg : `${walked}/${seg}`;
  }
  return node;
}

function requireFolder(root: FsNode, path: string): FsNode {
  const node = getNode(root, path);
  if (!node) throw new FsError('not-found', path);
  if (node.kind !== 'folder') throw new FsError('is-file', path, `not a folder: ${path}`);
  return node;
}

/** Create a file (missing parent folders are auto-created). Throws exists. */
export function createFile(root: FsNode, path: string, content = ''): FsNode {
  const segs = splitPath(path);
  const name = segs.pop();
  if (!name) throw new FsError('invalid-path', path, 'cannot create the root');
  const parentSegs = segs.join('/');
  if (parentSegs === '' && name === MANIFEST_NAME) {
    throw new FsError('reserved-name', path, `${MANIFEST_NAME} is reserved for workspace ZIPs`);
  }
  const dir = mkdirp(root, parentSegs);
  if (childrenOf(dir).some((c) => c.name === name)) throw new FsError('exists', path);
  const file: FsNode = { kind: 'file', name, content };
  childrenOf(dir).push(file);
  sortChildren(dir);
  return file;
}

/** Create-or-overwrite (autosave / import path). */
export function writeFile(root: FsNode, path: string, content: string): FsNode {
  const existing = getNode(root, path);
  if (existing && existing.kind === 'folder') {
    throw new FsError('is-folder', path, `cannot write a file over a folder: ${path}`);
  }
  if (existing) {
    existing.content = content;
    return existing;
  }
  return createFile(root, path, content);
}

function removeFromParent(root: FsNode, path: string): void {
  const segs = splitPath(path);
  const parent = requireFolder(root, segs.slice(0, -1).join('/'));
  const list = childrenOf(parent);
  const idx = list.findIndex((c) => c.name === segs[segs.length - 1]);
  if (idx === -1) throw new FsError('not-found', path);
  list.splice(idx, 1);
}

/** Delete a node; the root cannot be deleted. */
export function deleteNode(root: FsNode, path: string): void {
  if (splitPath(path).length === 0) throw new FsError('invalid-path', path, 'cannot delete the root');
  removeFromParent(root, path);
}

/** Rename in place. Throws invalid-name / reserved-name / exists / not-found. */
export function renameNode(root: FsNode, path: string, newName: string): void {
  validateName(newName, path);
  const segs = splitPath(path);
  if (segs.length === 0) throw new FsError('invalid-path', path, 'cannot rename the root');
  if (segs.length === 1 && newName === MANIFEST_NAME) {
    throw new FsError('reserved-name', path, `${MANIFEST_NAME} is reserved for workspace ZIPs`);
  }
  const parent = requireFolder(root, segs.slice(0, -1).join('/'));
  const node = childrenOf(parent).find((c) => c.name === segs[segs.length - 1]);
  if (!node) throw new FsError('not-found', path);
  const clash = childrenOf(parent).some((c) => c !== node && c.name === newName);
  if (clash) throw new FsError('exists', joinPath(parentPath(path), newName));
  node.name = newName;
  sortChildren(parent);
}

/** Move `from` into folder `toDir` (keeps its basename). */
export function moveNode(root: FsNode, from: string, toDir: string): void {
  const fromSegs = splitPath(from);
  if (fromSegs.length === 0) throw new FsError('invalid-path', from, 'cannot move the root');
  const dirSegs = splitPath(toDir);
  if (dirSegs.length >= fromSegs.length && fromSegs.every((s, i) => s === dirSegs[i])) {
    throw new FsError('into-self', from, `cannot move ${from} into its own subtree ${toDir}`);
  }
  const node = getNode(root, from);
  if (!node) throw new FsError('not-found', from);
  const dest = requireFolder(root, toDir); // '' resolves to root
  const name = fromSegs.pop();
  if (!name) throw new FsError('invalid-path', from, 'cannot move the root');
  if (childrenOf(dest).some((c) => c !== node && c.name === name)) {
    throw new FsError('exists', joinPath(toDir, name));
  }
  removeFromParent(root, from);
  childrenOf(dest).push(node);
  sortChildren(dest);
}

function cloneNode(n: FsNode): FsNode {
  return n.kind === 'folder'
    ? { kind: 'folder', name: n.name, children: (n.children ?? []).map(cloneNode) }
    : { kind: 'file', name: n.name, content: n.content };
}

/** Deep-copy a node next to the original as "name copy", "name copy 2", … */
export function duplicateNode(root: FsNode, path: string): string {
  const segs = splitPath(path);
  if (segs.length === 0) throw new FsError('invalid-path', path, 'cannot duplicate the root');
  const node = getNode(root, path);
  if (!node) throw new FsError('not-found', path);
  const parent = requireFolder(root, segs.slice(0, -1).join('/'));
  const copy = cloneNode(node);
  const [stem, ext] = splitExt(node.name);
  const taken = new Set(childrenOf(parent).map((c) => c.name));
  let name = `${stem} copy${ext}`;
  for (let n = 2; taken.has(name); n++) name = `${stem} copy ${n}${ext}`;
  copy.name = name;
  childrenOf(parent).push(copy);
  sortChildren(parent);
  return joinPath(segSlices(segs, -1), name);
}

/** Directory segments of a path: all but the last (or '' at root). */
function segSlices(segs: string[], dropLast: number): string {
  return segs.slice(0, segs.length + dropLast).join('/');
}

/** "a.pcd" → ["a", ".pcd"]; "archive" → ["archive", ""]; ".env" → [".env", ""]. */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? [name, ''] : [name.slice(0, dot), name.slice(dot)];
}

/** Sorted snapshot of a folder's children (folders first). */
export function listDir(root: FsNode, path: string): FsNode[] {
  return [...childrenOf(requireFolder(root, path))].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Pre-order walk: every node with its workspace path (sorted, folders first). */
export function walkNodes(
  root: FsNode,
  path = '',
  node: FsNode = root,
  out: Array<{ path: string; node: FsNode }> = [],
): Array<{ path: string; node: FsNode }> {
  if (path !== '') out.push({ path, node });
  if (node.kind === 'folder') {
    for (const child of listDir(root, path)) {
      walkNodes(root, joinPath(path, child.name), child, out);
    }
  }
  return out;
}

/** All file nodes under `path` (inclusive), preorder. */
export function filesUnder(root: FsNode, path = ''): Array<{ path: string; node: FsNode }> {
  return walkNodes(root, path).filter(({ node }) => node.kind === 'file');
}
