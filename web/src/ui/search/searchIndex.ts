// SPDX-License-Identifier: GPL-3.0-only
// Quick search index + fuzzy matcher (M6-WP5, FR-W6): files, objects, flows
// across the workspace; subsequence scoring with contiguity bonus. Pure.
import { parsePDL } from '../../engine/format/parser';

export type SearchKind = 'file' | 'object' | 'flow';

export interface SearchEntry {
  kind: SearchKind;
  /** File the entry lives in (files use their own path). */
  path: string;
  /** Object/flow id within the file (files: undefined). */
  id?: string;
  /** Primary label (name / title / path). */
  label: string;
  /** Secondary text (haystack includes this). */
  sub?: string;
}

/** Lower = better; Infinity = no match. Case-insensitive subsequence match
 * with gap costs, word-start bonuses, and a tight-haystack penalty. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 0; // empty query: neutral, stable order
  let ti = 0;
  let score = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    const found = t.indexOf(ch, ti);
    if (found === -1) return Infinity;
    score += found - ti; // gap cost (0 when contiguous)
    const prev = found === 0 ? ' ' : t[found - 1]!;
    if (prev === ' ' || prev === '/') score -= 2; // word-start bonus
    ti = found + 1;
  }
  return score + (t.length - q.length) * 0.1; // prefer tight haystacks
}

/** Search the index: scored, stable-sorted (kind/file order for ties). */
export function search(entries: SearchEntry[], query: string, limit = 20): Array<SearchEntry & { score: number }> {
  const hits: Array<SearchEntry & { score: number }> = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const score = Math.min(fuzzyScore(query, e.label), fuzzyScore(query, e.id ?? ''), fuzzyScore(query, e.sub ?? ''));
    if (score !== Infinity) hits.push({ ...e, score: score + i * 1e-6 }); // stable tie-break
  }
  hits.sort((a, b) => a.score - b.score);
  return hits.slice(0, limit);
}

/** Build the workspace-wide index: files, then objects, then flows per file. */
export function buildIndex(files: Array<{ path: string; content: string }>): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const f of files) {
    out.push({ kind: 'file', path: f.path, label: f.path });
    const { doc } = parsePDL(f.content);
    if (!doc) continue; // unparsable file: still searchable as a file
    for (const o of doc.objects) {
      out.push({ kind: 'object', path: f.path, id: o.id, label: o.name ?? o.id, sub: o.id });
    }
    for (const fl of doc.flows) {
      out.push({ kind: 'flow', path: f.path, id: fl.id, label: fl.title ?? fl.id ?? 'flow', sub: fl.id ?? '' });
    }
  }
  return out;
}
