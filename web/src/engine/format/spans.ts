// SPDX-License-Identifier: GPL-3.0-only
// Statement spans (F-22): map a document entity to the lines of its statement in
// the source text, so the canvas and the code view can highlight each other.
// Works on the raw text (not the IR) because the editor highlights characters.

import { parsePDL } from './parser';

export interface LineSpan {
  /** 1-based first line. */
  from: number;
  /** 1-based last line (inclusive). */
  to: number;
}

/** Brace-aware scan from `startLine` to the line closing the block (or itself). */
function blockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let opened = false;
  for (let i = startLine - 1; i < lines.length; i += 1) {
    for (const ch of lines[i] ?? '') {
      if (ch === '{') {
        depth += 1;
        opened = true;
      } else if (ch === '}') {
        depth -= 1;
        if (opened && depth === 0) return i + 1;
      }
    }
    if (!opened && i === startLine - 1) return startLine; // single-line statement
  }
  return startLine;
}

/** Source span of the object or link statement with `id` (null when absent). */
export function spanOf(text: string, id: string): LineSpan | null {
  const { doc } = parsePDL(text);
  if (doc === null) return null;
  const lines = text.split('\n');
  const obj = doc.objects.find((o) => o.id === id);
  if (obj !== undefined) {
    return { from: obj.pos.line, to: blockEnd(lines, obj.pos.line) };
  }
  const link = doc.links.find((l) => l.id === id);
  if (link !== undefined) return { from: link.pos.line, to: blockEnd(lines, link.pos.line) };
  const flow = doc.flows.find((f) => f.id === id);
  if (flow !== undefined) return { from: flow.pos.line, to: blockEnd(lines, flow.pos.line) };
  return null;
}

/**
 * Id of the object declared on `line` (null when none).
 *
 * Falls back to reading the declaration off the raw line, because a broken
 * statement is exactly the case where the parser has no object to point at.
 */
export function objectAtLine(text: string, line: number): string | null {
  const { doc } = parsePDL(text);
  const lines = text.split('\n');
  if (doc !== null) {
    for (const obj of doc.objects) {
      const span = { from: obj.pos.line, to: blockEnd(lines, obj.pos.line) };
      if (line >= span.from && line <= span.to) return obj.id;
    }
  }
  // Recovery: `kind id ...` — the first two words of the offending line.
  const words = (lines[line - 1] ?? '').trim().replace(/[{};]/g, ' ').trim().split(/\s+/);
  const id = words[1];
  if (words.length < 2 || id === undefined || !OBJECT_KINDS.has(words[0] ?? '')) return null;
  return /^[A-Za-z_][\w-]*$/.test(id) ? id : null;
}

const OBJECT_KINDS = new Set([
  'person',
  'system',
  'system_ext',
  'container',
  'component',
  'datastore',
  'queue',
  'group',
  'note',
]);
