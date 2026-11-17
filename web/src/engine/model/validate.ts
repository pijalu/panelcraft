// SPDX-License-Identifier: GPL-3.0-only
// Semantic validation pass (M1-WP4) — FILE-FORMAT §10 rules P100–P204 plus
// P205 (unknown block attribute, §12; recorded as errata D-M1-18). Pure over
// the Doc: import-graph IO (exists/escape/cycle traversal) is injected via
// ImportSource so the CLI supplies fs at WP9 and tests supply maps.
import type { Diagnostic } from '../format/diagnostics';
import { diag } from '../format/diagnostics';
import {
  ICON_MAX_BYTES, ICON_MAX_COUNT, ICON_TOTAL_MAX_BYTES, decodeIconBase64, decodeIconSvg,
  svgIssues,
} from '../format/iconSvg';
import { BUILTIN_ICON_NAMES, isBuiltinIcon } from './icons';
import { checkHierarchy } from './hierarchy';
import type { Doc, FlowStep } from './types';

export interface ImportSource {
  /** Classify an import path written in `from`: ok (with resolved id),
   * escape (outside workspace → P103), missing (no such file → P200). */
  classify(from: string | undefined, path: string): ClassResult;
  /** Raw import paths declared by the (readable) file at `resolved`. */
  importsOf(resolved: string): string[];
  /** File text, or null when unknown. Used by the decomposition rules
   * (P212/P214/P216) which read the child diagram they point at. */
  read?(resolved: string): string | null;
}

export type ClassResult =
  | { kind: 'ok'; resolved: string }
  | { kind: 'escape' }
  | { kind: 'missing' };

export interface ValidateOpts {
  /** Resolved id of the file being validated (root of import traversal). */
  file?: string;
  /** Filesystem-backed import probe; omit to skip P102/P103/P200. */
  imports?: ImportSource;
}

/** Ids visible for reference resolution, by category. */
interface Ids {
  objects: Set<string>;
  aliases: Set<string>;
  groups: Set<string>;
  flows: Set<string>;
  links: Set<string>;
}

const collectIds = (doc: Doc): Ids => ({
  objects: new Set(doc.objects.map((o) => o.id)),
  aliases: new Set(doc.imports.map((i) => i.alias)),
  groups: new Set(doc.objects.filter((o) => o.kind === 'group').map((o) => o.id)),
  flows: new Set(doc.flows.flatMap((f) => (f.id === undefined ? [] : [f.id]))),
  links: new Set(doc.links.flatMap((l) => (l.id === undefined ? [] : [l.id]))),
});

// --- P100 ------------------------------------------------------------------

const checkDupIds = (doc: Doc, out: Diagnostic[]): void => {
  const dup = (label: string, xs: { id?: string; pos: { line: number; col: number } }[]): void => {
    const seen = new Set<string>();
    for (const x of xs) {
      if (x.id === undefined) continue;
      if (seen.has(x.id)) out.push(diag('P100', `duplicate ${label} id "${x.id}"`, x.pos.line, x.pos.col));
      seen.add(x.id);
    }
  };
  dup('object', doc.objects);
  dup('flow', doc.flows);
};

/** undirected link pairs "a|b" (both directions) for P104 pair matching. */
const linkPairs = (doc: Doc): Set<string> => {
  const s = new Set<string>();
  for (const l of doc.links) {
    s.add(`${l.from}|${l.to}`);
    s.add(`${l.to}|${l.from}`);
  }
  return s;
};

/** An endpoint resolves to a local object, an alias, or `alias.object` (FR-I2). */
const endpointOk = (id: string, ids: Ids): boolean => {
  if (ids.objects.has(id) || ids.aliases.has(id)) return true;
  const dot = id.indexOf('.');
  return dot > 0 && ids.aliases.has(id.slice(0, dot));
};

// --- P101 + P104 (flow steps) ----------------------------------------------

const checkMsgStep = (
  s: { from: string; to: string; linkRef?: string; pos: { line: number; col: number } },
  ids: Ids,
  pairs: Set<string>,
  out: Diagnostic[],
): void => {
  for (const end of [s.from, s.to]) {
    if (!endpointOk(end, ids)) {
      out.push(diag('P101', `endpoint "${end}" resolves to nothing`, s.pos.line, s.pos.col));
    }
  }
  if (s.linkRef !== undefined) {
    if (!ids.links.has(s.linkRef)) {
      out.push(diag('P104', `msg step references link "${s.linkRef}" which does not exist`, s.pos.line, s.pos.col));
    }
    return;
  }
  if (!pairs.has(`${s.from}|${s.to}`)) {
    out.push(diag('P104', `no link between "${s.from}" and "${s.to}" (draw one or use \`as\`)`, s.pos.line, s.pos.col));
  }
};

// --- P105/P106/P205 (objects) ----------------------------------------------

const checkObjects = (doc: Doc, ids: Ids, out: Diagnostic[]): void => {
  for (const o of doc.objects) {
    for (const c of o.contains ?? []) {
      if (!ids.objects.has(c)) {
        out.push(diag('P105', `${o.kind} "${o.id}" contains unknown id "${c}"`, o.pos.line, o.pos.col));
      } else if (o.kind === 'group' && ids.groups.has(c)) {
        out.push(diag('P105', `group "${o.id}" contains nested group "${c}" (v1: flat groups)`, o.pos.line, o.pos.col));
      }
    }
    if (o.attach !== undefined && !endpointOk(o.attach, ids)) {
      out.push(diag('P106', `note/object "${o.id}" attaches to unknown id "${o.attach}"`, o.pos.line, o.pos.col));
    }
    for (const a of o.attributes ?? []) {
      out.push(diag('P205', `unknown attribute "${a.raw}" kept verbatim`, a.pos.line, a.pos.col, 'warning'));
    }
  }
};

// --- flow step walk (P101 endpoints, P104 pair, P205-free) ------------------

const isVisualStep = (s: FlowStep): boolean =>
  s.type === 'msg' || s.type === 'process' || s.type === 'alt' || s.type === 'par' || s.type === 'goto';

const checkStep = (s: FlowStep, ids: Ids, pairs: Set<string>, out: Diagnostic[]): void => {
  if (s.type === 'msg') {
    checkMsgStep(s, ids, pairs, out);
    return;
  }
  if (s.type === 'process') {
    if (!endpointOk(s.target, ids)) {
      out.push(diag('P101', `process target "${s.target}" resolves to nothing`, s.pos.line, s.pos.col));
    }
    return;
  }
  if (s.type === 'alt') {
    for (const b of s.branches) for (const st of b.steps) checkStep(st, ids, pairs, out);
    return;
  }
  if (s.type === 'par') {
    for (const lane of s.lanes) for (const st of lane) checkStep(st, ids, pairs, out);
  }
};

const checkFlowSteps = (doc: Doc, ids: Ids, out: Diagnostic[]): void => {
  const pairs = linkPairs(doc);
  for (const l of doc.links) {
    if (!endpointOk(l.from, ids) || !endpointOk(l.to, ids)) {
      out.push(diag('P101', `link "${l.from}" -> "${l.to}" resolves to nothing`, l.pos.line, l.pos.col));
    }
    for (const a of l.attributes ?? []) {
      out.push(diag('P205', `unknown attribute "${a.raw}" kept verbatim`, a.pos.line, a.pos.col, 'warning'));
    }
  }
  for (const f of doc.flows) for (const s of f.steps) checkStep(s, ids, pairs, out);
};

// --- P102/P103/P200 (import traversal, IO injected) -------------------------

const findCycle = (src: ImportSource, resolved: string, stack: Set<string>): string | null => {
  if (stack.has(resolved)) return resolved;
  stack.add(resolved);
  for (const path of src.importsOf(resolved)) {
    const c = src.classify(resolved, path);
    if (c.kind !== 'ok') continue;
    const hit = findCycle(src, c.resolved, stack);
    if (hit !== null) return hit;
  }
  stack.delete(resolved);
  return null;
};

const checkImports = (doc: Doc, file: string | undefined, src: ImportSource, out: Diagnostic[]): void => {
  const stack = new Set<string>(file !== undefined ? [file] : []);
  for (const imp of doc.imports) {
    const c = src.classify(file, imp.path);
    if (c.kind === 'escape') {
      out.push(diag('P103', `import path escapes the workspace: "${imp.path}"`, imp.pos.line, imp.pos.col));
      continue;
    }
    if (c.kind === 'missing') {
      out.push(diag('P200', `imported file not found: "${imp.path}"`, imp.pos.line, imp.pos.col, 'warning'));
      continue;
    }
    if (findCycle(src, c.resolved, stack) !== null) {
      out.push(diag('P102', `import cycle through "${imp.path}"`, imp.pos.line, imp.pos.col));
    }
  }
};

// --- P206–P210 (document icons, IR v9 §3.1) ---------------------------------

/** Handles a document may reference: built-ins plus its own declarations. */
export function iconHandles(doc: Doc): Set<string> {
  const s = new Set<string>(BUILTIN_ICON_NAMES);
  for (const ic of doc.icons) s.add(ic.id);
  return s;
}

/** Resolve the SVG source of a declared icon, or `null` when unusable. */
export function iconSource(decl: { data: string }): string | null {
  return decodeIconSvg(decl.data);
}

const checkIcons = (doc: Doc, out: Diagnostic[]): void => {
  const seen = new Set<string>();
  let total = 0;
  for (const ic of doc.icons) {
    if (seen.has(ic.id)) {
      out.push(diag('P206', `duplicate icon handle "${ic.id}"`, ic.pos.line, ic.pos.col));
      continue;
    }
    seen.add(ic.id);
    // Built-in handles are a reserved namespace: a project icon that shadowed
    // one would make the same `icon name` mean different things per file with
    // no visible cue, so the clash is an error and the author renames it.
    if (isBuiltinIcon(ic.id)) {
      out.push(diag(
        'P207',
        `icon handle "${ic.id}" collides with the built-in icon of the same name`,
        ic.pos.line,
        ic.pos.col,
      ));
    }
    const bytes = decodeIconBase64(ic.data)?.length ?? 0;
    total += bytes;
    if (bytes > ICON_MAX_BYTES) {
      out.push(diag(
        'P208',
        `icon "${ic.id}" payload is ${bytes} bytes (limit ${ICON_MAX_BYTES})`,
        ic.pos.line,
        ic.pos.col,
      ));
    }
    const svg = iconSource(ic);
    if (svg === null) {
      out.push(diag('P209', `icon "${ic.id}" payload is not valid UTF-8`, ic.pos.line, ic.pos.col));
    } else {
      const issues = svgIssues(svg);
      if (issues.length > 0) {
        out.push(diag(
          'P209',
          `icon "${ic.id}" has unsafe or unsupported SVG content: ${issues.join(', ')}`,
          ic.pos.line,
          ic.pos.col,
        ));
      }
    }
  }
  if (doc.icons.length > ICON_MAX_COUNT) {
    out.push(diag('P208', `document declares ${doc.icons.length} icons (limit ${ICON_MAX_COUNT})`, 1, 1));
  }
  if (total > ICON_TOTAL_MAX_BYTES) {
    out.push(diag('P208', `document icon payloads total ${total} bytes (limit ${ICON_TOTAL_MAX_BYTES})`, 1, 1));
  }
};

const checkIconRefs = (doc: Doc, out: Diagnostic[]): void => {
  const handles = iconHandles(doc);
  const unknown = (name: string, line: number, col: number): void => {
    if (!handles.has(name)) {
      out.push(diag('P210', `unknown icon "${name}" (declare it or use a built-in)`, line, col, 'warning'));
    }
  };
  for (const o of doc.objects) {
    if (o.icon !== undefined) unknown(o.icon, o.pos.line, o.pos.col);
    if (o.style?.icon !== undefined) unknown(o.style.icon, o.pos.line, o.pos.col);
  }
};

// --- P201 / P202 / P203 / P204 ----------------------------------------------

const checkOrphans = (doc: Doc, ids: Ids, out: Diagnostic[]): void => {
  const referenced = new Set<string>();
  for (const l of doc.links) {
    referenced.add(l.from);
    referenced.add(l.to);
  }
  const step = (s: FlowStep): void => {
    if (s.type === 'msg') {
      referenced.add(s.from);
      referenced.add(s.to);
      return;
    }
    if (s.type === 'process') {
      referenced.add(s.target);
      return;
    }
    if (s.type === 'alt') for (const b of s.branches) for (const st of b.steps) step(st);
    if (s.type === 'par') for (const lane of s.lanes) for (const st of lane) step(st);
  };
  for (const f of doc.flows) for (const s of f.steps) step(s);
  for (const o of doc.objects) {
    if (ids.aliases.has(o.id)) continue;
    if (!referenced.has(o.id)) {
      out.push(diag('P201', `"${o.id}" is orphaned (no links, no flow references)`, o.pos.line, o.pos.col, 'warning'));
    }
  }
};

const checkFlowsEmpty = (doc: Doc, out: Diagnostic[]): void => {
  for (const f of doc.flows) {
    if (f.steps.length === 0) {
      out.push(diag('P202', `flow "${f.title ?? f.id ?? '?'}" has no steps`, f.pos.line, f.pos.col, 'warning'));
      continue;
    }
    if (!f.steps.some(isVisualStep)) {
      out.push(diag('P202', `flow "${f.title ?? f.id ?? '?'}" has no visual steps`, f.pos.line, f.pos.col, 'warning'));
    }
  }
};

const checkStyles = (doc: Doc, ids: Ids, out: Diagnostic[]): void => {
  for (const st of doc.styles) {
    if (!endpointOk(st.target, ids)) {
      out.push(diag('P203', `style targets non-existent id "${st.target}"`, st.pos.line, st.pos.col, 'warning'));
    }
  }
};

const checkOverlaps = (doc: Doc, out: Diagnostic[]): void => {
  const seen = new Map<string, string>();
  for (const p of doc.layout?.positions ?? []) {
    const key = `${p.x},${p.y}`;
    const first = seen.get(key);
    if (first !== undefined) {
      out.push(diag('P204', `position overlap at (${p.x}, ${p.y}): "${first}" and "${p.id}"`, doc.layout!.pos.line, doc.layout!.pos.col, 'info'));
    } else {
      seen.set(key, p.id);
    }
  }
};

// --- entry ------------------------------------------------------------------

const byPosition = (a: Diagnostic, b: Diagnostic): number =>
  a.line - b.line || a.col - b.col || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/** Semantic pass over a parsed doc (§10). Deterministic: findings sorted by
 * line, col, code. Import rules P102/P103/P200 require opts.imports. */
export function validateDoc(doc: Doc, opts: ValidateOpts = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const ids = collectIds(doc);
  checkDupIds(doc, out);
  checkIcons(doc, out);
  checkIconRefs(doc, out);
  checkFlowSteps(doc, ids, out);
  if (opts.imports !== undefined) checkImports(doc, opts.file, opts.imports, out);
  checkHierarchy(doc, opts.file, opts.imports?.read?.bind(opts.imports), out);
  checkObjects(doc, ids, out);
  checkOrphans(doc, ids, out);
  checkFlowsEmpty(doc, out);
  checkStyles(doc, ids, out);
  checkOverlaps(doc, out);
  out.sort(byPosition);
  return out;
}
