// SPDX-License-Identifier: GPL-3.0-only
// Mermaid flowchart/graph import converter (M1-WP5) — FILE-FORMAT §8:
// shape→kind table, subgraphs→groups (children → contains), chained and `&`
// edges expanded to pairs. Unsupported constructs warn M200 and are skipped —
// never silent (FR-M5). Converter codes: M100 info (ignored directive),
// M200 warning (unsupported/unknown line).
import { diag, type Diagnostic } from './diagnostics';
import { IR_VERSION, type Doc, type Flow, type FlowStep, type Link, type Obj, type StyleBlock } from '../model/types';

export const M = { ignored: 'M100', unsupported: 'M200' } as const;

export interface MermaidResult {
  doc: Doc;
  diagnostics: Diagnostic[];
}

/** Shared mutable conversion context (flowchart + C4). */
export interface ConvertCtx {
  objects: Obj[];
  links: Link[];
  diags: Diagnostic[];
  /** ids of groups in definition order (endpoint checks). */
  groupIds: Set<string>;
  /** open group stack; '' marks a skipped nested boundary. */
  groupStack: { id: string }[];
  /** classDef styles by class name (FR-M3 mapping) */
  classDefs: Map<string, StyleBlock>;
  /** import order of links (linkStyle indexes into it) */
  linkOrder: Link[];
}

export const newCtx = (): ConvertCtx => ({
  objects: [],
  links: [],
  diags: [],
  groupIds: new Set(),
  groupStack: [],
  classDefs: new Map(),
  linkOrder: [],
});

const cleanText = (t: string): string =>
  t.trim().replace(/^"(.*)"$/s, '$1').replace(/<br\s*\/?>/gi, ' ').replace(/&quot;/g, '"').trim();

interface NodeDef {
  id: string;
  kind: Obj['kind'];
  name?: string;
  end: number;
}

/** shape openers tried longest-first (stadium `( [` before rounded `(`). */
const SHAPE_RES: { re: RegExp; kind: Obj['kind'] }[] = [
  { re: /^\(\[\s*([^\]]*?)\s*\]\)/, kind: 'system_ext' },
  { re: /^\(\(\s*([^)]*?)\s*\)\)/, kind: 'person' },
  { re: /^\[\(\s*([^)]*?)\s*\)\]/, kind: 'datastore' },
  { re: /^\(\s*([^)]*?)\s*\)/, kind: 'component' },
  { re: /^\[\s*([^\]]*?)\s*\]/, kind: 'container' },
  { re: /^\{\s*([^}]*?)\s*\}/, kind: 'note' },
];

/** Read one node token at `i`: `id`, optionally followed by a shape. */
export const readNode = (s: string, i: number): NodeDef | null => {
  const m = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(s.slice(i));
  if (!m) return null;
  const rest = s.slice(i + m[0].length);
  if (rest[0] === '>') {
    const asym = /^>\s*([^\]]*?)\s*\]/.exec(rest);
    if (asym) return { id: m[0], kind: 'queue', name: cleanText(asym[1] ?? ''), end: i + m[0].length + asym[0].length };
  }
  for (const { re, kind } of SHAPE_RES) {
    const sm = re.exec(rest);
    if (sm) return { id: m[0], kind, name: cleanText(sm[1] ?? ''), end: i + m[0].length + sm[0].length };
  }
  return { id: m[0], kind: 'container', end: i + m[0].length };
};

/** First object with `id`, if any. */
export const findObj = (ctx: ConvertCtx, id: string): Obj | undefined =>
  ctx.objects.find((o) => o.id === id);

/** Innermost real (non-skipped) open group id, if any. */
const lastRealGroup = (ctx: ConvertCtx): string | undefined => {
  for (let k = ctx.groupStack.length - 1; k >= 0; k -= 1) {
    const id = ctx.groupStack[k]!.id;
    if (id !== '') return id;
  }
  return undefined;
};

/** Add `id` to the innermost real open group's contains (dedup). */
export const attachToGroup = (ctx: ConvertCtx, id: string): void => {
  const gid = lastRealGroup(ctx);
  if (gid === undefined) return;
  const g = findObj(ctx, gid);
  if (g !== undefined && !(g.contains ?? []).includes(id)) {
    g.contains = [...(g.contains ?? []), id];
  }
};

/** Ensure `id` exists (implicit containers); first definition wins. */
const ensureNode = (
  ctx: ConvertCtx,
  def: { id: string; kind: Obj['kind']; name?: string },
  line: number,
): Obj => {
  const existing = findObj(ctx, def.id);
  if (existing !== undefined) return existing;
  const obj: Obj = {
    kind: def.kind, id: def.id, name: def.name || undefined,
    pos: { line, col: 1 },
  };
  ctx.objects.push(obj);
  attachToGroup(ctx, def.id);
  return obj;
};

// --- arrows ------------------------------------------------------------------

interface Arrow {
  kind: 'plain' | 'dotted' | 'thick' | 'undir';
  label?: string;
  len: number;
}

/** Arrow forms at `i`; labeled variants before plain (lazy labels). */
const arrowAt = (s: string, i: number): Arrow | null => {
  const tries: { re: RegExp; kind: Arrow['kind'] }[] = [
    { re: /^-->|^->/, kind: 'plain' },
    { re: /^--(.+?)-->/, kind: 'plain' },
    { re: /^-\.+->/, kind: 'dotted' },
    { re: /^-\.+?(.*?)\.+->/, kind: 'dotted' },
    { re: /^={2,}>/, kind: 'thick' },
    { re: /^==(.+?)==+>/, kind: 'thick' },
    { re: /^-{3,}(?![>.])/, kind: 'undir' },
  ];
  for (const { re, kind } of tries) {
    const m = re.exec(s.slice(i));
    if (m) return { kind, label: m[1] === undefined ? undefined : cleanText(m[1]), len: m[0].length };
  }
  return null;
};

const pipeLabel = (s: string, i: number): { label?: string; len: number } => {
  const m = /^\s*\|\s*([^|]*?)\s*\|/.exec(s.slice(i));
  return m ? { label: cleanText(m[1] ?? ''), len: m[0].length } : { len: 0 };
};

const readEndpoints = (ctx: ConvertCtx, s: string, i: number, line: number): { ids: string[]; end: number } | null => {
  const ids: string[] = [];
  let j = i;
  for (;;) {
    while (s[j] === ' ' || s[j] === '\t') j += 1;
    const node = readNode(s, j);
    if (!node) return ids.length > 0 ? { ids, end: j } : null;
    j = node.end;
    if (ctx.groupIds.has(node.id)) {
      ctx.diags.push(diag(M.unsupported, 'subgraph cannot be an edge endpoint', line, 1, 'warning'));
    } else {
      ids.push(ensureNode(ctx, node, line).id);
    }
    const sep = /^\s*&\s*/.exec(s.slice(j));
    if (!sep) return { ids, end: j };
    j += sep[0].length;
  }
};

const addLink = (
  ctx: ConvertCtx,
  from: string,
  to: string,
  label: string | undefined,
  arrow: Arrow,
  line: number,
): void => {
  const link: Link = {
    from,
    to,
    id: undefined,
    type: arrow.kind === 'dotted' ? 'dotted' : arrow.kind === 'thick' ? 'thick' : undefined,
    label: label || undefined,
    bidir: undefined,
    pos: { line, col: 1 },
  };
  ctx.links.push(link);
  ctx.linkOrder.push(link); // linkStyle indexes this order (FR-M3)
};

/** Parse an edge statement; true = line consumed. False = not an edge line
 * or malformed tail (partial emissions rolled back). */
const parseEdgeLine = (ctx: ConvertCtx, line: string, lineNo: number): boolean => {
  const linkMark = ctx.links.length;
  let arrows = 0;
  let left = readEndpoints(ctx, line, 0, lineNo);
  if (!left) return false;
  let j = left.end;
  for (;;) {
    while (line[j] === ' ' || line[j] === '\t') j += 1;
    const arrow = arrowAt(line, j);
    if (!arrow) return arrows > 0;
    j += arrow.len;
    arrows += 1;
    const pipe = pipeLabel(line, j);
    j += pipe.len;
    const right = readEndpoints(ctx, line, j, lineNo);
    if (!right || right.ids.length === 0) {
      ctx.links.length = linkMark;
      return false;
    }
    const label = pipe.label ?? arrow.label;
    for (const from of left.ids) {
      for (const to of right.ids) addLink(ctx, from, to, label, arrow, lineNo);
    }
    left = right;
    j = left.end;
  }
};

const SUBGRAPH_RE = /^subgraph\s+([A-Za-z_][A-Za-z0-9_-]*)?\s*(?:\[\s*([^\]]*?)\s*\]|\(\s*([^)]*?)\s*\))?\s*$/;

const parseSubgraph = (ctx: ConvertCtx, line: string, lineNo: number): void => {
  if (ctx.groupStack.length > 0) {
    ctx.diags.push(diag(M.unsupported, 'nested subgraphs are not supported; children stay in the outer group', lineNo, 1, 'warning'));
    ctx.groupStack.push({ id: '' });
    return;
  }
  const m = SUBGRAPH_RE.exec(line);
  if (!m) {
    ctx.diags.push(diag(M.unsupported, `unsupported subgraph form: ${line}`, lineNo, 1, 'warning'));
    ctx.groupStack.push({ id: '' });
    return;
  }
  const title = cleanText(m[2] ?? m[3] ?? '');
  const id = m[1] ?? (title.replace(/\s+/g, '_').toLowerCase() || 'group');
  ctx.groupIds.add(id);
  ctx.objects.push({ kind: 'group', id, name: title || undefined, contains: [], pos: { line: lineNo, col: 1 } });
  ctx.groupStack.push({ id });
};

const parseBareNodes = (ctx: ConvertCtx, line: string, lineNo: number): boolean => {
  let j = 0;
  let count = 0;
  for (;;) {
    while (line[j] === ' ' || line[j] === '\t') j += 1;
    const node = readNode(line, j);
    if (!node) return false;
    ensureNode(ctx, node, lineNo);
    count += 1;
    j = node.end;
    const sep = /^\s*&/.exec(line.slice(j));
    if (!sep) break;
    j += sep[0].length;
  }
  return count > 0 && j >= line.length;
};

const UNSUPPORTED_RE = /^(style|click|direction|accumulate|interpolate)\b/;
const CLASS_DEF_RE = /^classDef\s+([A-Za-z_][\w-]*)\s+(.+?)\s*;?$/;
const CLASS_APPLY_RE = /^class\s+([\w,\s-]+?)\s+([A-Za-z_][\w-]*(?:\s*,\s*[A-Za-z_][\w-]*)*)\s*;?$/;
const LINK_STYLE_RE = /^linkStyle\s+(\d+)\s+(.+?)\s*;?$/;

/** Parse a mermaid style attribute list (`fill:#f00,stroke:#333`). */
const parseStyleAttrs = (raw: string): StyleBlock => {
  const style: StyleBlock = {};
  for (const part of raw.split(',')) {
    const [key, value] = part.split(':').map((t) => t.trim());
    if (key === undefined || value === undefined) {
      if (value === undefined && key === 'stroke-dasharray') style.dashed = true;
      continue;
    }
    if (key === 'fill') style.fill = value;
    else if (key === 'stroke') style.stroke = value;
    else if (key === 'color') style.text = value;
    else if (key === 'stroke-dasharray') style.dashed = true;
  }
  return style;
};

/** `classDef` (define) and `class` (apply) — FR-M3 style mapping. */
const classLine = (ctx: ConvertCtx, line: string, lineNo: number): boolean => {
  const def = CLASS_DEF_RE.exec(line);
  if (def !== null) {
    ctx.classDefs.set(def[1]!, parseStyleAttrs(def[2]!));
    // colours have no PDL equivalent here — declared, never silent
    ctx.diags.push(
      diag(M.ignored, `classDef colours are not imported: ${def[1]}`, lineNo, 1, 'info'),
    );
    return true;
  }
  const apply = CLASS_APPLY_RE.exec(line);
  if (apply === null) return false;
  const classes = apply[2]!.split(',').map((t) => t.trim());
  for (const id of apply[1]!.split(',').map((t) => t.trim())) {
    const obj = ctx.objects.find((o) => o.id === id);
    if (obj === undefined) continue;
    // class names become tags (that is what the exporter encodes)
    obj.tags = [...new Set([...(obj.tags ?? []), ...classes])];
  }
  return true;
};

/** `linkStyle <index> stroke:#f00` — indexes the import-ordered link list. */
const linkStyleLine = (ctx: ConvertCtx, line: string, lineNo: number): boolean => {
  const m = LINK_STYLE_RE.exec(line);
  if (m === null) return false;
  const link = ctx.linkOrder[Number(m[1])];
  if (link === undefined) {
    ctx.diags.push(diag(M.unsupported, `linkStyle index ${m[1]} has no link`, lineNo, 1, 'warning'));
    return true;
  }
  link.style = { ...(link.style ?? {}), ...parseStyleAttrs(m[2]!) };
  return true;
};
const SUBGRAPH_START_RE = /^subgraph\b/;

/** true + handled when the line is a flowchart keyword directive. */
const flowKeyword = (ctx: ConvertCtx, line: string, lineNo: number): boolean => {
  if (classLine(ctx, line, lineNo)) return true;
  if (linkStyleLine(ctx, line, lineNo)) return true;
  if (UNSUPPORTED_RE.test(line)) {
    ctx.diags.push(diag(M.unsupported, `unsupported mermaid construct skipped: ${line.split(/\s+/)[0] ?? ''}`, lineNo, 1, 'warning'));
    return true;
  }
  if (line === 'end') {
    ctx.groupStack.pop();
    return true;
  }
  if (SUBGRAPH_START_RE.test(line)) {
    parseSubgraph(ctx, line, lineNo);
    return true;
  }
  return false;
};

const flowLine = (ctx: ConvertCtx, raw: string, lineNo: number): void => {
  const line = raw.trim();
  if (line === '' || line.startsWith('%%')) return;
  if (flowKeyword(ctx, line, lineNo)) return;
  const diagMark = ctx.diags.length;
  if (parseEdgeLine(ctx, line, lineNo)) return;
  const objMark = ctx.objects.length;
  if (!parseBareNodes(ctx, line, lineNo)) {
    const created = ctx.objects.splice(objMark);
    const gid = lastRealGroup(ctx);
    const g = gid === undefined ? undefined : findObj(ctx, gid);
    if (g !== undefined) g.contains = (g.contains ?? []).filter((c) => !created.some((o) => o.id === c));
    if (ctx.diags.length === diagMark) {
      ctx.diags.push(diag(M.unsupported, `unrecognized line skipped: ${line}`, lineNo, 1, 'warning'));
    }
  }
};

const DIRS: Record<string, NonNullable<Doc['direction']>> = { TD: 'TB', TB: 'TB', LR: 'LR', RL: 'RL', BT: 'BT' };
const HEADER_RE = /^(flowchart|graph)(?:\s+([A-Za-z]{1,2}))?\s*$/;

/** Direction from a flowchart/graph header line (undefined = none). */
const applyDir = (
  ctx: ConvertCtx,
  head: RegExpExecArray,
  current: Doc['direction'],
  lineNo: number,
): Doc['direction'] => {
  const token = head[2];
  const dir = token === undefined ? undefined : DIRS[token];
  if (token !== undefined && dir === undefined) {
    ctx.diags.push(diag(M.unsupported, `unsupported direction "${token}"`, lineNo, 1, 'warning'));
  }
  return dir ?? current;
};

const SEQ_HEADER = /^sequenceDiagram\b/;
const SEQ_PARTICIPANT = /^(participant|actor)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+(.+))?$/;
const SEQ_MSG = /^([A-Za-z_][A-Za-z0-9_]*)\s*(-->>|->>|-->|->)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/;

/**
 * `sequenceDiagram` → objects + one flow (FR-M3). Participants become person
 * objects (actor) or systems; each message becomes a `msg` step, and the
 * response arrows (`-->>`) keep their label. Blocks (loop/alt/note) are
 * unsupported and warn — never silent (FR-M5).
 */
export function fromSequence(src: string): MermaidResult {
  const ctx = newCtx();
  const steps: FlowStep[] = [];
  const lines = src.split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n]!.trim();
    const lineNo = n + 1;
    if (line === '' || line.startsWith('%%') || SEQ_HEADER.test(line)) continue;
    if (seqParticipant(ctx, line, lineNo)) continue;
    if (seqMessage(ctx, steps, line, lineNo)) continue;
    ctx.diags.push(
      diag(
        M.unsupported,
        `unsupported sequence construct skipped: ${line.split(/\s+/)[0] ?? ''}`,
        lineNo,
        1,
        'warning',
      ),
    );
  }
  const flows: Flow[] =
    steps.length === 0 ? [] : [{ title: 'Sequence', steps, pos: { line: 1, col: 1 } }];
  const doc: Doc = {
    irVersion: IR_VERSION,
    formatVersion: '1.0',
    level: 'container',
    imports: [],
    objects: ctx.objects,
    links: ctx.links,
    flows,
    views: [],
    styles: [],
  };
  return { doc, diagnostics: ctx.diags };
}

/** `participant|actor A as "Alice"` → an object (true when consumed). */
function seqParticipant(ctx: ConvertCtx, line: string, lineNo: number): boolean {
  const part = SEQ_PARTICIPANT.exec(line);
  if (part === null) return false;
  const id = part[2]!;
  if (!ctx.objects.some((o) => o.id === id)) {
    ctx.objects.push({
      kind: part[1] === 'actor' ? 'person' : 'system',
      id,
      name: part[3] ?? id,
      pos: { line: lineNo, col: 1 },
    });
  }
  return true;
}

/** `A->>B: label` → a msg step + the corresponding link (true when consumed). */
function seqMessage(ctx: ConvertCtx, steps: FlowStep[], line: string, lineNo: number): boolean {
  const msg = SEQ_MSG.exec(line);
  if (msg === null) return false;
  const [, from, arrow, to, label] = msg;
  const text = label!.trim();
  steps.push({
    type: 'msg',
    from: from!,
    to: to!,
    ...(text === '' ? {} : { label: text }),
    pos: { line: lineNo, col: 1 },
  });
  ctx.links.push({
    from: from!,
    to: to!,
    id: undefined,
    label: text || undefined,
    style: arrow!.startsWith('--') ? { dashed: true } : undefined,
    pos: { line: lineNo, col: 1 },
  });
  return true;
}

/** Convert mermaid `flowchart`/`graph` text to a PDL Doc (level container). */
export function fromMermaid(src: string): MermaidResult {
  if (src.split('\n').some((l) => SEQ_HEADER.test(l.trim()))) {
    return fromSequence(src); // FR-M3
  }
  const ctx = newCtx();
  let direction: Doc['direction'] = undefined;
  let inFrontmatter = false;
  const lines = src.split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n]!.trim();
    const lineNo = n + 1;
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false;
      else ctx.diags.push(diag(M.unsupported, `frontmatter line skipped: ${line}`, lineNo, 1, 'warning'));
      continue;
    }
    if (line === '---' && n === 0) {
      inFrontmatter = true;
      continue;
    }
    if (line === '' || line.startsWith('%%')) continue;
    const head = HEADER_RE.exec(line);
    if (head !== null) {
      direction = applyDir(ctx, head, direction, lineNo);
      continue;
    }
    flowLine(ctx, lines[n]!, lineNo);
  }
  const doc: Doc = {
    irVersion: IR_VERSION,
    formatVersion: '1.0',
    title: undefined,
    level: 'container',
    direction,
    imports: [],
    objects: ctx.objects,
    links: ctx.links,
    flows: [],
    views: [],
    styles: [],
  };
  return { doc, diagnostics: ctx.diags };
}
