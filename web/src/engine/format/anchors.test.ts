// SPDX-License-Identifier: GPL-3.0-only
// CX-01 optional normalized endpoint anchors in PDL and canonical IR.

import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { IR_VERSION } from '../model/types';

const SOURCE = `pcd 1.0

system a "A"
system b "B"

a -> b as L1 {
  anchor from 0.25
  anchor to 0.875
  waypoint (180, 100)
}
`;

describe('link endpoint anchors (CX-01)', () => {
  it('parses, prints and serializes complete anchors with current IR', () => {
    const { doc, diagnostics } = parsePDL(SOURCE);
    expect(diagnostics).toEqual([]);
    expect(doc?.links[0]).toMatchObject({ fromAnchor: 0.25, toAnchor: 0.875 });
    expect(IR_VERSION).toBe(6);
    expect(printDoc(doc!)).toBe(SOURCE);
    const json = serializeDoc(doc!);
    expect(json).toContain('"fromAnchor": 0.25');
    expect(json).toContain('"toAnchor": 0.875');
  });

  it('round-trips absent and partial anchors without inventing values', () => {
    for (const body of ['', '  anchor from 0\n']) {
      const source = `pcd 1.0\n\na -> b${body ? ` {\n${body}}` : ''}\n`;
      const { doc, diagnostics } = parsePDL(source);
      expect(diagnostics).toEqual([]);
      expect(doc?.links[0]?.fromAnchor).toBe(body ? 0 : undefined);
      expect(doc?.links[0]?.toAnchor).toBeUndefined();
      expect(printDoc(doc!)).toBe(source);
    }
  });

  it.each(['-0.01', '1', '1.5'])('rejects out-of-range anchor %s', (value) => {
    const { doc, diagnostics } = parsePDL(`pcd 1.0\na -> b {\n  anchor to ${value}\n}\n`);
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain('expected 0 <= anchor < 1');
  });

  it('rejects a duplicate endpoint anchor', () => {
    const { doc, diagnostics } = parsePDL(SOURCE.replace('  anchor to 0.875\n', '  anchor from 0.5\n'));
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain("duplicate attribute 'anchor from'");
  });
});
