// SPDX-License-Identifier: GPL-3.0-only
// PDL lexer (M1-WP2) — FILE-FORMAT §1. Single pass; errors collected, never
// thrown. Colors are lexical only in `#rgb`/`#rrggbb` shape followed by a
// delimiter; every other `#` starts a comment (errata E-COLOR — M1.md).
export type TokenType =
  | 'ident'
  | 'string'
  | 'number'
  | 'color'
  | 'arrow'
  | 'punct'
  | 'comment'
  | 'eof';

export interface ArrowInfo {
  /** `<` present on the tail side (`<-`, `<->`, `<-t->`). */
  tail: boolean;
  /** `>` head present (`->`, `<->`, `-t->`). */
  head: boolean;
  /** Explicit link type (`-requests->` → `requests`). */
  type?: string;
}

export interface Token {
  type: TokenType;
  /** Raw source text (strings: the decoded value). */
  text: string;
  /** Decoded string value / arrow link type. */
  value?: string;
  arrow?: ArrowInfo;
  line: number;
  col: number;
  start: number;
  end: number;
}

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

import { E, diag, type Diagnostic } from './diagnostics';

interface ScanOut {
  token: Token | null;
  i: number;
  col: number;
}

const mk = (type: TokenType, text: string, i: number, end: number, line: number, col: number, extra?: Partial<Token>): Token =>
  ({ type, text, line, col, start: i, end, ...extra });

const isIdentChar = (c: string | undefined): boolean => c !== undefined && /[a-zA-Z0-9_-]/.test(c);

/** `#` + 3 or 6 hex digits + delimiter → color; otherwise comment. */
function scanHash(src: string, i: number, line: number, col: number, _diags: Diagnostic[]): ScanOut {
  const m = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/.exec(src.slice(i, i + 8));
  const after = m ? src[i + m[0].length] : undefined;
  if (m && (after === undefined || /[\s{}:,)]/.test(after))) {
    return { token: mk('color', m[0], i, i + m[0].length, line, col), i: i + m[0].length, col: col + m[0].length };
  }
  let j = i;
  while (j < src.length && src[j] !== '\n' && src[j] !== '\r') j += 1;
  const text = src.slice(i + 1, j).trim();
  return { token: mk('comment', text, i, j, line, col), i: j, col: col + (j - i) };
}

/** `//` line comment (errata D-M1-19: SPDX header compatibility; `/` has no
 * other grammar use). Text stored without the slashes, like `#` comments. */
function scanSlash(src: string, i: number, line: number, col: number, diags: Diagnostic[]): ScanOut {
  if (src[i + 1] !== '/') {
    diags.push(diag(E.unexpected, `unexpected character '/'`, line, col));
    return { token: null, i: i + 1, col: col + 1 };
  }
  let j = i + 2;
  while (j < src.length && src[j] !== '\n' && src[j] !== '\r') j += 1;
  const text = src.slice(i + 2, j).trim();
  return { token: mk('comment', text, i, j, line, col), i: j, col: col + (j - i) };
}

function scanString(src: string, i: number, line: number, col: number, diags: Diagnostic[]): ScanOut {
  let j = i + 1;
  let value = '';
  while (j < src.length && src[j] !== '"' && src[j] !== '\n') {
    if (src[j] === '\\') {
      const nxt = src[j + 1];
      if (nxt === '"' || nxt === '\\') {
        value += nxt;
        j += 2;
      } else {
        diags.push(diag(E.invalidEscape, `invalid escape \\${nxt ?? ''}`, line, col));
        j += 1;
      }
      continue;
    }
    value += src[j];
    j += 1;
  }
  if (src[j] !== '"') {
    diags.push(diag(E.unterminatedString, 'unterminated string', line, col));
    return { token: mk('string', value, i, j, line, col, { value }), i: j, col: col + (j - i) };
  }
  return { token: mk('string', value, i, j + 1, line, col, { value }), i: j + 1, col: col + (j + 1 - i) };
}

/** Arrow grammar: [`<`] `-` [ ident `-` ] [`>`]; needs a head or a tail. */
const scanArrow = (src: string, i: number, line: number, col: number): { arrow?: ArrowInfo; len: number; error?: Diagnostic } => {
  let j = i;
  let tail = false;
  if (src[j] === '<') {
    tail = true;
    j += 1;
  }
  if (src[j] !== '-') return { arrow: undefined, len: 0, error: diag(E.invalidArrow, `stray '${src[i]}'`, line, col) };
  j += 1;
  let type: string | undefined;
  const ident = /^[a-z][a-z0-9_-]{0,63}/.exec(src.slice(j, j + 65));
  if (ident) {
    // ident class includes '-'; a trailing dash belongs to the arrow, not the type
    const name = ident[0].replace(/-+$/, '');
    if (name.length > 0 && src[j + name.length] === '-') {
      type = name;
      j += name.length + 1;
    }
  }
  let head = false;
  if (src[j] === '>') {
    head = true;
    j += 1;
  }
  if (!head && (!tail || type)) {
    return { arrow: undefined, len: 0, error: diag(E.invalidArrow, 'arrow needs a head or tail', line, col) };
  }
  return { arrow: { tail, head, type }, len: j - i };
};

function scanDash(src: string, i: number, line: number, col: number, diags: Diagnostic[]): ScanOut {
  // signed number when a digit follows the dash
  if (src[i] === '-' && /[0-9]/.test(src[i + 1] ?? '')) return scanNumber(src, i, line, col, diags);
  const res = scanArrow(src, i, line, col);
  if (res.error) {
    diags.push(res.error);
    return { token: null, i: i + 1, col: col + 1 };
  }
  const t = mk('arrow', src.slice(i, i + res.len), i, i + res.len, line, col, { arrow: res.arrow });
  return { token: t, i: i + res.len, col: col + res.len };
}

function scanNumber(src: string, i: number, line: number, col: number, diags: Diagnostic[]): ScanOut {
  const m = /^-?[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i, i + 64));
  if (!m) {
    diags.push(diag(E.invalidNumber, 'invalid number', line, col));
    return { token: null, i: i + 1, col: col + 1 };
  }
  return { token: mk('number', m[0], i, i + m[0].length, line, col), i: i + m[0].length, col: col + m[0].length };
}

function scanIdent(src: string, i: number, line: number, col: number, diags: Diagnostic[]): ScanOut {
  const idm = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}/.exec(src.slice(i, i + 66));
  if (!idm) {
    diags.push(diag(E.unexpected, `unexpected character '${src[i]}'`, line, col));
    return { token: null, i: i + 1, col: col + 1 };
  }
  if (isIdentChar(src[i + idm[0].length])) {
    // identifier runs longer than 64 chars are invalid (§1)
    let j = i;
    while (j < src.length && isIdentChar(src[j])) j += 1;
    diags.push(diag(E.invalidIdent, 'identifier longer than 64 chars', line, col));
    return { token: null, i: j, col: col + (j - i) };
  }
  return { token: mk('ident', idm[0], i, i + idm[0].length, line, col), i: i + idm[0].length, col: col + idm[0].length };
}

function scanToken(src: string, i: number, line: number, col: number, diags: Diagnostic[]): ScanOut {
  const ch: string = src[i]!;
  if (ch === '#') return scanHash(src, i, line, col, diags);
  if (ch === '/') return scanSlash(src, i, line, col, diags);
  if (ch === '"') return scanString(src, i, line, col, diags);
  if (ch === '-' || ch === '<') return scanDash(src, i, line, col, diags);
  if (/[0-9]/.test(ch)) return scanNumber(src, i, line, col, diags);
  if (/[{}():,.]/.test(ch)) return { token: mk('punct', ch, i, i + 1, line, col), i: i + 1, col: col + 1 };
  return scanIdent(src, i, line, col, diags);
}

export function lex(src: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      i += 1;
      line += 1;
      col = 1;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      i += 1;
      col += 1;
      continue;
    }
    const out = scanToken(src, i, line, col, diagnostics);
    if (out.token) tokens.push(out.token);
    i = out.i;
    col = out.col;
  }
  tokens.push(mk('eof', '', src.length, src.length, line, 1));
  return { tokens, diagnostics };
}
