// SPDX-License-Identifier: GPL-3.0-only
// Canonical printer (M1-WP3) — FILE-FORMAT §11: fixed section order, one
// attribute per line, 2-space indent, quotes on strings, link ids are data
// and always emitted (D-M1-16), blank line between sections, comments
// re-attached above their statement (D-M1-10/12).
import type {
  Branch, Comments, Doc, FlowStep, IconDecl, ImportStmt, Link, Obj, StyleBlock,
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

/** Style keys printed as `key value` in this fixed order (§11). */
const STYLE_TEXT_KEYS = ['fill', 'stroke', 'text', 'icon', 'shape', 'head', 'tail', 'line', 'route'] as const;

/** Non-empty style lines of a block (order is canonical, §11). */
function stylePairs(sb: StyleBlock): string[] {
  const out = STYLE_TEXT_KEYS.flatMap((key) => {
    const value = sb[key];
    return value === undefined || value === '' ? [] : [`${key} ${value}`];
  });
  if (sb.dashed) out.push('dashed');
  if (sb.width !== undefined) out.push(`width ${jsNum(sb.width)}`);
  // FLOW-02: playback intensity, printed only when the document carries it.
  if (sb.sparks !== undefined) out.push(`sparks ${jsNum(sb.sparks)}`);
  if (sb.speed !== undefined) out.push(`speed ${jsNum(sb.speed)}`);
  return out;
}

const styleLines = (sb: StyleBlock | undefined, depth: number, p: Printer): void => {
  if (sb === undefined) return;
  for (const line of stylePairs(sb)) p.add(`${pad(depth)}${line}`);
  for (const r of sb.raw ?? []) p.add(`${pad(depth)}${r.raw}`);
};

const hasStyle = (sb: StyleBlock | undefined): boolean =>
  !!sb && (stylePairs(sb).length > 0 || (sb.raw?.length ?? 0) > 0);

/** Arrow text: optional type + direction (`->`, `<->`, `-requests->`, `<-r->`). */
const arrowFor = (l: Pick<Link, 'type' | 'bidir'>): string =>
  `${l.bidir ? '<' : ''}-${l.type ? l.type + '-' : ''}>`;

type StepPrinter = (s: FlowStep, depth: number, p: Printer) => void;

/** Append the optional per-step dwell (F-18). */
const withDelay = (line: string, step: { delayMs?: number }): string =>
  step.delayMs === undefined ? line : `${line} delay ${jsNum(step.delayMs)}`;

const printSimpleStep: StepPrinter = (s, depth, p) => {
  const t = s as { type: string; text: string };
  p.add(withDelay(`${pad(depth)}${t.type} ${quote(t.text)}`, s));
};

const printProcessStep: StepPrinter = (s, depth, p) => {
  const pr = s as { target: string; text?: string };
  const body = pr.text === undefined ? `process ${pr.target}` : `process ${pr.target} ${quote(pr.text)}`;
  p.add(withDelay(pad(depth) + body, s));
};

const printMsgStep: StepPrinter = (s, depth, p) => {
  const m = s as { from: string; to: string; label?: string; linkRef?: string; flip?: boolean };
  let line = `${m.from} -> ${m.to}`;
  if (m.label !== undefined) line += ` : ${quote(m.label)}`;
  if (m.linkRef !== undefined) line += ` as ${m.linkRef}`;
  if (m.flip === true) line += ' flip';
  p.add(withDelay(pad(depth) + line, s));
};

const printGotoStep: StepPrinter = (s, depth, p) => {
  const g = s as { file?: string; flow: string; ret?: 'here' };
  const target = g.file === undefined ? g.flow : quote(`${g.file}#${g.flow}`);
  p.add(withDelay(`${pad(depth)}goto ${target}${g.ret === 'here' ? ' return here' : ''}`, s));
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
  const body = new Printer();
  STEP_PRINTERS[s.type](s, depth, body);
  const lines = body.lines();
  if (!hasPresentation(s)) {
    for (const line of lines) p.add(line);
    return;
  }
  // A presentation block hangs off the step's last line, so a single-line step
  // and a brace-terminated block step print the same way (`… {` / `} {`).
  lines[lines.length - 1] = `${lines[lines.length - 1]} presentation {`;
  for (const line of lines) p.add(line);
  presentationLines(s, depth + 1, p);
  p.add(`${pad(depth)}}`);
};

/** UX08-WP11: metadata exists only when the document carries it. */
const hasPresentation = (s: FlowStep): boolean =>
  s.description !== undefined || s.camera !== undefined;

/** `camera …` line body: `auto`, `hold` or `focus (x, y) [zoom n]`. */
const cameraText = (camera: NonNullable<FlowStep['camera']>): string => {
  if (camera.mode !== 'focus') return `camera ${camera.mode}`;
  const point = `focus (${jsNum(camera.x ?? 0)}, ${jsNum(camera.y ?? 0)})`;
  const zoom = camera.zoom === undefined ? '' : ` zoom ${jsNum(camera.zoom)}`;
  return `camera ${point}${zoom}`;
};

/** Canonical order: description, camera, camera duration. */
const presentationLines = (s: FlowStep, depth: number, p: Printer): void => {
  const prefix = pad(depth);
  if (s.description !== undefined) p.add(`${prefix}description ${quote(s.description)}`);
  if (s.camera === undefined) return;
  p.add(prefix + cameraText(s.camera));
  if (s.camera.durationMs !== undefined) {
    p.add(`${prefix}duration ${jsNum(s.camera.durationMs)}`);
  }
};

// F-13/CX-03: explicit geometry, printed only when the document carries it.
const geometryLines = (o: Obj, p: Printer): void => {
  if (o.size !== undefined) p.add(`${INDENT}size ${jsNum(o.size.w)} ${jsNum(o.size.h)}`);
  if (o.z !== undefined) p.add(`${INDENT}z ${jsNum(o.z)}`);
};

const objectAttrLines = (o: Obj, p: Printer): void => {
  if (o.description !== undefined) p.add(`${INDENT}description ${quote(o.description)}`);
  if (o.technology !== undefined) p.add(`${INDENT}technology ${quote(o.technology)}`);
  if (o.tags?.length) p.add(`${INDENT}tag ${o.tags.join(' ')}`);
  for (const pr of o.properties ?? []) p.add(`${INDENT}property ${pr.key} ${quote(pr.value)}`);
  if (o.contains?.length) p.add(`${INDENT}contains ${o.contains.join(' ')}`);
  if (o.attach !== undefined) p.add(`${INDENT}attach ${o.attach}`);
  if (o.icon !== undefined) p.add(`${INDENT}icon ${o.icon}`);
  geometryLines(o, p);
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
const linkHasGeometry = (l: Link): boolean =>
  (l.waypoints?.length ?? 0) > 0 || l.fromAnchor !== undefined ||
  l.toAnchor !== undefined || l.allowOverlap === true;

const linkNeedsBlock = (l: Link): boolean =>
  hasStyle(l.style) ||
  linkHasGeometry(l) ||
  (l.tags?.length ?? 0) > 0 ||
  (l.attributes?.length ?? 0) > 0;

const printLinkAnchors = (l: Link, p: Printer): void => {
  if (l.fromAnchor !== undefined) p.add(`${INDENT}anchor from ${jsNum(l.fromAnchor)}`);
  if (l.toAnchor !== undefined) p.add(`${INDENT}anchor to ${jsNum(l.toAnchor)}`);
};

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
  printLinkAnchors(l, p);
  if (l.allowOverlap === true) p.add(`${INDENT}allow overlap`);
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
  if (f.description !== undefined) p.add(`${INDENT}description ${quote(f.description)}`);
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

/**
 * Document icon declaration (§3.1). Canonical line order is label, media, data;
 * `media` and `data` are always printed because the parser requires them, and
 * the payload is already canonical Base64, so printing cannot drift.
 */
const printIcon = (ic: IconDecl, p: Printer): void => {
  p.comment(ic.comments, 0);
  p.add(`icon ${ic.id} {`);
  if (ic.label !== undefined) p.add(`${INDENT}label ${quote(ic.label)}`);
  p.add(`${INDENT}media ${quote(ic.mediaType)}`);
  p.add(`${INDENT}data ${quote(ic.data)}`);
  p.add('}');
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
  printSection(p, doc.icons, printIcon);
  printSection(p, doc.objects, printObject);
  printSection(p, doc.links, printLink);
  printSection(p, doc.flows, printFlow);
  printSection(p, doc.views, printView);
  printSection(p, doc.styles, printStyleStmt);
  return p.text();
}
