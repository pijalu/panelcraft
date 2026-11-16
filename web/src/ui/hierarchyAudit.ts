// SPDX-License-Identifier: GPL-3.0-only
// Workspace-wide hierarchy audit (IR v10, FILE-FORMAT.md §3.2): the findings the
// shell shows for the open file. Per-file rules live in the engine
// (`engine/model/hierarchy.ts`); what only a workspace can answer is added here —
// a child diagram claimed by two *different* files, which no single document can
// see.
import type { Diagnostic } from '../engine/format/diagnostics';
import { diag } from '../engine/format/diagnostics';
import { parsePDL } from '../engine/format/parser';
import { checkHierarchy, decomposers, resolveDrilldown } from '../engine/model/hierarchy';
import type { Doc } from '../engine/model/types';

/** One workspace file as the audit sees it: its path and raw text. */
export interface AuditFile {
  path: string;
  text: string;
}

/** Claims of a child path across the workspace, in file order. */
interface Claim {
  file: string;
  objectId: string;
  line: number;
  col: number;
}

const parseFile = (file: AuditFile): Doc | null => parsePDL(file.text).doc;

/** Every (child path → claimants) pair the workspace declares. */
function collectClaims(files: readonly AuditFile[], parsed: Map<string, Doc>): Map<string, Claim[]> {
  const claims = new Map<string, Claim[]>();
  for (const file of files) {
    const doc = parsed.get(file.path);
    if (doc === undefined) continue;
    for (const obj of decomposers(doc)) {
      const target = resolveDrilldown(file.path, obj.drilldown?.path ?? '');
      if (!target.ok) continue;
      const list = claims.get(target.path) ?? [];
      list.push({ file: file.path, objectId: obj.id, line: obj.pos.line, col: obj.pos.col });
      claims.set(target.path, list);
    }
  }
  return claims;
}

/**
 * Findings for the open file: the engine's own hierarchy rules (P211–P218) plus
 * a child claimed by a second file. `activePath` absent or unparseable = no
 * findings (nothing to show, and the code view already reports the parse error).
 */
export function auditHierarchy(
  files: readonly AuditFile[],
  activePath: string | null,
): Diagnostic[] {
  if (activePath === null) return [];
  const parsed = new Map<string, Doc>();
  for (const file of files) {
    const doc = parseFile(file);
    if (doc !== null) parsed.set(file.path, doc);
  }
  const active = parsed.get(activePath);
  if (active === undefined) return [];
  const read = (path: string): string | null =>
    files.find((f) => f.path === path)?.text ?? null;
  const out: Diagnostic[] = [];
  checkHierarchy(active, activePath, read, out);
  addCrossFileClaims(files, parsed, activePath, out);
  return out.sort((a, b) => a.line - b.line || a.col - b.col || (a.code < b.code ? -1 : 1));
}

/** A child claimed by this file and by another one is a duplicate (`P211`). */
function addCrossFileClaims(
  files: readonly AuditFile[],
  parsed: Map<string, Doc>,
  activePath: string,
  out: Diagnostic[],
): void {
  for (const [child, claims] of collectClaims(files, parsed)) {
    const own = claims.filter((c) => c.file === activePath);
    const others = claims.filter((c) => c.file !== activePath);
    if (own.length === 0 || others.length === 0) continue;
    const mine = own[0];
    if (mine === undefined) continue;
    const rival = others[0];
    if (rival === undefined) continue;
    out.push(diag(
      'P211',
      `"${child}" is also claimed by "${rival.objectId}" in ${rival.file}`
        + ' — one parent per child diagram',
      mine.line,
      mine.col,
    ));
  }
}
