// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP14: the PDL examples that ship in the docs and in the Markdown golden
// fixtures must parse with the TypeScript engine while the same text validates
// through the Go CLI (`bash scripts/check-docs.sh`). Two parsers, one corpus.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';

const DOCS = ['docs/FILE-FORMAT.md', 'docs/USER-GUIDE.md'];

/** ```pcd (or bare ```) blocks whose first line is a PDL header. */
function pcdFences(path: string): string[] {
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line === '```' || line === '```pcd') {
      current = current === null ? [] : (blocks.push(current.join('\n')), null);
      continue;
    }
    current?.push(line);
  }
  // The spec carries inline ← annotations; the gate strips them before parsing.
  // Grammar skeletons use <placeholder> lines, which are notation, not PDL.
  return blocks
    .map((b) => b.replace(/←.*$/gm, ''))
    .filter((b) => b.startsWith('pcd 1.0') && !/^</m.test(b));
}

describe('documented PDL examples', () => {
  it.each(DOCS)('%s parses without error diagnostics', (path) => {
    const fences = pcdFences(path);
    expect(fences.length).toBeGreaterThan(0);
    for (const fence of fences) {
      const result = parsePDL(fence);
      expect(result.doc, fence).not.toBeNull();
      expect(result.diagnostics.filter((d) => d.severity === 'error'), fence).toEqual([]);
    }
  });

  it('every Markdown golden fixture parses without error diagnostics', () => {
    const dir = 'testdata/markdown';
    const files = readdirSync(dir).filter((f) => f.endsWith('.pcd'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const result = parsePDL(readFileSync(`${dir}/${file}`, 'utf8'));
      expect(result.diagnostics.filter((d) => d.severity === 'error'), file).toEqual([]);
    }
  });
});
