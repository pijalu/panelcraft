// SPDX-License-Identifier: GPL-3.0-only
// Import resolution (F-20; FR-I1..I4): an `import alias as "path"` makes the
// target file's top-level objects referenceable as `alias.objectId`. The canvas
// shows them as read-only ghosts, links may point at them, and the import graph
// must be acyclic — missing files and cycles surface in the UI instead of being
// silently ignored.

import { parsePDL } from '../format/parser';
import type { Doc, Obj } from './types';

export interface GhostObject {
  /** Fully-qualified reference used by links and flows (`alias.objectId`). */
  ref: string;
  alias: string;
  /** Workspace path of the file the object lives in (click-through target). */
  path: string;
  obj: Obj;
}

export type ImportErrorCode = 'missing' | 'cycle' | 'escape' | 'unreadable';

export interface ImportError {
  code: ImportErrorCode;
  alias: string;
  path: string;
  message: string;
}

export interface ImportResolution {
  ghosts: GhostObject[];
  errors: ImportError[];
}

/** POSIX-style normalise for workspace-relative paths ('' = root). */
export function normalisePath(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** Resolve `raw` relative to the directory of `fromPath`. */
export function resolvePath(fromPath: string, raw: string): string | null {
  if (raw.startsWith('/') || raw.includes('\\')) return null; // absolute/backslash: invalid
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const resolved = normalisePath(dir === '' ? raw : `${dir}/${raw}`);
  // traversal above the workspace root is rejected
  let depth = 0;
  for (const seg of `${dir}/${raw}`.split('/')) {
    if (seg === '..') depth -= 1;
    else if (seg !== '' && seg !== '.') depth += 1;
    if (depth < 0) return null;
  }
  return resolved;
}

/**
 * Resolve the ghost objects of `doc` (one level deep — the format allows nested
 * imports, but a ghost link must reference a concrete object; nested aliases are
 * reported as `unreadable` rather than guessed at).
 *
 * @param read returns the file text, or null when the path is unknown
 */
export function resolveImportGhosts(
  doc: Doc,
  fromPath: string,
  read: (path: string) => string | null,
): ImportResolution {
  const ghosts: GhostObject[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>([fromPath]);

  for (const imp of doc.imports) {
    const target = resolvePath(fromPath, imp.path);
    if (target === null) {
      errors.push({
        code: 'escape',
        alias: imp.alias,
        path: imp.path,
        message: `import path escapes the workspace: "${imp.path}"`,
      });
      continue;
    }
    if (seen.has(target)) {
      errors.push({
        code: 'cycle',
        alias: imp.alias,
        path: target,
        message: `import cycle through "${imp.path}"`,
      });
      continue;
    }
    seen.add(target);
    const text = read(target);
    if (text === null) {
      errors.push({
        code: 'missing',
        alias: imp.alias,
        path: target,
        message: `imported file not found: "${imp.path}"`,
      });
      continue;
    }
    const parsed = parsePDL(text).doc;
    if (parsed === null) {
      errors.push({
        code: 'unreadable',
        alias: imp.alias,
        path: target,
        message: `imported file does not parse: "${imp.path}"`,
      });
      continue;
    }
    if (parsed.imports.length > 0) {
      // nested imports are not flattened into ghosts (no alias chains in v1)
      errors.push({
        code: 'unreadable',
        alias: imp.alias,
        path: target,
        message: `imported file has its own imports (not flattened): "${imp.path}"`,
      });
    }
    for (const obj of parsed.objects) {
      ghosts.push({ ref: `${imp.alias}.${obj.id}`, alias: imp.alias, path: target, obj });
    }
  }
  return { ghosts, errors };
}

/** True when `id` is an import-qualified reference (`alias.objectId`). */
export function isImportRef(id: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z][A-Za-z0-9_-]*$/.test(id);
}
