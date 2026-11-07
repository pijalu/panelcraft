// SPDX-License-Identifier: GPL-3.0-only
// F-13 `size <w> <h>` object attribute (IR v2): parse, print, round-trip and
// validation of the value. The attribute is presentation geometry, optional
// and positive; absent = the kind's default shape.

import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';

const docOf = (text: string) => {
  const { doc, diagnostics } = parsePDL(text);
  if (doc === null) throw new Error(`parse failed: ${JSON.stringify(diagnostics)}`);
  return doc;
};

describe('size attribute (F-13)', () => {
  it('parses w/h into the IR', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A" {\n  size 200 96\n}\n');
    expect(doc.objects[0]?.size).toEqual({ w: 200, h: 96 });
  });

  it('prints inside the object block and round-trips byte-identically', () => {
    const src = 'pcd 1.0\n\nsystem a "A" {\n  size 200 96\n}\n';
    const once = printDoc(docOf(src));
    expect(once).toBe(src);
    expect(printDoc(docOf(once))).toBe(once);
  });

  it('omits `size` when absent (no churn for untouched objects)', () => {
    const out = printDoc(docOf('pcd 1.0\n\nsystem a "A"\n'));
    expect(out).not.toContain('size');
  });

  it('appears in IR JSON as {w,h} at the fixed key position', () => {
    const json = serializeDoc(docOf('pcd 1.0\n\nsystem a "A" {\n  size 200 96\n}\n'));
    expect(json).toContain('"size": {');
    expect(json).toContain('"w": 200');
    expect(json).toContain('"h": 96');
    // irVersion bumped to 2 with the schema change
    expect(json).toContain('"irVersion": 2');
  });

  it('rejects a non-positive size', () => {
    const { doc, diagnostics } = parsePDL('pcd 1.0\n\nsystem a "A" {\n  size 0 10\n}\n');
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain('size must be positive');
  });

  it('rejects a duplicate size attribute', () => {
    const { doc, diagnostics } = parsePDL(
      'pcd 1.0\n\nsystem a "A" {\n  size 10 10\n  size 20 20\n}\n',
    );
    expect(doc).toBeNull();
    expect(diagnostics[0]?.code).toBe('E110'); // duplicate attribute
  });
});
