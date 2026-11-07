// SPDX-License-Identifier: GPL-3.0-only
// Canonical printer (M1-WP3) — FILE-FORMAT §11: fixed section order, one
// attribute per line, 2-space indent, quotes on strings, link ids are data
// and always emitted (D-M1-16), blank line between sections, comments
// re-attached above their statement (D-M1-10/12).
import type {
  Branch, Comments, Doc, FlowStep, ImportStmt, Link, Obj, StyleBlock,
  StyleStmt,
} from '../model/types';

const INDENT = '  ';
const pad = (depth: number): string => INDENT.repeat(depth);

/** Quote a string literal with PDL escapes (`\` and `"` only, §1). */
export function quote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

class Printer {
  private out: string[] = [];

  add(line: string): void {
    this.out.push(line);
  }
  blank(): void {
    if (this.out.length > 0 && this.out[this.out.length - 1] !== '') this.out.push('');
  }
  comment(c: Comments | undefined, depth: number): void {
    if (!c) return;
    for (const line of c) this.out.push(pad(depth) + '# ' + line);
  }
  text(): string {
    return this.out.join('\n') + '\n';
  }
  /** Raw collected lines (used to decide whether a block has content). */
  lines(): string[] {
    return [...this.out];
  }
}

const styleLines = (sb: StyleBlock | undefined, depth: number, p: Printer): void => {
  if (sb === undefined) return;
  if (sb.fill) p.add(`${pad(depth)}fill ${sb.fill}`);
  if (sb.stroke) p.add(`${pad(depth)}stroke ${sb.stroke}`);
  if (sb.text) p.add(`${pad(depth)}text ${sb.text}`);
  if (sb.icon) p.add(`${pad(depth)}icon ${sb.icon}`);
  if (sb.shape) p.add(`${pad(depth)}shape ${sb.shape}`);
  if (sb.dashed) p.add(`${pad(depth)}dashed`);
  for (const r of sb.raw ?? []) p.add(`${pad(depth)}${r.raw}`);
};

const hasStyle = (sb: StyleBlock | undefined): boolean =>
  !!sb && (sb.fill !== undefined || sb.stroke !== undefined || sb.text !== undefined ||
    sb.icon !== undefined || sb.shape !== undefined || sb.dashed === true || (sb.raw?.length ?? 0) > 0);

/** Arrow text: optional type + direction (`->`, `<->`, `-requests->`, `<-r->`). */
const arrowFor = (l: Pick<Link, 'type' | 'bidir'>): string =>
  `${l.bidir ? '<' : ''}-${l.type ? l.type + '-' : ''}>`;

type StepPrinter = (s: FlowStep, depth: number, p: Printer) => void;

const printSimpleStep: StepPrinter = (s, depth, p) => {
  const t = s as { type: string; text: string };
  p.add(`${pad(depth)}${t.type} ${quote(t.text)}`);
};

const printProcessStep: StepPrinter = (s, depth, p) => {
  const pr = s as { target: string; text?: string };
  const body = pr.text === undefined ? `process ${pr.target}` : `process ${pr.target} ${quote(pr.text)}`;
  p.add(pad(depth) + body);
};

const printMsgStep: StepPrinter = (s, depth, p) => {
  const m = s as { from: string; to: string; label?: string; linkRef?: string; flip?: boolean };
  let line = `${m.from} -> ${m.to}`;
  if (m.label !== undefined) line += ` : ${quote(m.label)}`;
  if (m.linkRef !== undefined) line += ` as ${m.linkRef}`;
  if (m.flip === true) line += ' flip';
  p.add(pad(depth) + line);
};

const printGotoStep: StepPrinter = (s, depth, p) => {
  const g = s as { file?: string; flow: string; ret?: 'here' };
  const target = g.file === undefined ? g.flow : quote(`${g.file}#${g.flow}`);
  p.add(`${pad(depth)}goto ${target}${g.ret === 'here' ? ' return here' : ''}`);
};

const printAltStep: StepPrinter = (s, depth, p) => {
  const a = s as { label?: string; branches: Branch[] };
  p.add(`${pad(depth)}alt${a.label === undefined ? '' : ' ' + quote(a.label)} {`);
  for (const b of a.branches) {
    p.comment(b.comments, depth + 1);
    p.add(`${pad(depth + 1)}${quote(b.label)} {`);
    for (const st of b.steps) stepText(st, depth + 2, p);
    p.add(`${pad(depth + 1)}}`);
  }
  p.add(`${pad(depth)}}`);
};

const printParStep: StepPrinter = (s, depth, p) => {
  const pr = s as { label?: string; lanes: FlowStep[][] };
  p.add(`${pad(depth)}par${pr.label === undefined ? '' : ' ' + quote(pr.label)} {`);
  for (const lane of pr.lanes) {
    p.add(`${pad(depth + 1)}{`);
    for (const st of lane) stepText(st, depth + 2, p);
    p.add(`${pad(depth + 1)}}`);
  }
  p.add(`${pad(depth)}}`);
};

const STEP_PRINTERS: Record<FlowStep['type'], StepPrinter> = {
  intro: printSimpleStep,
  info: printSimpleStep,
  conclusion: printSimpleStep,
  process: printProcessStep,
  msg: printMsgStep,
  goto: printGotoStep,
  alt: printAltStep,
  par: printParStep,
};

const stepText: StepPrinter = (s, depth, p) => {
  p.comment(s.comments, depth);
  STEP_PRINTERS[s.type](s, depth, p);
};

const objectAttrLines = (o: Obj, p: Printer): void => {
  if (o.description !== undefined) p.add(`${INDENT}description ${quote(o.description)}`);
  if (o.technology !== undefined) p.add(`${INDENT}technology ${quote(o.technology)}`);
  if (o.tags?.length) p.add(`${INDENT}tag ${o.tags.join(' ')}`);
  for (const pr of o.properties ?? []) p.add(`${INDENT}property ${pr.key} ${quote(pr.value)}`);
  if (o.contains?.length) p.add(`${INDENT}contains ${o.contains.join(' ')}`);
  if (o.attach !== undefined) p.add(`${INDENT}attach ${o.attach}`);
  if (o.icon !== undefined) p.add(`${INDENT}icon ${o.icon}`);
  // F-13: explicit geometry, printed only when the document carries it
  if (o.size !== undefined) p.add(`${INDENT}size ${jsNum(o.size.w)} ${jsNum(o.size.h)}`);
};

/** Print a coordinate/size number the way the Go printer does (int when exact). */
export function jsNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(4)));
}

const printObject = (o: Obj, p: Printer): void => {
  p.comment(o.comments, 0);
  const name = o.name ?? o.id;
  const head = `${o.kind} ${o.id} ${quote(name)}`;
  // F-05: a block is emitted only when it has content — the grammar allows
  // omission (FILE-FORMAT §10/§11), and an unconditional `{ }` made every
  // canvas-origin rewrite touch every line (maximum echo diff).
  const body = new Printer();
  objectAttrLines(o, body);
  if (hasStyle(o.style)) {
    body.add(`${INDENT}style {`);
    styleLines(o.style, 2, body);
    body.add(`${INDENT}}`);
  }
  for (const r of o.attributes ?? []) body.add(`${INDENT}${r.raw}`);
  const lines = body.lines();
  if (lines.length === 0) {
    p.add(head);
    return;
  }
  p.add(head + ' {');
  for (const line of lines) p.add(line);
  p.add('}');
};

/** Link ids are data: always emitted when present (lossless round-trip,
 * design goal §1.2 — D-M1-16 supersedes §4's minimal-noise sketch). */
const linkNeedsBlock = (l: Link): boolean =>
  hasStyle(l.style) ||
  (l.waypoints?.length ?? 0) > 0 ||
  (l.tags?.length ?? 0) > 0 ||
  (l.attributes?.length ?? 0) > 0;

const printLink = (l: Link, p: Printer): void => {
  p.comment(l.comments, 0);
  let line = `${l.from} ${arrowFor(l)} ${l.to}`;
  if (l.label !== undefined) line += ` : ${quote(l.label)}`;
  if (l.id !== undefined) line += ` as ${l.id}`;
  if (!linkNeedsBlock(l)) {
    p.add(line);
    return;
  }
  p.add(line + ' {');
  if (l.tags?.length) p.add(`${INDENT}tag ${l.tags.join(' ')}`);
  if (hasStyle(l.style)) {
    p.add(`${INDENT}style {`);
    styleLines(l.style, 2, p);
    p.add(`${INDENT}}`);
  }
  for (const w of l.waypoints ?? []) p.add(`${INDENT}waypoint (${w[0]}, ${w[1]})`);
  for (const r of l.attributes ?? []) p.add(`${INDENT}${r.raw}`);
  p.add('}');
};

const printFlow = (f: Doc['flows'][number], p: Printer): void => {
  p.comment(f.comments, 0);
  let head = 'flow';
  if (f.title !== undefined) head += ' ' + quote(f.title);
  if (f.id !== undefined) head += ` as ${f.id}`;
  p.add(head + ' {');
  for (const s of f.steps) stepText(s, 1, p);
  p.add('}');
};

const printViewLine = (l: Doc['views'][number]['lines'][number], p: Printer): void => {
  p.comment(l.comments, 1);
  switch (l.type) {
    case 'layout':
      p.add(l.mode === 'saved' ? `${INDENT}layout saved` : `${INDENT}layout auto ${l.dir}`);
      return;
    case 'hideTag':
      p.add(`${INDENT}hide tag ${l.id}`);
      return;
    case 'hide':
      p.add(`${INDENT}hide ${l.id}`);
      return;
    case 'position':
      p.add(`${INDENT}position ${l.id} (${l.x}, ${l.y})`);
      return;
    case 'pin':
      p.add(`${INDENT}pin ${l.id}`);
      return;
  }
};

const printView = (v: Doc['views'][number], p: Printer): void => {
  p.comment(v.comments, 0);
  let head = `view ${quote(v.name)}`;
  if (v.id !== undefined) head += ` as ${v.id}`;
  p.add(head + ' {');
  for (const l of v.lines) printViewLine(l, p);
  p.add('}');
};

const printStyleStmt = (st: StyleStmt, p: Printer): void => {
  p.comment(st.comments, 0);
  p.add(`style ${st.target} {`);
  styleLines(st.style, 1, p);
  p.add('}');
};

const printImport = (imp: ImportStmt, p: Printer): void => {
  p.comment(imp.comments, 0);
  p.add(`import ${imp.alias} as ${quote(imp.path)}`);
};

const printSection = <T>(p: Printer, items: readonly T[], print: (x: T, pp: Printer) => void): void => {
  if (items.length === 0) return;
  p.blank();
  for (const x of items) print(x, p);
};

/** Print a Doc to canonical PDL (§11). Idempotent: print∘parse∘print = print. */
export function printDoc(doc: Doc): string {
  const p = new Printer();
  p.add(`pcd ${doc.formatVersion}`);
  p.comment(doc.comments, 0);
  const metas: [string, string | undefined, boolean][] = [
    ['title', doc.title, true],
    ['level', doc.level, false],
    ['direction', doc.direction, false],
    ['theme', doc.theme, false],
  ];
  for (const [key, val, quoted] of metas) {
    if (val !== undefined) p.add(`${key} ${quoted ? quote(val) : val}`);
  }
  printSection(p, doc.imports, printImport);
  printSection(p, doc.objects, printObject);
  printSection(p, doc.links, printLink);
  printSection(p, doc.flows, printFlow);
  printSection(p, doc.views, printView);
  printSection(p, doc.styles, printStyleStmt);
  return p.text();
}
