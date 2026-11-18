// SPDX-License-Identifier: GPL-3.0-only
// Pure transitive decomposition graph service (bugs.md: complete embedded
// export). All file access goes through WorkspaceReader so the same planner
// serves the browser, tests and any future CLI path. It never writes.
import { diag, type Diagnostic } from '../engine/format/diagnostics';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import {
  EMBED_MAX_BYTES, EMBED_MAX_DEPTH, EMBED_MAX_NODES, resolveDrilldown,
} from '../engine/model/hierarchy';
import { validateDoc } from '../engine/model/validate';
import type { Doc, Obj } from '../engine/model/types';

/** The only workspace surface the planner needs. */
export interface WorkspaceReader {
  files(): Array<{ path: string; text: string }>;
  /** File text or null when unknown. May throw; the planner turns that into P222. */
  text(path: string): string | null;
}

export interface EmbeddedDescendant {
  /** Stable logical path of the child, resolved from its declaring document. */
  path: string;
  doc: Doc;
}

export interface EmbeddedExportPlan {
  /** Root path the plan was captured from. */
  root: string;
  /** Ordered descendants, depth-first in authored order. */
  docs: EmbeddedDescendant[];
  /** Canonical root text with every reachable child embedded. */
  text: string;
}

export type EmbedResult =
  | { ok: true; plan: EmbeddedExportPlan; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

interface GraphState {
  seen: Set<string>;
  docs: EmbeddedDescendant[];
  nodes: number;
  bytes: number;
}

/** Catch reader failures so one unreadable child cannot silently vanish. */
function safeRead(reader: WorkspaceReader, path: string, out: Diagnostic[]): string | null {
  try {
    return reader.text(path);
  } catch (error) {
    out.push(diag('P222',
      `cannot read decomposition child "${path}": ${error instanceof Error ? error.message : String(error)}`,
      1, 1));
    return null;
  }
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const errorOf = (d: Diagnostic): boolean => d.severity === 'error';

/** Parse and validate one descendant before it may join an export plan. */
function childDoc(
  text: string | null,
  path: string,
  obj: Obj | undefined,
  out: Diagnostic[],
): Doc | null {
  if (text === null) {
    out.push(diag('P212',
      `decomposition child not found: "${path}" (complete export needs every child file)`,
      obj?.pos.line ?? 1, obj?.pos.col ?? 1));
    return null;
  }
  const parsed = parsePDL(text);
  if (parsed.doc === null) {
    for (const d of parsed.diagnostics) {
      out.push(diag(d.code, `${path}: ${d.message}`, d.line, d.col, d.severity));
    }
    return null;
  }
  for (const d of validateDoc(parsed.doc, { file: path }).filter(errorOf)) {
    out.push(diag(d.code, `${path}: ${d.message}`, d.line, d.col, d.severity));
  }
  return parsed.doc;
}

/** Resolve, cycle-check and claim one logical child path. */
function claimPath(
  raw: string,
  declaring: string,
  obj: Obj,
  ancestors: readonly string[],
  state: GraphState,
  out: Diagnostic[],
): string | null {
  const target = resolveDrilldown(declaring, raw);
  if (!target.ok) {
    out.push(diag('P213',
      `decomposition target "${raw}" escapes the workspace or is not a relative .pcd path`,
      obj.pos.line, obj.pos.col));
    return null;
  }
  if (ancestors.includes(target.path)) {
    out.push(diag('P220',
      `decomposition cycle: ${[...ancestors, target.path].join(' → ')}`,
      obj.pos.line, obj.pos.col));
    return null;
  }
  if (state.seen.has(target.path)) {
    out.push(diag('P219',
      `child "${target.path}" is claimed by more than one decomposition`,
      obj.pos.line, obj.pos.col));
    return null;
  }
  state.seen.add(target.path);
  return target.path;
}

/** Recursively replace linked children with embedded documents. */
function walk(
  doc: Doc,
  declaring: string,
  depth: number,
  ancestors: readonly string[],
  state: GraphState,
  reader: WorkspaceReader,
  out: Diagnostic[],
): void {
  if (depth > EMBED_MAX_DEPTH || state.nodes > EMBED_MAX_NODES || state.bytes > EMBED_MAX_BYTES) {
    out.push(diag('P218',
      `embedded decomposition exceeds limits (depth ${depth}/${EMBED_MAX_DEPTH},`
        + ` children ${state.nodes}/${EMBED_MAX_NODES}, bytes ${state.bytes}/${EMBED_MAX_BYTES})`,
      1, 1));
    return;
  }
  for (const obj of doc.objects) {
    const target = obj.drilldown;
    if (target === undefined) continue;
    const path = claimPath(target.path, declaring, obj, ancestors, state, out);
    if (path === null) continue;
    if (target.kind === 'linked') {
      const child = childDoc(safeRead(reader, path, out), path, obj, out);
      if (child === null) continue;
      obj.drilldown = { kind: 'embedded', path, doc: child };
      state.nodes += 1;
      state.bytes += printDoc(child).length;
      state.docs.push({ path, doc: child });
      walk(child, path, depth + 1, [...ancestors, path], state, reader, out);
      continue;
    }
    if (target.doc === undefined) {
      out.push(diag('P218', `embedded child "${path}" has no document`, obj.pos.line, obj.pos.col));
      continue;
    }
    target.path = path;
    state.nodes += 1;
    state.bytes += printDoc(target.doc).length;
    state.docs.push({ path, doc: target.doc });
    walk(target.doc, path, depth + 1, [...ancestors, path], state, reader, out);
  }
}

/** True when any linked child is reachable from `root`, including nested docs. */
export function hasLinkedDecomposition(root: string, reader: WorkspaceReader): boolean {
  const text = safeRead(reader, root, []);
  if (text === null) return false;
  const doc = parsePDL(text).doc;
  if (doc === null) return false;
  const seen = new Set<string>();
  const visit = (current: Doc, declaring: string): boolean => current.objects.some((obj) => {
    const target = obj.drilldown;
    if (target === undefined) return false;
    const resolved = resolveDrilldown(declaring, target.path);
    if (!resolved.ok || seen.has(resolved.path)) return false;
    seen.add(resolved.path);
    if (target.kind === 'linked') return true;
    return visit(target.doc, resolved.path);
  });
  return visit(doc, root);
}

/**
 * Build an all-or-nothing embedded export. Any diagnostic means failure: the
 * caller must not download a partial file or fall back to a linked export.
 */
export function planEmbeddedExport(root: string, reader: WorkspaceReader): EmbedResult {
  const out: Diagnostic[] = [];
  const text = safeRead(reader, root, out);
  const parsed = text === null ? null : parsePDL(text);
  if (text === null || parsed === null || parsed.doc === null) {
    if (parsed !== null) out.push(...parsed.diagnostics);
    return { ok: false, diagnostics: out };
  }
  const doc = clone(parsed.doc);
  const state: GraphState = {
    seen: new Set([root]), docs: [], nodes: 0, bytes: 0,
  };
  walk(doc, root, 1, [root], state, reader, out);
  if (out.some(errorOf)) return { ok: false, diagnostics: out };
  return {
    ok: true,
    diagnostics: out,
    plan: { root, docs: state.docs, text: printDoc(doc) },
  };
}
