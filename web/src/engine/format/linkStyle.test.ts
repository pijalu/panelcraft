// SPDX-License-Identifier: GPL-3.0-only
// F-12 arrow visual model in the format: head/tail/line/width live in the link
// style block, round-trip losslessly and reject bad values.

import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';

const docOf = (text: string) => {
  const { doc, diagnostics } = parsePDL(text);
  if (doc === null) throw new Error(`parse failed: ${JSON.stringify(diagnostics)}`);
  return doc;
};

const SRC =
  'pcd 1.0\n\nsystem a "A"\nsystem b "B"\n\na -requests-> b as L1 {\n  style {\n    head diamond\n    tail circle\n    line dotted\n    route curved\n    width 2.5\n  }\n}\n';

describe('link style model (F-12)', () => {
  it('parses head/tail/line/width into the link style block', () => {
    const link = docOf(SRC).links[0]!;
    expect(link.style).toMatchObject({
      head: 'diamond', tail: 'circle', line: 'dotted', route: 'curved', width: 2.5,
    });
  });

  it('round-trips print∘parse byte-identically', () => {
    expect(printDoc(docOf(SRC))).toBe(SRC);
  });

  it('carries the keys into IR JSON at the fixed position', () => {
    const json = serializeDoc(docOf(SRC));
    const styleAt = json.indexOf('"style"');
    expect(json.slice(styleAt)).toContain('"head": "diamond"');
    expect(json.slice(styleAt)).toContain('"tail": "circle"');
    expect(json.slice(styleAt)).toContain('"line": "dotted"');
    expect(json.slice(styleAt)).toContain('"route": "curved"');
    expect(json.slice(styleAt)).toContain('"width": 2.5');
  });

  it('rejects an unknown line texture', () => {
    const { doc, diagnostics } = parsePDL(
      'pcd 1.0\n\nsystem a "A"\nsystem b "B"\n\na -> b {\n  style {\n    line dashdot\n  }\n}\n',
    );
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain('invalid line style');
  });

  it('rejects an unknown route mode', () => {
    const { doc, diagnostics } = parsePDL(
      'pcd 1.0\n\nsystem a "A"\nsystem b "B"\n\na -> b {\n  style {\n    route diagonal\n  }\n}\n',
    );
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain('invalid route mode');
  });

  it('keeps an empty style block empty (no keys invented)', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A"\nsystem b "B"\n\na -> b as L\n');
    expect(doc.links[0]?.style).toBeUndefined();
    expect(printDoc(doc)).not.toContain('style {');
  });
});
