// SPDX-License-Identifier: GPL-3.0-only
// Mermaid C4 import converter (M1-WP6) — FILE-FORMAT §8 C4 subset:
// Person*/System*/Container*/Component* elements (incl. _Ext/_Db/_Queue),
// Rel/Rel_Back/BiRel/RelIndex links (tech → link comment `technology: …`),
// boundaries → groups; Show*/Update*/Lay_*/skinparam ignored with info M100.
// Unknown lines warn M200 — never silent (FR-M5).
import { diag } from './diagnostics';
import { IR_VERSION, type Doc, type Obj } from '../model/types';
import { M, newCtx, findObj, attachToGroup, type MermaidResult, type ConvertCtx } from './mermaid';

interface Arg {
  text: string;
  quoted: boolean;
}

/** Comma-split respecting double-quoted strings; returns trimmed args. */
const splitArgs = (s: string): Arg[] => {
  const out: Arg[] = [];
  let cur = '';
  let quoted = false;
  let inStr = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (inStr) {
      if (ch === '\\' && s[i + 1] === '"') { cur += '"'; i += 1; continue; }
      if (ch === '"') { inStr = false; continue; }
      cur += ch;
      continue;
    }
    if (ch === '"') { inStr = true; quoted = true; continue; }
    if (ch === ',') { out.push({ text: cur.trim(), quoted }); cur = ''; quoted = false; continue; }
    cur += ch;
  }
  if (cur.trim() !== '' || quoted) out.push({ text: cur.trim(), quoted });
  return out;
};

interface ElementSpec {
  kind: Obj['kind'];
  ext: boolean;
  tech: boolean; // family carries (id, name, tech, desc) — else (id, name, desc)
}

const ELEMENTS: Record<string, ElementSpec> = {
  Person: { kind: 'person', ext: false, tech: false },
  Person_Ext: { kind: 'person', ext: true, tech: false },
  System: { kind: 'system', ext: false, tech: false },
  System_Ext: { kind: 'system_ext', ext: true, tech: false },
  SystemDb: { kind: 'datastore', ext: false, tech: false },
  SystemQueue: { kind: 'queue', ext: false, tech: false },
  System_ExtDb: { kind: 'datastore', ext: true, tech: false },
  System_ExtQueue: { kind: 'queue', ext: true, tech: false },
  Container: { kind: 'container', ext: false, tech: true },
  ContainerDb: { kind: 'datastore', ext: false, tech: true },
  ContainerQueue: { kind: 'queue', ext: false, tech: true },
  Container_Ext: { kind: 'container', ext: true, tech: true },
  Container_ExtDb: { kind: 'datastore', ext: true, tech: true },
  Container_ExtQueue: { kind: 'queue', ext: true, tech: true },
  Component: { kind: 'component', ext: false, tech: true },
  ComponentDb: { kind: 'datastore', ext: false, tech: true },
  ComponentQueue: { kind: 'queue', ext: false, tech: true },
  Component_Ext: { kind: 'component', ext: true, tech: true },
};

const RELS = new Set(['Rel', 'Rel_Back', 'RelIndex', 'RelIndex_Back', 'BiRel', 'BiRel_Index']);

const BOUNDARIES = new Set([
  'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary', 'Component_Boundary',
  'Deployment_Node', 'Node',
]);

const LEVELS: Record<string, NonNullable<Doc['level']>> = {
  C4Context: 'context', C4Container: 'container', C4Component: 'component',
  C4Dynamic: 'container', C4Deployment: 'deployment',
};

const IGNORED_RE = /^(Show|Update|Lay_|skinparam|autonumber|Set|style|AddProperty|Cad)(?=[\s(]|$|[A-Z_])/;

const CALL_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(\{)?\s*$/;

const clean = (t: string): string => t.trim();

const addObj = (ctx: ConvertCtx, obj: Obj): void => {
  ctx.objects.push(obj);
  attachToGroup(ctx, obj.id);
};

const elementFields = (spec: ElementSpec, args: Arg[]): Partial<Obj> => {
  const tech = spec.tech ? args[2]?.text : undefined;
  const desc = (spec.tech ? args[3] : args[2])?.text;
  return {
    name: args[1]?.text || undefined,
    description: desc === undefined || desc === '' ? undefined : desc,
    technology: tech === undefined || tech === '' ? undefined : tech,
    tags: spec.ext ? ['external'] : undefined,
  };
};

const parseElement = (ctx: ConvertCtx, fam: string, args: Arg[], lineNo: number): void => {
  const spec = ELEMENTS[fam]!;
  const id = args[0]?.text ?? '';
  if (id === '') {
    ctx.diags.push(diag(M.unsupported, `${fam}: missing element id`, lineNo, 1, 'warning'));
    return;
  }
  if (findObj(ctx, id) !== undefined) return; // first definition wins
  addObj(ctx, { kind: spec.kind, id, ...elementFields(spec, args), pos: { line: lineNo, col: 1 } });
};

const parseBoundary = (ctx: ConvertCtx, args: Arg[], lineNo: number): void => {
  const id = args[0]?.text ?? '';
  if (id === '') {
    ctx.diags.push(diag(M.unsupported, 'boundary: missing id', lineNo, 1, 'warning'));
    return;
  }
  const name = args[1]?.text || undefined;
  ctx.groupIds.add(id);
  addObj(ctx, { kind: 'group', id, name, contains: [], pos: { line: lineNo, col: 1 } });
  ctx.groupStack.push({ id });
};

const argText = (args: Arg[], n: number): string | undefined => args[n]?.text;

const relEnds = (fam: string, args: Arg[]): { a: string; b: string; label?: string; tech?: string } => {
  const rest = fam.includes('Index') && args[0] !== undefined && !args[0].quoted ? args.slice(1) : args;
  const back = fam.endsWith('_Back');
  return {
    a: (back ? argText(rest, 1) : argText(rest, 0)) ?? '',
    b: (back ? argText(rest, 0) : argText(rest, 1)) ?? '',
    label: argText(rest, 2) || undefined,
    tech: argText(rest, 3) || undefined,
  };
};

const parseRel = (ctx: ConvertCtx, fam: string, args: Arg[], lineNo: number): void => {
  const { a, b, label, tech } = relEnds(fam, args);
  if (a === '' || b === '') {
    ctx.diags.push(diag(M.unsupported, `${fam}: missing endpoint`, lineNo, 1, 'warning'));
    return;
  }
  const comments = tech === undefined || tech === '' ? undefined : [`technology: ${tech}`];
  ctx.links.push({
    from: a, to: b, id: undefined, type: undefined, label,
    bidir: fam.startsWith('BiRel') ? true : undefined,
    comments,
    pos: { line: lineNo, col: 1 },
  });
};

const c4Call = (ctx: ConvertCtx, fam: string, args: Arg[], lineNo: number): boolean => {
  if (BOUNDARIES.has(fam)) {
    parseBoundary(ctx, args, lineNo);
    return true;
  }
  if (ELEMENTS[fam] !== undefined) {
    parseElement(ctx, fam, args, lineNo);
    return true;
  }
  if (RELS.has(fam)) {
    parseRel(ctx, fam, args, lineNo);
    return true;
  }
  return false;
};

const headToken = (line: string): string => line.split(/\s+|\(/)[0] ?? '';

type C4State = { level: NonNullable<Doc['level']>; title?: string };

/** Handle C4 header directives (level + title) and boundary-end lines.
 * Returns true when the line was consumed. */
const handleHeader = (ctx: ConvertCtx, st: C4State, line: string): boolean => {
  const head = /^(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/.exec(line);
  if (head) {
    st.level = LEVELS[head[1] ?? ''] ?? 'container';
    return true;
  }
  const title = /^title\s+(.+)$/.exec(line);
  if (title) {
    st.title = clean(title[1] ?? '').replace(/^"(.*)"$/, '$1');
    return true;
  }
  if (/^(end|EndBoundary|})\s*$/.test(line)) {
    ctx.groupStack.pop();
    return true;
  }
  return false;
};

const c4Line = (ctx: ConvertCtx, st: C4State, raw: string, lineNo: number): void => {
  const line = raw.trim();
  if (line === '' || line.startsWith('%%')) return;
  if (handleHeader(ctx, st, line)) return;
  if (IGNORED_RE.test(line)) {
    ctx.diags.push(diag(M.ignored, `C4 directive ignored: ${headToken(line)}`, lineNo, 1, 'info'));
    return;
  }
  const call = CALL_RE.exec(line);
  if (!call) {
    ctx.diags.push(diag(M.unsupported, `unrecognized line skipped: ${line}`, lineNo, 1, 'warning'));
    return;
  }
  if (!c4Call(ctx, call[1]!, splitArgs(call[2] ?? ''), lineNo)) {
    ctx.diags.push(diag(M.unsupported, `unknown C4 statement "${call[1]}" skipped`, lineNo, 1, 'warning'));
  }
};

/** Convert mermaid C4 text (C4Context/C4Container/C4Component/C4Dynamic/
 * C4Deployment subset) to a PDL Doc. */
export function fromC4(src: string): MermaidResult {
  const ctx = newCtx();
  const st = { level: 'container' as NonNullable<Doc['level']>, title: undefined as string | undefined };
  const lines = src.split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    c4Line(ctx, st, lines[n]!, n + 1);
  }
  const doc: Doc = {
    irVersion: IR_VERSION,
    formatVersion: '1.0',
    title: st.title,
    level: st.level,
    icons: [],
    imports: [],
    objects: ctx.objects,
    links: ctx.links,
    flows: [],
    views: [],
    styles: [],
  };
  return { doc, diagnostics: ctx.diags };
}

/** Every string the C4 export can drop (asserted by the mermaid matrix, F-21). */
export const C4_DROP_CATALOGUE = [
  'groups (no C4 boundary element)',
  'notes (no C4 annotation element)',
  'flows',
  'views (positions/layout)',
  'imports (flattened)',
  'link style beyond a label',
] as const;

export interface C4ExportResult {
  text: string;
  dropped: string[];
}

const C4_ELEMENT: Record<string, string> = {
  person: 'Person',
  system: 'System',
  system_ext: 'System_Ext',
  container: 'System',
  component: 'System',
  datastore: 'SystemDb',
  queue: 'SystemQueue',
};

const c4Id = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, '_');
const c4Label = (text: string): string => `"${text.replace(/"/g, '&quot;')}"`;

/**
 * PDL → mermaid `C4Context` (F-21). Declared lossy: groups/notes/flows/views and
 * link styling have no C4 counterpart and are reported in `dropped`.
 */
export function docToC4(doc: Doc): C4ExportResult {
  const lines: string[] = ['C4Context'];
  const dropped: string[] = [];
  const drop = (reason: (typeof C4_DROP_CATALOGUE)[number]): void => {
    if (!dropped.includes(reason)) dropped.push(reason);
  };
  if (doc.title !== undefined) lines.push(`  title ${c4Label(doc.title)}`);
  for (const o of doc.objects) c4Object(o, lines, drop);
  for (const l of doc.links) c4Link(l, lines, drop);
  if (doc.flows.length > 0) drop('flows');
  if (doc.views.length > 0) drop('views (positions/layout)');
  if (doc.imports.length > 0) drop('imports (flattened)');
  return { text: `${lines.join('\n')}\n`, dropped };
}

/** One C4 element line, or a declared drop for kinds C4 cannot express. */
function c4Object(
  o: Doc['objects'][number],
  lines: string[],
  drop: (reason: (typeof C4_DROP_CATALOGUE)[number]) => void,
): void {
  if (o.kind === 'group') {
    drop('groups (no C4 boundary element)');
    return;
  }
  if (o.kind === 'note') {
    drop('notes (no C4 annotation element)');
    return;
  }
  const el = C4_ELEMENT[o.kind] ?? 'System';
  lines.push(`  ${el}(${c4Id(o.id)}, ${c4Label(o.name ?? o.id)})`);
}

/** One `Rel(...)` line; link styling has no C4 counterpart. */
function c4Link(
  l: Doc['links'][number],
  lines: string[],
  drop: (reason: (typeof C4_DROP_CATALOGUE)[number]) => void,
): void {
  const label = l.label ?? l.type ?? '';
  lines.push(`  Rel(${c4Id(l.from)}, ${c4Id(l.to)}, ${c4Label(label)})`);
  const styled = l.style;
  if (styled && (styled.head || styled.tail || styled.line || styled.width || styled.dashed)) {
    drop('link style beyond a label');
  }
}
