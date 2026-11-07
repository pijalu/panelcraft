// SPDX-License-Identifier: GPL-3.0-only
// PDL CodeMirror mode (M4-WP1) — StreamLanguage tokenizer over the M1 lexer's
// token categories (thin wrapper: highlighting only, no parse tree needed for
// a line-oriented grammar). Keywords = statement starters + kinds; arrows and
// colors get their own classes (FR-K1 snapshot-testable highlight classes).
import { StreamLanguage } from '@codemirror/language';

const KEYWORDS = new Set([
  'pcd', 'title', 'level', 'direction', 'theme', 'import', 'person', 'system',
  'system_ext', 'container', 'component', 'datastore', 'queue', 'group',
  'note', 'contains', 'attach', 'icon', 'tag', 'property', 'description',
  'technology', 'style', 'flow', 'view', 'layout', 'position', 'pin',
  'hideTag', 'hide', 'waypoint', 'intro', 'process', 'alt', 'par', 'goto',
  'info', 'conclusion', 'as', 'return', 'end', 'flip',
]);

/** StreamLanguage tokenizer; split into per-category helpers (complexity gate). */
export const pdlStreamLanguage = StreamLanguage.define<PdlState>({
  token(stream, state) {
    if (state.inBlockComment) return skipBlockComment(stream, state);
    return matchToken(stream, state);
  },
  startState: () => ({ inBlockComment: false }),
  blankLine: (_state) => {},
  copyState: (state) => ({ inBlockComment: state.inBlockComment }),
});

/** Structural subset of CM's StringStream used by the PDL tokenizer. */
interface PdlStream {
  match(p: string | RegExp, consume?: boolean): unknown;
  skipTo(s: string): unknown;
  skipToEnd(): void;
  next(): unknown;
  current(): string;
  pos: number;
}

interface PdlState {
  inBlockComment: boolean;
}

function skipBlockComment(stream: PdlStream, state: PdlState): string {
  if (stream.skipTo('*/')) {
    stream.pos += 2; // through */
    state.inBlockComment = false;
  } else {
    stream.skipToEnd();
  }
  return 'comment';
}

function matchToken(stream: PdlStream, state: PdlState): string | null {
  if (stream.match('/*')) {
    state.inBlockComment = true;
    return 'comment';
  }
  if (stream.match('#') || stream.match('//')) {
    stream.skipToEnd();
    return 'comment';
  }
  if (stream.match('"')) return matchString(stream);
  if (stream.match(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/)) return 'number';
  if (stream.match(/<-?>|-\.[^>]*->|--[^>-]*->|=>|-->|->|---/)) return 'keyword';
  if (stream.match(/[0-9]+(\.[0-9]+)?/)) return 'number';
  if (stream.match(/[a-zA-Z_][a-zA-Z0-9_-]*/)) {
    return KEYWORDS.has(stream.current()) ? 'keyword' : 'variableName';
  }
  if (stream.match(/[{}():,]/)) return 'operator';
  stream.next();
  return null;
}

function matchString(stream: PdlStream): string {
  if (stream.skipTo('"')) {
    stream.next();
  } else {
    stream.skipToEnd();
  }
  return 'string';
}
