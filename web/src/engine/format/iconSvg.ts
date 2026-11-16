// SPDX-License-Identifier: GPL-3.0-only
// Project-icon payload rules (IR v9, FILE-FORMAT §3.1): canonical Base64,
// media-type allowlist, size limits, and a *lexical* SVG safety classifier.
//
// Why lexical and not DOM-based: the same rules must run in the browser, in
// Node tests and in the Go CLI (internal/ir/svg.go is a line-by-line port, and
// TS⇄Go agreement is asserted by testdata/icon-cases.json). A DOM walk cannot
// be replicated in Go without a new dependency (ADR-0004), so the shared rule
// table is defined over the tag/attribute grammar instead. The classifier is
// an *allowlist*: anything not named is refused, which is what keeps unknown
// future SVG features from slipping through.

/** Decoded payload limit for one icon (bytes of SVG source). */
export const ICON_MAX_BYTES = 64 * 1024;
/** Decoded payload limit for the whole document (all declared icons). */
export const ICON_TOTAL_MAX_BYTES = 256 * 1024;
/** Declarations per document. */
export const ICON_MAX_COUNT = 64;

/** Media types a declaration may name. Rasters are a future major version. */
export const ICON_MEDIA_TYPES: readonly string[] = ['image/svg+xml'];

/**
 * Elements a project icon may contain. Deliberately static-drawing only:
 * no script, no animation, no embedded images, no <style>, no <use> of
 * external documents (a fragment-only <use href="#id"> is allowed).
 */
export const ICON_ALLOWED_ELEMENTS: readonly string[] = [
  'svg', 'g', 'defs', 'title', 'desc', 'symbol',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask',
  'use', 'text', 'tspan',
];

/** Attributes a project icon may carry (presentation attributes only). */
export const ICON_ALLOWED_ATTRS: readonly string[] = [
  // structure
  'xmlns', 'xmlns:xlink', 'viewBox', 'width', 'height', 'preserveAspectRatio',
  'id', 'class', 'transform', 'clip-path', 'mask', 'clipPathUnits',
  'maskUnits', 'maskContentUnits', 'gradientUnits', 'gradientTransform',
  'offset', 'stop-color', 'stop-opacity',
  // geometry
  'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'width', 'height', 'points', 'pathLength',
  // paint
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'opacity', 'color', 'vector-effect',
  // text
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'dx', 'dy', 'letter-spacing',
  // linking (fragment-only hrefs; checked separately)
  'href', 'xlink:href',
];

/** Tags that are refused *by name* even though the allowlist would miss them. */
export const ICON_DENIED_ELEMENTS: readonly string[] = [
  'script', 'style', 'foreignObject', 'iframe', 'object', 'embed', 'image',
  'animate', 'animateMotion', 'animateTransform', 'set', 'handler', 'listener',
  'audio', 'video', 'canvas', 'filter', 'pattern', 'marker',
];

/**
 * Attribute value fragments that make a payload refuse-to-render: script
 * URLs, remote fetches inside CSS, and CSS constructs that can escape the
 * static-drawing sandbox.
 */
const UNSAFE_VALUE: readonly [string, string][] = [
  ['javascript:', 'javascript-url'],
  ['vbscript:', 'javascript-url'],
  ['data:text/html', 'javascript-url'],
  ['url(', 'unsafe-css'],
  ['@import', 'unsafe-css'],
  ['expression(', 'unsafe-css'],
  ['&#', 'foreign-entity'],
  ['<!entity', 'foreign-entity'],
];

/** Issue kinds, in the order they are reported (deterministic). */
export const ICON_ISSUE_ORDER: readonly string[] = [
  'malformed', 'script', 'foreign-content', 'event-handler', 'external-ref',
  'javascript-url', 'unsafe-css', 'unknown-element', 'unknown-attribute',
  'foreign-entity', 'too-large',
];

export type IconIssue = string;

/** Base64 alphabet check (standard, padded, no whitespace). */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * True when `data` is canonical Base64: standard alphabet, `=` padding only at
 * the end, length a multiple of four, and no embedded whitespace. Callers that
 * need the bytes use {@link decodeIconBase64}.
 */
export function isCanonicalBase64(data: string): boolean {
  if (data.length === 0 || data.length % 4 !== 0) return false;
  if (!BASE64.test(data)) return false;
  const pad = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  // Padded input must not pad a partial group it does not have.
  return data.length - pad > 0;
}

/** Decoded bytes, or `null` when `data` is not canonical Base64. */
export function decodeIconBase64(data: string): Uint8Array | null {
  if (!isCanonicalBase64(data)) return null;
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode bytes to canonical Base64 (ingest helper; inverse of decode). */
export function encodeIconBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** SVG source text of a payload, or `null` when it does not decode as UTF-8. */
export function decodeIconSvg(data: string): string | null {
  const bytes = decodeIconBase64(data);
  if (bytes === null) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Canonical Base64 for already-validated SVG text. */
export function encodeIconSvg(text: string): string {
  return encodeIconBase64(new TextEncoder().encode(text));
}

/* ---- lexical scan ------------------------------------------------------- */

interface Tag {
  name: string;
  attrs: { name: string; value: string }[];
  close: boolean;
}

/** Namespace prefixes an author may use on allowed attributes. */
const stripPrefix = (name: string): string =>
  name.startsWith('xlink:') ? name : name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;

/** Index just past the comment starting at `i`, or `null` when unterminated. */
function endOfComment(text: string, i: number): number | null {
  const end = text.indexOf('-->', i + 4);
  return end < 0 ? null : end + 3;
}

/** Tag name at `i` (just after `<` or `</`); empty means "not a tag". */
function readName(text: string, i: number): { name: string; next: number } {
  let j = i;
  while (j < text.length && /[A-Za-z0-9:_.-]/.test(text[j] ?? '')) j += 1;
  return { name: text.slice(i, j), next: j };
}

/** Quoted attribute value at `i` (just after `=`); `null` when unterminated. */
function readValue(text: string, i: number): { value: string; next: number } | null {
  const quote = text[i];
  if (quote !== '"' && quote !== "'") return null;
  let j = i + 1;
  while (j < text.length && text[j] !== quote) j += 1;
  return j >= text.length ? null : { value: text.slice(i + 1, j), next: j + 1 };
}

/** Index of the first non-space character at or after `i`. */
const skipSpaces = (text: string, i: number): number => {
  let j = i;
  while (j < text.length && /\s/.test(text[j] ?? '')) j += 1;
  return j;
};

/** One `name="value"` pair at `i`; `null` when the markup is unreadable. */
function readAttr(text: string, i: number): { attr: { name: string; value: string }; next: number } | null {
  let j = i;
  while (j < text.length && !/[\s=/>]/.test(text[j] ?? '')) j += 1;
  const name = text.slice(i, j);
  if (name === '') return null;
  j = skipSpaces(text, j);
  if (text[j] !== '=') return null;
  const value = readValue(text, skipSpaces(text, j + 1));
  return value === null ? null : { attr: { name, value: value.value }, next: value.next };
}

/** Attribute list up to and including the closing `>`; `null` when unreadable. */
function readAttrs(text: string, i: number): { attrs: Tag['attrs']; next: number } | null {
  const attrs: Tag['attrs'] = [];
  let j = i;
  for (;;) {
    j = skipSpaces(text, j);
    if (j >= text.length) return null;
    if (text[j] === '>') return { attrs, next: j + 1 };
    if (text[j] === '/' && text[j + 1] === '>') return { attrs, next: j + 2 };
    const attr = readAttr(text, j);
    if (attr === null) return null;
    attrs.push(attr.attr);
    j = attr.next;
  }
}

/** One element start/end tag at `<`; `null` when it cannot be read as a tag. */
function readTag(text: string, i: number): { tag: Tag; next: number } | null {
  let j = i + 1;
  const close = text[j] === '/';
  if (close) j += 1;
  const read = readName(text, j);
  if (read.name === '' || /^[!?]/.test(read.name)) return null; // DOCTYPE / PI
  const rest = readAttrs(text, read.next);
  return rest === null ? null : { tag: { name: read.name, attrs: rest.attrs, close }, next: rest.next };
}

/**
 * Tokenize the tag stream. Anything the scanner cannot read as a tag (CDATA,
 * a processing instruction, an unterminated attribute) makes it return `null`:
 * the caller reports the payload as malformed rather than guessing at it.
 */
function scanTags(text: string): Tag[] | null {
  const tags: Tag[] = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) return tags;
    if (text.startsWith('<!--', lt)) {
      const next = endOfComment(text, lt);
      if (next === null) return null;
      i = next;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) return null;
    const read = readTag(text, lt);
    if (read === null) return null;
    tags.push(read.tag);
    i = read.next;
  }
  return tags;
}

/** Is this attribute name on the allowlist (directly, prefixed or as ARIA/data)? */
function attrAllowed(name: string): boolean {
  const bare = stripPrefix(name);
  return (
    ICON_ALLOWED_ATTRS.includes(name) ||
    ICON_ALLOWED_ATTRS.includes(bare) ||
    /^(aria|data)-/.test(name) ||
    name === 'role' ||
    name === 'xmlns' ||
    name.startsWith('xmlns:')
  );
}

/** Value fragments that make a payload refuse-to-render. */
function attrValueIssues(value: string, out: Set<IconIssue>): void {
  const lower = value.toLowerCase();
  for (const [needle, kind] of UNSAFE_VALUE) {
    if (lower.includes(needle)) out.add(kind);
  }
}

/** Attributes that name another document; only same-document fragments pass. */
const LINK_ATTRS = new Set(['href', 'src']);

/** Issues found in one tag/attribute pair, appended as kinds. */
function attrIssues(name: string, value: string, out: Set<IconIssue>): void {
  if (/^on/i.test(name)) {
    out.add('event-handler');
    return;
  }
  if (!attrAllowed(name)) out.add('unknown-attribute');
  attrValueIssues(value, out);
  if (LINK_ATTRS.has(stripPrefix(name)) && !value.trim().startsWith('#')) out.add('external-ref');
}

/** Element-level issues, appended as kinds. */
function elementIssues(tag: Tag, out: Set<IconIssue>): void {
  const name = tag.name;
  if (ICON_DENIED_ELEMENTS.includes(name)) {
    out.add(name === 'script' ? 'script' : name === 'foreignObject' ? 'foreign-content' : 'unknown-element');
    return;
  }
  if (!ICON_ALLOWED_ELEMENTS.includes(name)) out.add('unknown-element');
}

/**
 * Lexical allowlist check of an SVG payload (FILE-FORMAT §3.1). Returns the
 * issue kinds found, sorted by {@link ICON_ISSUE_ORDER}; an empty array means
 * the payload is safe to store and to render. Never throws, never parses with
 * a network-capable API: hostile input can only produce issues.
 */
export function svgIssues(text: string): IconIssue[] {
  const out = new Set<IconIssue>();
  if (new TextEncoder().encode(text).length > ICON_MAX_BYTES) out.add('too-large');
  const tags = scanTags(text);
  if (tags === null || !/^<svg[\s>]/i.test(text.trimStart())) out.add('malformed');
  for (const tag of tags ?? []) {
    elementIssues(tag, out);
    for (const attr of tag.attrs) attrIssues(attr.name, attr.value, out);
  }
  if (tags !== null && !tags.some((t) => t.name === 'svg' && !t.close)) out.add('malformed');
  const order = (a: IconIssue, b: IconIssue): number => {
    const ia = ICON_ISSUE_ORDER.indexOf(a);
    const ib = ICON_ISSUE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
  };
  return [...out].sort(order);
}

/** `true` when the payload may be stored and rendered (§3.1). */
export const svgIsSafe = (text: string): boolean => svgIssues(text).length === 0;
