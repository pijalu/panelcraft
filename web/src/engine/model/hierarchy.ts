// SPDX-License-Identifier: GPL-3.0-only
// C4 decomposition and embedded source (IR v10; docs/FILE-FORMAT.md §3.2, §3.3).
//
// The hierarchy is authored on the parent object only — `drilldown "<path>" [view
// <id>]` — so an edge has exactly one author and the two ends can never disagree.
// Everything here is pure: file reads are injected, so the same logic serves the
// browser workspace, the validation pass and the CLI.
import { diag, type Diagnostic } from '../format/diagnostics';
import { parsePDL } from '../format/parser';
import type { Doc, Kind, Level, Obj } from './types';

/** Child C4 levels a parent kind may open (§3.2 allowed transitions). */
export const ALLOWED_CHILD_LEVELS: Partial<Record<Kind, Level[]>> = {
  system: ['container'],
  system_ext: ['container'],
  container: ['component', 'deployment'],
};

/** `source` limits (§3.3): per object and per document, in bytes and lines. */
export const SOURCE_MAX_OBJECT_BYTES = 65536;
export const SOURCE_MAX_OBJECT_LINES = 4096;
export const SOURCE_MAX_DOC_BYTES = 262144;

/** How deep a decomposition chain is followed before it is called broken. */
const MAX_CHAIN = 32;

/** Reads a workspace file's text, or `null` when the path is unknown. */
export type ReadFile = (path: string) => string | null;

/** Why a `drilldown` target string cannot be used at all. */
export type TargetProblem = 'escape' | 'not-pcd';

export type ResolvedTarget =
  | { ok: true; path: string }
  | { ok: false; problem: TargetProblem };

/** Absolute paths, backslash separators and empty strings are unusable. */
const isIllegalShape = (raw: string): boolean =>
  raw === '' || raw.startsWith('/') || raw.includes('\\');

/** True when `dir/raw` climbs above the workspace root at any step. */
const escapesRoot = (dir: string, raw: string): boolean => {
  let depth = 0;
  for (const seg of `${dir}/${raw}`.split('/')) {
    if (seg === '..') depth -= 1;
    else if (seg !== '' && seg !== '.') depth += 1;
    if (depth < 0) return true;
  }
  return false;
};

/** POSIX-normalise `dir/raw` ('' = root), keeping the format's separators. */
const joinPosix = (dir: string, raw: string): string => {
  const parts: string[] = [];
  for (const seg of `${dir}/${raw}`.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
};

/**
 * Resolve a `drilldown` path written in `fromPath` to a workspace path.
 * Rejects absolute paths, backslash separators, traversal above the workspace root
 * and non-`.pcd` suffixes — all of them `P213`.
 */
export function resolveDrilldown(fromPath: string, raw: string): ResolvedTarget {
  if (isIllegalShape(raw)) return { ok: false, problem: 'escape' };
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  if (escapesRoot(dir, raw)) return { ok: false, problem: 'escape' };
  const path = joinPosix(dir, raw);
  if (!path.toLowerCase().endsWith('.pcd')) return { ok: false, problem: 'not-pcd' };
  return { ok: true, path };
}

/** The object that decomposes into a subordinate diagram, if any. */
export function decomposingObject(doc: Doc): Obj | undefined {
  return doc.objects.find((o) => o.drilldown !== undefined);
}

/** All objects of `doc` that declare a decomposition, in document order. */
export function decomposers(doc: Doc): Obj[] {
  return doc.objects.filter((o) => o.drilldown !== undefined);
}

/**
 * Follow the decomposition chain starting at `file`'s first decomposing object.
 * Returns the visited workspace paths in order; a repeated path is a cycle (`P216`)
 * and a missing/unreadable file simply ends the chain (reported by the caller).
 */
export function drillchain(file: string, read: ReadFile): { chain: string[]; cyclic: boolean } {
  const chain: string[] = [file];
  let current = file;
  for (let step = 0; step < MAX_CHAIN; step += 1) {
    const doc = parseFile(read, current);
    const parent = doc === undefined ? undefined : decomposingObject(doc);
    if (parent?.drilldown === undefined) return { chain, cyclic: false };
    const target = resolveDrilldown(current, parent.drilldown.path);
    if (!target.ok) return { chain, cyclic: false };
    if (chain.includes(target.path)) return { chain, cyclic: true };
    chain.push(target.path);
    current = target.path;
  }
  return { chain, cyclic: false };
}

/** Parse a workspace file, or `undefined` when it is missing or unparseable. */
export function parseFile(read: ReadFile, path: string): Doc | undefined {
  const text = read(path);
  if (text === null) return undefined;
  return parsePDL(text).doc ?? undefined;
}

/** Which object (if any) owns `childPath`, scanning every known file. */
export function parentOf(
  files: readonly { path: string; doc: Doc }[],
  childPath: string,
): { path: string; obj: Obj } | undefined {
  for (const file of files) {
    for (const obj of file.doc.objects) {
      if (obj.drilldown === undefined) continue;
      const target = resolveDrilldown(file.path, obj.drilldown.path);
      if (target.ok && target.path === childPath) return { path: file.path, obj };
    }
  }
  return undefined;
}

// --- validation -------------------------------------------------------------

interface DrillCheckCtx {
  doc: Doc;
  file: string | undefined;
  read: ReadFile | undefined;
  out: Diagnostic[];
}

/** Children claimed by two objects of the same document (`P211`). */
function checkDuplicateTargets(ctx: DrillCheckCtx): void {
  const claimed = new Map<string, Obj>();
  for (const obj of decomposers(ctx.doc)) {
    const target = resolveDrilldown(ctx.file ?? '', obj.drilldown?.path ?? '');
    if (!target.ok) continue;
    const first = claimed.get(target.path);
    if (first === undefined) {
      claimed.set(target.path, obj);
      continue;
    }
    ctx.out.push(diag(
      'P211',
      `"${obj.id}" and "${first.id}" both claim the child diagram "${target.path}"`
        + ' (one parent per child: keep one drilldown line)',
      obj.pos.line,
      obj.pos.col,
    ));
  }
}

/** Kind and level rules: only C4 elements decompose, into the next level down. */
function checkKind(ctx: DrillCheckCtx, obj: Obj): boolean {
  if (ALLOWED_CHILD_LEVELS[obj.kind] !== undefined) return true;
  ctx.out.push(diag(
    'P215',
    `a ${obj.kind} cannot own a subordinate diagram (only system, system_ext and`
      + ' container decompose)',
    obj.pos.line,
    obj.pos.col,
  ));
  return false;
}

/** Allowed level transition (`P214`) and view id (`P218`) of a readable child. */
function checkChild(ctx: DrillCheckCtx, obj: Obj, targetPath: string): void {
  const allowed = ALLOWED_CHILD_LEVELS[obj.kind];
  if (allowed === undefined) return;
  const child = ctx.read === undefined ? undefined : parseFile(ctx.read, targetPath);
  if (child === undefined) return;
  if (child.level !== undefined && !allowed.includes(child.level)) {
    ctx.out.push(diag(
      'P214',
      `"${targetPath}" declares level ${child.level}, but a ${obj.kind} decomposes`
        + ` into ${allowed.join(' or ')}`,
      obj.pos.line,
      obj.pos.col,
    ));
  }
  checkViewExists(ctx, obj, child, targetPath);
}

/** The optional `view` id must exist in the child file (`P218`). */
function checkViewExists(ctx: DrillCheckCtx, obj: Obj, child: Doc, targetPath: string): void {
  const view = obj.drilldown?.view;
  if (view === undefined) return;
  const declared = child.views.some((v) => v.id === view);
  if (declared) return;
  ctx.out.push(diag(
    'P218',
    `"${targetPath}" has no view with id "${view}" (add \`as ${view}\` to a view line)`,
    obj.pos.line,
    obj.pos.col,
  ));
}

/** Target must be reachable, `.pcd`, inside the workspace and acyclic. */
function checkReachable(ctx: DrillCheckCtx, obj: Obj): string | null {
  const raw = obj.drilldown?.path ?? '';
  const target = resolveDrilldown(ctx.file ?? '', raw);
  if (!target.ok) {
    ctx.out.push(diag(
      'P213',
      target.problem === 'not-pcd'
        ? `drilldown target "${raw}" is not a .pcd path`
        : `drilldown target "${raw}" escapes the workspace or is not a relative POSIX path`,
      obj.pos.line,
      obj.pos.col,
    ));
    return null;
  }
  if (ctx.read === undefined) return target.path;
  if (ctx.read(target.path) === null) {
    ctx.out.push(diag(
      'P212',
      `drilldown target not found: "${raw}" (the relation stays; re-point or create it)`,
      obj.pos.line,
      obj.pos.col,
      'warning',
    ));
    return null;
  }
  const walk = drillchain(target.path, ctx.read);
  if (walk.cyclic) {
    ctx.out.push(diag(
      'P216',
      `decomposition cycle: ${[...walk.chain, target.path].join(' → ')}`,
      obj.pos.line,
      obj.pos.col,
    ));
  }
  return target.path;
}

/** Embedded source limits (`P217`), per object and per document. */
function checkSource(doc: Doc, out: Diagnostic[]): void {
  const encoder = new TextEncoder();
  let total = 0;
  let first: Obj | undefined;
  for (const obj of doc.objects) {
    if (obj.source === undefined) continue;
    first ??= obj;
    const bytes = encoder.encode(obj.source.lines.join('\n')).length;
    total += bytes;
    if (bytes > SOURCE_MAX_OBJECT_BYTES || obj.source.lines.length > SOURCE_MAX_OBJECT_LINES) {
      out.push(diag(
        'P217',
        `source on "${obj.id}" is ${bytes} bytes in ${obj.source.lines.length} lines`
          + ` (limit ${SOURCE_MAX_OBJECT_BYTES} bytes / ${SOURCE_MAX_OBJECT_LINES} lines)`,
        obj.pos.line,
        obj.pos.col,
      ));
    }
  }
  if (first !== undefined && total > SOURCE_MAX_DOC_BYTES) {
    out.push(diag(
      'P217',
      `embedded source totals ${total} bytes (limit ${SOURCE_MAX_DOC_BYTES} per document)`,
      first.pos.line,
      first.pos.col,
    ));
  }
}

/**
 * Registers every hierarchy finding for `doc` (§3.2/§3.3, codes P211–P218).
 * `file` is the document's workspace path and `read` its file probe: without them
 * only the local rules (kind, duplicate target, source limits, path shape) run.
 */
export function checkHierarchy(
  doc: Doc,
  file: string | undefined,
  read: ReadFile | undefined,
  out: Diagnostic[],
): void {
  const ctx: DrillCheckCtx = { doc, file, read, out };
  checkDuplicateTargets(ctx);
  checkSource(doc, out);
  for (const obj of decomposers(doc)) {
    // The kind rule comes first: an object that cannot decompose at all has
    // nothing to resolve, so it must not also report a missing target.
    if (!checkKind(ctx, obj)) continue;
    const targetPath = checkReachable(ctx, obj);
    if (targetPath !== null) checkChild(ctx, obj, targetPath);
  }
}
