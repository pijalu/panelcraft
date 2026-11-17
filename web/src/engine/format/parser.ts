// SPDX-License-Identifier: GPL-3.0-only
// PDL parser (M1-WP2) — recursive descent per FILE-FORMAT §13 EBNF.
// Policy (§2/§10): a syntax error aborts the file (doc=null + diagnostics);
// semantic problems defer to engine/model validation (P-codes).
import { lex, type ArrowInfo, type Token } from './lexer';
import { E, diag, type Diagnostic } from './diagnostics';
import { ICON_MEDIA_TYPES, decodeIconBase64, isCanonicalBase64 } from './iconSvg';
import {
  type Drilldown, FORMAT_VERSION, IR_VERSION,
  type Branch, type CameraSpec, type Comments, type Doc, type Flow, type FlowStep,
  type IconDecl, type ImportStmt, type Kind, type Link, type Obj, type Pos,
  type SourceBlock, type StyleBlock, type StyleStmt, type Dir, type LayoutState,
} from '../model/types';

export interface ParseResult {
  doc: Doc | null;
  diagnostics: Diagnostic[];
}

const KINDS = new Set<string>([
  'person', 'system', 'system_ext', 'container', 'component',
  'datastore', 'queue', 'group', 'note',
]);
const DIRS = new Set<string>(['LR', 'TB', 'RL', 'BT']);
const META_LEVELS = new Set<string>(['context', 'container', 'component', 'deployment']);
const THEMES = new Set<string>(['light', 'dark']);
const STEP_KWS = new Set<string>(['intro', 'process', 'alt', 'par', 'goto', 'info', 'conclusion']);
const LAYOUT_STMTS = new Set<string>(['layout', 'position', 'pin', 'hide']);
const MAX_DEPTH = 32;
/** Embedded decomposition documents may nest at most eight levels deep. */
const MAX_EMBED_DEPTH = 8;
/** UX08-WP11 camera bounds (IR v8): the existing canvas zoom limits, ms ≤ 300. */
const CAMERA_ZOOM_MIN = 0.1;
const CAMERA_ZOOM_MAX = 4;
const CAMERA_MS_MAX = 300;
/** UX08-WP11 presentation-block keys (order-free, each at most once). */
const PRESENTATION_KEYS = new Set<string>(['description', 'camera', 'duration']);

class Abort {
  constructor(readonly d: Diagnostic) {}
}

const tokPos = (t: Token): Pos => ({ line: t.line, col: t.col });

/** Apply arrow type/bidir flags to normalized endpoints. */
const withArrow = (
  ends: { from: string; to: string },
  info: ArrowInfo,
): Pick<Link, 'from' | 'to' | 'type' | 'bidir'> => ({
  ...ends,
  ...(info.type ? { type: info.type } : {}),
  ...(info.tail && info.head ? { bidir: true } : {}),
});

class Parser {
  readonly diags: Diagnostic[] = [];
  private i = 0;
  private pending: Comments = [];
  private embedDepth = 0;

  constructor(
    private readonly src: string,
    private readonly toks: Token[],
  ) {}

  // ---- cursor helpers -------------------------------------------------------
  private peek(off = 0): Token {
    return this.toks[Math.min(this.i + off, this.toks.length - 1)]!;
  }
  private next(): Token {
    const t = this.peek();
    if (this.i < this.toks.length - 1) this.i += 1;
    return t;
  }
  private fail(t: Token, code: string, msg: string): never {
    throw new Abort(diag(code, msg, t.line, t.col));
  }
  private expect(type: Token['type'], text?: string): Token {
    const t = this.next();
    if (t.type !== type || (text !== undefined && t.text !== text)) {
      const want = text ?? type;
      this.fail(t, E.unexpected, `expected ${want}, got '${t.text || t.type}'`);
    }
    return t;
  }
  private takeComments(): Comments {
    const c = this.pending;
    this.pending = [];
    return c;
  }
  private num(t: Token): number {
    if (t.type !== 'number') this.fail(t, E.unexpected, `expected number, got '${t.text || t.type}'`);
    return Number(t.text);
  }
  /** Consume tokens through end of line; return the raw source slice. */
  private captureRaw(first: Token): { raw: string; last: Token } {
    let last = first;
    while (this.peek().type !== 'eof' && this.peek().line === first.line) last = this.next();
    return { raw: this.src.slice(first.start, last.end).trim(), last };
  }
  private expectClose(t0: Token, what: string): Token {
    if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, `unclosed ${what} block`);
    return this.expect('punct', '}');
  }

  // ---- file -----------------------------------------------------------------
  parseFile(): Doc {
    return this.parseDoc(false);
  }

  /**
   * Parse one document from the current token position. Nested embedded
   * documents share the outer token stream, so every `pos` stays relative to
   * the real file and diagnostics point at the line the user can see.
   */
  private parseDoc(nested: boolean, open?: Token): Doc {
    this.skipToContent();
    const first = this.peek();
    if (first.type !== 'ident' || first.text !== 'pcd') {
      this.fail(first, E.invalidVersion, 'missing "pcd <version>" magic line');
    }
    this.next();
    const ver = this.expect('number');
    const major = Number(ver.text.split('.')[0]);
    if (major > 1) this.fail(ver, E.invalidVersion, `unsupported major version ${major}`);
    const doc: Doc = {
      irVersion: IR_VERSION,
      formatVersion: ver.text || FORMAT_VERSION,
      imports: [], icons: [], objects: [], links: [], flows: [], styles: [],
    };
    // Pre-magic comments are doc-level (D-M1-2): the magic line is canonical first.
    const lead = this.takeComments();
    if (lead.length > 0) doc.comments = lead;
    this.statementLoop(doc, nested, open);
    return doc;
  }

  private skipToContent(): void {
    while (this.peek().type === 'comment') this.pending.push(this.next().text);
  }

  /** Comments never drop: they accumulate and attach to the next statement. */
  private skipComments(): void {
    while (this.peek().type === 'comment') this.pending.push(this.next().text);
  }

  /** Pre-meta comments attach to the doc (D-M1-2). */
  private takeDocComments(doc: Doc): void {
    const c = this.takeComments();
    if (c.length > 0 && doc.comments === undefined) doc.comments = c;
  }

  /** True when a nested document reached its closing brace (or the file end). */
  private atDocEnd(t: Token, nested: boolean, open: Token | undefined): boolean {
    if (!nested) return t.type === 'eof';
    if (t.type === 'punct' && t.text === '}') {
      this.expectClose(open ?? t, 'embedded document');
      return true;
    }
    if (t.type === 'eof') this.fail(open ?? t, E.unclosedBlock, 'unclosed embedded document');
    return false;
  }

  private statementLoop(doc: Doc, nested = false, open?: Token): void {
      for (;;) {
        this.skipToContent();
        const t = this.peek();
        if (this.atDocEnd(t, nested, open)) return;
        if (t.type !== 'ident') {
        this.fail(t, E.unknownTopLevel, `unknown top-level statement '${t.text || t.type}'`);
      }
      if (t.text === 'pcd') this.fail(t, E.unexpected, 'duplicate magic line');
      const h = this.stmtHandler(t.text);
      if (h) {
        h(doc);
        continue;
      }
      if (KINDS.has(t.text)) {
        doc.objects.push(this.parseObject());
        continue;
      }
      doc.links.push(this.parseLink());
    }
  }

  /** Top-level keyword dispatch (statement → parser). */
  private stmtHandler(kw: string): ((doc: Doc) => void) | undefined {
    switch (kw) {
      case 'title':
        return (d) => {
          this.next();
          this.takeDocComments(d);
          d.title ??= this.str();
        };
      case 'level':
      case 'direction':
      case 'theme':
        return (d) => {
          this.next();
          this.takeDocComments(d);
          this.parseMeta(d, kw);
        };
      case 'import': return (d) => d.imports.push(this.parseImport());
      case 'icon': return (d) => d.icons.push(this.parseIcon());
      case 'flow': return (d) => d.flows.push(this.parseFlow());
      case 'view': return () => this.fail(this.next(), E.legacyView,
        'named view blocks are no longer supported; move layout/position/pin/hide lines to the top level');
      case 'style': return (d) => d.styles.push(this.parseStyleStmt());
      default:
        return LAYOUT_STMTS.has(kw) ? (d) => this.parseLayoutStmt(kw, d) : undefined;
    }
  }

  private str(): string {
    return this.expect('string').value ?? '';
  }

  private parseMeta(doc: Doc, key: 'level' | 'direction' | 'theme'): void {
    const allowed = key === 'level' ? META_LEVELS : key === 'direction' ? DIRS : THEMES;
    this.metaEnum(doc, key, this.next(), allowed);
  }

  private metaEnum(doc: Doc, key: 'level' | 'direction' | 'theme', t: Token, allowed: Set<string>): void {
    if (t.type !== 'ident' || !allowed.has(t.text)) {
      this.fail(t, E.unexpected, `invalid ${key} value '${t.text}'`);
    }
    const dup = doc[key] !== undefined;
    if (!dup) (doc as unknown as Record<string, unknown>)[key] = t.text;
    else this.diags.push(diag('W100', `duplicate ${key} directive (first kept)`, t.line, t.col, 'warning'));
  }

  // ---- import / object ------------------------------------------------------
  private parseImport(): ImportStmt {
    const t0 = this.next();
    const comments = this.takeComments();
    const alias = this.ident();
    this.expect('ident', 'as');
    const path = this.expect('string').value ?? '';
    const pos = tokPos(t0);
    return comments.length ? { alias, path, comments, pos } : { alias, path, pos };
  }

  /**
   * Document icon declaration (§3.1): `icon <id> { label "…" media "…" data "…" }`.
   * Media type and payload are required and checked here, because a declaration
   * that cannot be decoded is a syntax problem, not a semantic one: it can never
   * be rendered, and the canonical printer would emit an unusable file.
   */
  private parseIcon(): IconDecl {
    const t0 = this.next();
    const comments = this.takeComments();
    const id = this.ident();
    const block = this.iconBlock(t0);
    const mediaType = this.iconMedia(t0, block.mediaType);
    const data = block.data;
    if (data === undefined) this.fail(t0, E.unexpected, 'icon declaration requires a data line');
    if (!isCanonicalBase64(data) || decodeIconBase64(data) === null) {
      this.fail(t0, E.invalidIconData, 'icon data must be canonical Base64 (standard alphabet, padding, no whitespace)');
    }
    const ic: IconDecl = { id, mediaType, data, pos: tokPos(t0) };
    if (block.label !== undefined) ic.label = block.label;
    if (comments.length > 0) ic.comments = comments;
    return ic;
  }

  /** Body of an icon block (order-free, each line at most once). */
  private iconBlock(t0: Token): { label?: string; mediaType?: string; data?: string } {
    const block: { label?: string; mediaType?: string; data?: string } = {};
    const seen = new Set<string>();
    this.expect('punct', '{');
    for (;;) {
      this.skipComments();
      const t = this.peek();
      if (t.type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed icon block');
      if (t.type === 'punct' && t.text === '}') {
        this.next();
        return block;
      }
      this.iconLine(this.expect('ident'), seen, block);
    }
  }

  /** One `label`/`media`/`data` line of an icon block. */
  private iconLine(
    kw: Token,
    seen: Set<string>,
    block: { label?: string; mediaType?: string; data?: string },
  ): void {
    const key = kw.text;
    if (key !== 'label' && key !== 'media' && key !== 'data') {
      this.fail(kw, E.unexpected, `unknown icon line '${key}'`);
    }
    this.once(seen, kw, key);
    const value = this.str();
    if (key === 'label') block.label = value;
    else if (key === 'media') block.mediaType = value;
    else block.data = value;
  }

  /** Required media line: this version draws SVG only, so anything else aborts. */
  private iconMedia(t0: Token, declared: string | undefined): string {
    if (declared === undefined) this.fail(t0, E.unexpected, 'icon declaration requires a media line');
    if (!ICON_MEDIA_TYPES.includes(declared)) {
      this.fail(t0, E.invalidIconMedia, `unsupported icon media type '${declared}'`);
    }
    return declared;
  }

  private parseObject(): Obj {
    const t0 = this.next();
    const comments = this.takeComments();
    const o: Obj = { kind: t0.text as Kind, id: this.ident(), pos: tokPos(t0) };
    if (this.peek().type === 'string') o.name = this.next().value;
    if (this.peek().type === 'punct' && this.peek().text === '{') {
      this.next();
      this.objectBlock(o, t0);
    }
    return comments.length ? { ...o, comments } : o;
  }

  private objectBlock(o: Obj, t0: Token): void {
    const seen = new Set<string>();
    for (;;) {
      this.skipComments();
      if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed object block');
      if (this.peek().type === 'punct' && this.peek().text === '}') { this.next(); return; }
      const t = this.expect('ident');
      const h = this.attrHandler(seen, t) ?? this.attrStyle(seen, t0, t);
      if (h) {
        h(o);
        continue;
      }
      const { raw } = this.captureRaw(t);
      (o.attributes ??= []).push({ raw, pos: tokPos(t) });
    }
  }

  /** Object attribute dispatch (§3 block body). */
  private attrHandler(seen: Set<string>, t: Token): ((o: Obj) => void) | undefined {
    switch (t.text) {
      case 'description':
        this.once(seen, t, 'description');
        return (o) => { o.description = this.str(); };
      case 'technology':
        this.once(seen, t, 'technology');
        return (o) => { o.technology = this.str(); };
      case 'tag':
        return (o) => { (o.tags ??= []).push(...this.identList()); };
      case 'property':
        return (o) => {
          const key = this.ident();
          const value = this.str();
          (o.properties ??= []).push({ key, value });
        };
      case 'contains':
        this.once(seen, t, 'contains');
        return (o) => { o.contains = this.identList(); };
      case 'attach':
        this.once(seen, t, 'attach');
        return (o) => { o.attach = this.refId(); };
      case 'icon':
        this.once(seen, t, 'icon');
        return (o) => { o.icon = this.ident(); };
      case 'size':
        this.once(seen, t, 'size');
        return (o) => {
          const w = this.num(this.expect('number'));
          const h = this.num(this.expect('number'));
          if (w <= 0 || h <= 0) this.fail(t, E.unexpected, 'size must be positive');
          o.size = { w, h };
        };
      case 'z':
        this.once(seen, t, 'z');
        return (o) => {
          const z = this.num(this.expect('number'));
          if (!Number.isSafeInteger(z)) this.fail(t, E.unexpected, 'z must be an integer');
          o.z = z;
        };
      case 'drilldown':
        this.once(seen, t, 'drilldown');
        return (o) => { o.drilldown = this.parseDrilldown(); };
      case 'source':
        this.once(seen, t, 'source');
        return (o) => { o.source = this.parseSource(t); };
      default:
        return undefined;
    }
  }

  /**
   * The one object attribute that needs the block's opening token (`t0`) for its
   * style parsing, kept separate so the attribute table stays one concern per
   * function and inside the complexity gate.
   */
  private attrStyle(
    seen: Set<string>,
    t0: Token,
    t: Token,
  ): ((o: Obj) => void) | undefined {
    if (t.text !== 'style') return undefined;
    this.once(seen, t, 'style');
    return (o) => { o.style = this.parseStyleBlock(t0, 'object'); };
  }

  private once(seen: Set<string>, t: Token, key: string): void {
    if (seen.has(key)) this.fail(t, E.duplicateAttr, `duplicate attribute '${key}'`);
    seen.add(key);
  }

  /**
   * C4 decomposition (IR v12, FILE-FORMAT §3.2): a linked `drilldown "<path>"`
   * or an embedded `drilldown embedded "<path>" { pcd 1.0 … }`. The legacy
   * `view <id>` suffix is rejected rather than silently dropped (ADR 0007).
   */
  private parseDrilldown(): Drilldown {
    const first = this.peek();
    if (first.type === 'string') {
      const path = this.str();
      const peeked = this.peek();
      if (peeked.type === 'ident' && peeked.text === 'view') {
        this.fail(this.next(), E.legacyDrilldownView,
          'a named view on a drilldown is no longer supported; remove the "view <id>" suffix');
      }
      return { kind: 'linked', path };
    }
    if (first.type !== 'ident' || first.text !== 'embedded') {
      this.fail(first, E.unexpected,
        'drilldown expects "path.pcd" or embedded "path.pcd" { pcd 1.0 … }');
    }
    if (this.embedDepth >= MAX_EMBED_DEPTH) {
      this.fail(first, E.nestingTooDeep,
        `embedded decomposition nesting exceeds ${MAX_EMBED_DEPTH} levels`);
    }
    this.next();
    const path = this.str();
    const open = this.expect('punct', '{');
    this.embedDepth += 1;
    const doc = this.parseDoc(true, open);
    this.embedDepth -= 1;
    return { kind: 'embedded', path, doc };
  }

  /**
   * Embedded source (IR v10, FILE-FORMAT §3.3): `source { language "…" text "…" … }`.
   * One `text` line per source line, in document order. A block with no text line is
   * `E116`: it would show nothing and the printer would drop it, breaking round-trip.
   */
  private parseSource(t0: Token): SourceBlock {
    this.expect('punct', '{');
    const lines: string[] = [];
    let language: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      this.skipComments();
      if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed source block');
      if (this.peek().type === 'punct' && this.peek().text === '}') { this.next(); break; }
      const t = this.expect('ident');
      if (t.text === 'language') {
        this.once(seen, t, 'language');
        language = this.str();
        continue;
      }
      if (t.text !== 'text') this.fail(t, E.unexpected, `unknown source line '${t.text}'`);
      lines.push(this.str());
    }
    if (lines.length === 0) this.fail(t0, E.emptySource, 'source block needs at least one text line');
    return language === undefined ? { lines } : { language, lines };
  }

  /** PDL identifier (FILE-FORMAT §1 + errata D-M1-8: letters first, ≤64). */
  private ident(t?: Token): string {
    const tok = t ?? this.expect('ident');
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(tok.text)) {
      this.fail(tok, E.invalidIdent, `invalid identifier '${tok.text}'`);
    }
    return tok.text;
  }

  /**
   * Object reference: a plain id, or an import-qualified `alias.objectId`
   * (FR-I2). Only object references accept the qualified form.
   */
  /** refId for an already-consumed leading token. */
  private refIdFrom(t: Token): string {
    const first = this.ident(t);
    const dot = this.peek();
    if (dot.type === 'punct' && dot.text === '.') {
      this.next();
      return `${first}.${this.ident()}`;
    }
    return first;
  }

  private refId(): string {
    const first = this.ident();
    const dot = this.peek();
    if (dot.type === 'punct' && dot.text === '.') {
      this.next();
      return `${first}.${this.ident()}`;
    }
    return first;
  }

  private identList(): string[] {
    const ids: string[] = [];
    const first = this.peek();
    while (this.peek().type === 'ident' && this.peek().line === first.line) {
      ids.push(this.ident(this.next()));
    }
    if (ids.length === 0) this.fail(this.peek(), E.unexpected, 'expected identifier');
    return ids;
  }

  // ---- style ----------------------------------------------------------------
  private parseStyleBlock(t0: Token, where: string): StyleBlock {
    this.expect('punct', '{');
    const sb: StyleBlock = {};
    const seen = new Set<string>();
    for (;;) {
      this.skipComments();
      if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, `unclosed ${where} style block`);
      if (this.peek().type === 'punct' && this.peek().text === '}') { this.next(); return sb; }
      const t = this.expect('ident');
      const h = this.styleLineHandler(seen, t);
      if (h) {
        h(sb);
        continue;
      }
      const { raw } = this.captureRaw(t);
      (sb.raw ??= []).push({ raw, pos: tokPos(t) });
    }
  }

  /** F-12 link visual keys (`head`/`tail`/`line`/`width`). */
  private linkStyleHandler(seen: Set<string>, t: Token): ((sb: StyleBlock) => void) | undefined {
    if (t.text === 'head' || t.text === 'tail') {
      const key = t.text;
      this.once(seen, t, key);
      return (sb) => {
        sb[key] = this.ident();
      };
    }
    if (t.text === 'line') {
      this.once(seen, t, 'line');
      return (sb) => {
        const id = this.ident();
        if (id !== 'solid' && id !== 'dashed' && id !== 'dotted') {
          this.fail(t, E.unexpected, `invalid line style '${id}'`);
        }
        sb.line = id;
      };
    }
    if (t.text === 'route') {
      this.once(seen, t, 'route');
      return (sb) => {
        const id = this.ident();
        if (id !== 'orthogonal' && id !== 'straight' && id !== 'curved') {
          this.fail(t, E.unexpected, `invalid route mode '${id}'`);
        }
        sb.route = id;
      };
    }
    if (t.text === 'width') {
      this.once(seen, t, 'width');
      return (sb) => {
        sb.width = this.num(this.expect('number'));
      };
    }
    if (t.text === 'sparks') {
      this.once(seen, t, 'sparks');
      return (sb) => {
        const n = this.num(this.expect('number'));
        if (!Number.isInteger(n) || n < 1 || n > 8) {
          this.fail(t, E.unexpected, 'sparks must be an integer between 1 and 8');
        }
        sb.sparks = n;
      };
    }
    if (t.text === 'speed') {
      this.once(seen, t, 'speed');
      return (sb) => {
        const v = this.num(this.expect('number'));
        if (!Number.isFinite(v) || v < 0.25 || v > 4) {
          this.fail(t, E.unexpected, 'speed must be between 0.25 and 4');
        }
        sb.speed = v;
      };
    }
    return undefined;
  }

  /** Style line dispatch (§7.3 + errata `dashed`, F-12 link keys). */
  private styleLineHandler(seen: Set<string>, t: Token): ((sb: StyleBlock) => void) | undefined {
    const linkKey = this.linkStyleHandler(seen, t);
    if (linkKey) return linkKey;
    const colorKey = t.text === 'fill' || t.text === 'stroke' || t.text === 'text' ? t.text : null;
    if (colorKey) {
      this.once(seen, t, colorKey);
      return (sb) => {
        const c = this.next();
        if (c.type !== 'color') this.fail(c, E.invalidColor, `${colorKey} needs a #rgb/#rrggbb color`);
        sb[colorKey] = c.text;
      };
    }
    if (t.text === 'icon' || t.text === 'shape') {
      this.once(seen, t, t.text);
      const key = t.text;
      return (sb) => { sb[key] = this.expect('ident').text; };
    }
    if (t.text === 'dashed') {
      this.once(seen, t, 'dashed');
      return (sb) => { sb.dashed = true; };
    }
    return undefined;
  }

  private parseStyleStmt(): StyleStmt {
    const t0 = this.next();
    const comments = this.takeComments();
    const target = this.ident();
    const style = this.parseStyleBlock(t0, 'style');
    const pos = tokPos(t0);
    return comments.length ? { target, style, comments, pos } : { target, style, pos };
  }

  // ---- links ----------------------------------------------------------------
  private parseLink(): Link {
    const t0 = this.next();
    const comments = this.takeComments();
    const l: Link = { ...this.linkEnds(t0), pos: tokPos(t0) };
    this.linkModifiers(l);
    if (this.peek().type === 'punct' && this.peek().text === '{') {
      this.next();
      this.linkBlock(l, t0);
    }
    return comments.length ? { ...l, comments } : l;
  }

  /** `from [type-]arrow to` with reversed-arrow normalization (errata D-M1-11). */
  private linkEnds(t0: Token): Pick<Link, 'from' | 'to' | 'type' | 'bidir'> {
    const from = this.refIdFrom(t0);
    const arrow = this.expect('arrow');
    const to = this.refId();
    const info: ArrowInfo = arrow.arrow!;
    if (info.tail && !info.head) {
      const e = { from: to, to: from };
      return withArrow(e, info);
    }
    return withArrow({ from, to }, info);
  }

  /** Order-free `: label` / `as id` tail (errata D-M1-9 for msg steps). */
  private linkModifiers(l: Link): void {
    for (;;) {
      const p = this.peek();
      if (p.type === 'punct' && p.text === ':') {
        this.next();
        l.label = this.str();
      } else if (p.type === 'ident' && p.text === 'as') {
        this.next();
        l.id = this.ident();
      } else break;
    }
  }

  private linkAnchor(l: Link, seen: Set<string>, t: Token): void {
    const endpoint = this.expect('ident').text;
    if (endpoint !== 'from' && endpoint !== 'to') this.fail(t, E.unexpected, 'anchor endpoint must be from or to');
    this.once(seen, t, `anchor ${endpoint}`);
    const value = this.num(this.expect('number'));
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      this.fail(t, E.unexpected, 'expected 0 <= anchor < 1');
    }
    if (endpoint === 'from') l.fromAnchor = value;
    else l.toAnchor = value;
  }

  private linkWaypoint(l: Link): void {
    this.expect('punct', '(');
    const x = this.num(this.next());
    this.expect('punct', ',');
    const y = this.num(this.next());
    this.expect('punct', ')');
    (l.waypoints ??= []).push([x, y]);
  }

  private linkAllowOverlap(l: Link, seen: Set<string>, t: Token): void {
    this.once(seen, t, 'allow overlap');
    this.expect('ident', 'overlap');
    l.allowOverlap = true;
  }

  private linkBlockAttribute(l: Link, seen: Set<string>, t: Token, t0: Token): boolean {
    if (t.text === 'label') l.label = this.expect('string').value;
    else if (t.text === 'tag') (l.tags ??= []).push(...this.identList());
    else if (t.text === 'style') l.style = this.parseStyleBlock(t0, 'link');
    else if (t.text === 'anchor') this.linkAnchor(l, seen, t);
    else if (t.text === 'waypoint') this.linkWaypoint(l);
    else if (t.text === 'allow') this.linkAllowOverlap(l, seen, t);
    else return false;
    return true;
  }

  private linkBlock(l: Link, t0: Token): void {
    const seen = new Set<string>();
    for (;;) {
      this.skipComments();
      if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed link block');
      if (this.peek().type === 'punct' && this.peek().text === '}') { this.next(); return; }
      const t = this.expect('ident');
      if (this.linkBlockAttribute(l, seen, t, t0)) continue;
      const { raw } = this.captureRaw(t);
      (l.attributes ??= []).push({ raw, pos: tokPos(t) });
    }
  }

  // ---- flows ----------------------------------------------------------------
  private parseFlow(): Flow {
    const t0 = this.next();
    const comments = this.takeComments();
    const f: Flow = { pos: tokPos(t0), steps: [] };
    if (this.peek().type === 'string') f.title = this.next().value;
    if (this.peek().type === 'ident' && this.peek().text === 'as') {
      this.next();
      f.id = this.ident();
    }
    this.expect('punct', '{');
    const description = this.flowDescription();
    if (description !== undefined) f.description = description;
    f.steps = this.parseSteps(1);
    this.expectClose(t0, 'flow');
    return comments.length ? { ...f, comments } : f;
  }

  /**
   * UX08-WP11: an optional `description "…"` line at the top of a flow body.
   * It is a flow attribute, not a step, so it is consumed before step parsing.
   */
  private flowDescription(): string | undefined {
    const t = this.peek();
    if (t.type !== 'ident' || t.text !== 'description') return undefined;
    this.next();
    return this.quoted(this.next(), 'description');
  }

  private parseSteps(depth: number): FlowStep[] {
    if (depth > MAX_DEPTH) this.fail(this.peek(), E.nestingTooDeep, `nesting deeper than ${MAX_DEPTH}`);
    const steps: FlowStep[] = [];
    for (;;) {
      this.skipComments();
      const t = this.peek();
      if (t.type === 'eof') return steps;
      if (t.type === 'punct' && t.text === '}') return steps;
      if (t.type === 'ident' && STEP_KWS.has(t.text)) steps.push(this.parseKeywordStep(t.text, depth));
      else if (t.type === 'ident') steps.push(this.parseMsgStep());
      else this.fail(t, E.unexpected, `unexpected ${t.type} in flow body`);
    }
  }

  private quoted(t: Token, what: string): string {
    if (t.type !== 'string') this.fail(t, E.unexpected, `${what} needs a quoted string`);
    return t.value ?? '';
  }

  /** Optional trailing `delay <ms>` on a step line (F-18). */
  private stepDelay(line: number): { delayMs?: number } {
    const t = this.peek();
    if (t.type !== 'ident' || t.text !== 'delay' || t.line !== line) return {};
    this.next();
    const ms = this.num(this.expect('number'));
    if (ms < 0) this.fail(t, E.unexpected, 'delay must not be negative');
    return { delayMs: ms };
  }

  private parseKeywordStep(kw: string, depth: number): FlowStep {
    const t0 = this.next();
    const comments = this.takeComments();
    const pos = tokPos(t0);
    const wrap = <T extends object>(base: T): FlowStep =>
      this.presentation(t0, ({
        ...(comments.length ? { ...base, comments } : base),
        type: kw,
        pos,
        ...(kw === 'alt' || kw === 'par' ? {} : this.stepDelay(t0.line)),
      }) as unknown as FlowStep);
    switch (kw) {
      case 'intro':
      case 'info':
      case 'conclusion':
        return wrap({ text: this.quoted(this.next(), kw) });
      case 'process': {
        const target = this.refId();
        const text = this.peek().type === 'string' ? this.next().value : undefined;
        return wrap(text === undefined ? { target } : { target, text });
      }
      case 'alt':
        return wrap(this.parseAltBody(t0, depth));
      case 'par':
        return wrap(this.parseParBody(t0, depth));
      default: // goto
        return wrap(this.parseGoto());
    }
  }

  private parseAltBody(t0: Token, depth: number): { label?: string; branches: Branch[] } {
    const label = this.peek().type === 'string' ? this.next().value : undefined;
    this.expect('punct', '{');
    const branches: Branch[] = [];
    for (;;) {
      this.skipComments();
      if (this.peek().type === 'punct' && this.peek().text === '}') break;
      if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed alt block');
      const bt = this.next();
      const bpos = tokPos(bt);
      const blabel = this.quoted(bt, 'alt branch');
      this.expect('punct', '{');
      const bsteps = this.parseSteps(depth + 1);
      this.expectClose(bt, 'alt branch');
      branches.push(bcomments(blabel, bsteps, bpos));
    }
    this.next();
    return label === undefined ? { branches } : { label, branches };
  }

  private parseParBody(t0: Token, depth: number): { label?: string; lanes: FlowStep[][] } {
    const label = this.peek().type === 'string' ? this.next().value : undefined;
    this.expect('punct', '{');
    const lanes: FlowStep[][] = [];
    for (;;) {
      this.skipComments();
      if (this.peek().type === 'punct' && this.peek().text === '}') break;
      if (this.peek().type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed par block');
      this.expect('punct', '{');
      const lane = this.parseSteps(depth + 1);
      this.expectClose(t0, 'par lane');
      lanes.push(lane);
    }
    this.next();
    return label === undefined ? { lanes } : { label, lanes };
  }

  private parseGoto(): { file?: string; flow: string; ret?: 'here' } {
    const t = this.next();
    if (t.type !== 'ident' && (t.type !== 'string' || !t.value?.includes('#'))) {
      this.fail(t, E.invalidGoto, 'goto needs ident or "path.pcd#flowId"');
    }
    let g: { file?: string; flow: string; ret?: 'here' };
    if (t.type === 'ident') g = { flow: this.ident(t) };
    else {
      const hash = t.value!.lastIndexOf('#');
      g = { file: t.value!.slice(0, hash), flow: t.value!.slice(hash + 1) };
    }
    if (this.peek().type === 'ident' && this.peek().text === 'return') {
      this.next();
      const r = this.expect('ident');
      if (r.text === 'here') g.ret = 'here';
      else if (r.text !== 'end') this.fail(r, E.unexpected, `invalid goto return '${r.text}'`);
    }
    return g;
  }

  private parseMsgStep(): FlowStep {
    const t0 = this.next();
    const comments = this.takeComments();
    let from = this.refIdFrom(t0);
    const arrow = this.expect('arrow');
    let to = this.refId();
    const info = arrow.arrow!;
    if (info.tail && !info.head) [from, to] = [to, from];
    const step = {
      type: 'msg' as const,
      from,
      to,
      pos: tokPos(t0),
      ...(comments.length ? { comments } : {}),
    } as { type: 'msg'; from: string; to: string; pos: Pos; label?: string; linkRef?: string; flip?: boolean; comments?: Comments };
    this.msgModifiers(t0, step);
    const delay = this.stepDelay(t0.line);
    return this.presentation(t0, delay.delayMs === undefined ? step : { ...step, ...delay });
  }

  // ---- presentation metadata (UX08-WP11 / IR v8) ---------------------------

  /**
   * Optional `presentation { … }` block after any step. Absent means "no
   * metadata": the step behaves exactly as before, and the printer omits the
   * block, so old documents keep their canonical form byte for byte.
   */
  private presentation<T extends FlowStep>(t0: Token, step: T): T {
    const t = this.peek();
    if (t.type !== 'ident' || t.text !== 'presentation') return step;
    this.next();
    this.expect('punct', '{');
    const block = this.presentationBody(t0);
    if (block.empty) return step;
    return {
      ...step,
      ...(block.description === undefined ? {} : { description: block.description }),
      ...(block.camera === undefined ? {} : { camera: block.camera }),
    };
  }

  /** Body of a presentation block: description, camera and camera duration. */
  private presentationBody(t0: Token): {
    description?: string;
    camera?: CameraSpec;
    empty: boolean;
  } {
    const out: { description?: string; camera?: CameraSpec; empty: boolean } = { empty: true };
    let durationMs: number | undefined;
    const seen = new Set<string>();
    for (;;) {
      this.skipComments();
      const key = this.peek();
      if (key.type === 'punct' && key.text === '}') {
        this.next();
        break;
      }
      if (key.type === 'eof') this.fail(t0, E.unclosedBlock, 'unclosed presentation block');
      const name = this.presentationKey(key, seen);
      out.empty = false;
      if (name === 'description') out.description = this.quoted(this.next(), 'description');
      else if (name === 'camera') out.camera = this.parseCamera(key);
      else durationMs = this.cameraDuration(key);
    }
    if (durationMs === undefined) return out;
    if (out.camera === undefined) {
      this.fail(t0, E.unexpected, 'duration needs a camera line in the same block');
    }
    return { ...out, camera: { ...out.camera, durationMs } };
  }

  /** Read and validate a presentation key name (duplicates are errors). */
  private presentationKey(key: Token, seen: Set<string>): string {
    if (key.type !== 'ident') this.fail(key, E.unexpected, `unexpected ${key.type} in presentation block`);
    const name = key.text;
    if (!PRESENTATION_KEYS.has(name)) {
      this.fail(key, E.unexpected, `unknown presentation key '${name}'`);
    }
    if (seen.has(name)) this.fail(key, E.duplicateAttr, `duplicate '${name}' in presentation block`);
    seen.add(name);
    this.next();
    return name;
  }

  /** `camera auto | hold | focus (x, y) [zoom n]` — one line, no ambiguity. */
  private parseCamera(key: Token): CameraSpec {
    const mode = this.expect('ident');
    if (mode.text === 'auto' || mode.text === 'hold') return { mode: mode.text };
    if (mode.text !== 'focus') {
      this.fail(mode, E.unexpected, `invalid camera mode '${mode.text}' (auto, hold or focus)`);
    }
    this.expect('punct', '(');
    const x = this.num(this.expect('number'));
    this.expect('punct', ',');
    const y = this.num(this.expect('number'));
    this.expect('punct', ')');
    const camera: CameraSpec = { mode: 'focus', x, y };
    const zoom = this.cameraZoom(key);
    return zoom === undefined ? camera : { ...camera, zoom };
  }

  /** Optional `zoom <n>` on the same camera line, bounded like the canvas. */
  private cameraZoom(key: Token): number | undefined {
    const t = this.peek();
    if (t.type !== 'ident' || t.text !== 'zoom' || t.line !== key.line) return undefined;
    this.next();
    const zoom = this.num(this.expect('number'));
    if (!(zoom >= CAMERA_ZOOM_MIN && zoom <= CAMERA_ZOOM_MAX)) {
      this.fail(t, E.unexpected, `zoom must be within ${CAMERA_ZOOM_MIN} and ${CAMERA_ZOOM_MAX}`);
    }
    return zoom;
  }

  /** `duration <ms>` — camera transition time, 0–300 ms. */
  private cameraDuration(key: Token): number {
    const ms = this.num(this.expect('number'));
    if (!(ms >= 0 && ms <= CAMERA_MS_MAX)) {
      this.fail(key, E.unexpected, `duration must be within 0 and ${CAMERA_MS_MAX}`);
    }
    return ms;
  }

  /** Order-free msg modifiers (errata D-M1-9): : "label", as Ref, flip. */
  private msgModifiers(
    t0: Token,
    step: { label?: string; linkRef?: string; flip?: boolean },
  ): void {
    for (;;) {
      const p = this.peek();
      if (p.type === 'punct' && p.text === ':') {
        this.next();
        step.label = this.expect('string').value ?? '';
        continue;
      }
      if (p.type === 'ident' && p.text === 'as') {
        this.next();
        step.linkRef = this.ident();
        continue;
      }
      if (p.type === 'ident' && p.text === 'flip') {
        this.next();
        step.flip = true;
        continue;
      }
      return; // 'delay' and anything else are handled by the caller
    }
  }

  // ---- top-level layout state (ADR 0007) -----------------------------------
  private parseLayoutStmt(kw: string, doc: Doc): void {
    if (kw === 'layout') this.parseLayout(doc);
    else if (kw === 'position') this.parsePosition(doc);
    else if (kw === 'pin') this.parsePin(doc);
    else this.parseHide(doc);
  }

  /** Lazily create the single top-level layout block at its first statement. */
  private layoutState(doc: Doc, t: Token, comments: Comments): LayoutState {
    if (doc.layout === undefined) {
      doc.layout = { positions: [], pins: [], hidden: [], hiddenTags: [], pos: tokPos(t) };
    }
    if (comments.length > 0) (doc.layout.comments ??= []).push(...comments);
    return doc.layout;
  }

  private parseLayout(doc: Doc): void {
    const t0 = this.next();
    const comments = this.takeComments();
    const layout = this.layoutState(doc, t0, comments);
    const mode = this.expect('ident').text;
    if (mode === 'saved') {
      layout.directive = { mode: 'saved' };
      return;
    }
    if (mode !== 'auto') this.fail(t0, E.unexpected, `invalid layout mode '${mode}'`);
    const dir = this.expect('ident').text;
    if (!DIRS.has(dir)) this.fail(t0, E.unexpected, `invalid layout dir '${dir}'`);
    layout.directive = { mode: 'auto', dir: dir as Dir };
  }

  private parsePosition(doc: Doc): void {
    const t0 = this.next();
    const comments = this.takeComments();
    const layout = this.layoutState(doc, t0, comments);
    const id = this.ident();
    this.expect('punct', '(');
    const x = this.num(this.next());
    this.expect('punct', ',');
    const y = this.num(this.next());
    this.expect('punct', ')');
    layout.positions.push({ id, x, y });
  }

  private parsePin(doc: Doc): void {
    const t0 = this.next();
    const comments = this.takeComments();
    this.layoutState(doc, t0, comments).pins.push(this.ident());
  }

  private parseHide(doc: Doc): void {
    const t0 = this.next();
    const comments = this.takeComments();
    const layout = this.layoutState(doc, t0, comments);
    const t = this.next();
    if (t.type === 'ident' && t.text === 'tag') {
      layout.hiddenTags.push(this.ident());
      return;
    }
    if (t.type !== 'ident') this.fail(t, E.unexpected, 'hide needs an id');
    layout.hidden.push(this.ident(t));
  }
}

const bcomments = (label: string, steps: FlowStep[], pos: Pos): Branch =>
  ({ label, steps, pos });

/** Parse PDL source; syntax errors abort the file (§2), never throw past API. */
export function parsePDL(source: string): ParseResult {
  const { tokens, diagnostics: lexDiags } = lex(source);
  const p = new Parser(source, tokens);
  try {
    return { doc: p.parseFile(), diagnostics: [...lexDiags, ...p.diags] };
  } catch (e) {
    if (e instanceof Abort) {
      return { doc: null, diagnostics: [...lexDiags, ...p.diags, e.d] };
    }
    throw e;
  }
}
