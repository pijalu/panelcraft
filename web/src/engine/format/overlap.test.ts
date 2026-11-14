// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { IR_VERSION } from '../model/types';
import { docToState, stateToDoc } from '../../workspace/workspace';

const source = `pcd 1.0

system a "A"
system b "B"

a -> b as traffic {
  allow overlap
}
`;

describe('CX-02 allow overlap PDL', () => {
  it('parses, prints and serializes the optional true-only override in IR v5', () => {
    const { doc, diagnostics } = parsePDL(source);
    expect(diagnostics).toEqual([]);
    expect(doc?.links[0]).toMatchObject({ allowOverlap: true });
    expect(IR_VERSION).toBe(5);
    expect(printDoc(doc!)).toBe(source);
    expect(serializeDoc(doc!)).toContain('"allowOverlap": true');
  });

  it('round-trips through the canvas workspace projection', () => {
    const { doc } = parsePDL(source);
    const state = docToState(doc!);
    expect(state.links[0]?.allowOverlap).toBe(true);
    expect(stateToDoc(state).links[0]?.allowOverlap).toBe(true);
    expect(stateToDoc({ ...state, links: [{ ...state.links[0]!, allowOverlap: false }] }).links[0]?.allowOverlap)
      .toBeUndefined();
  });

  it('omits the default and rejects duplicate overrides', () => {
    const { doc, diagnostics } = parsePDL('pcd 1.0\na -> b\n');
    expect(diagnostics).toEqual([]);
    expect(doc?.links[0]).not.toHaveProperty('allowOverlap');
    const duplicate = parsePDL(source.replace('allow overlap', 'allow overlap\n  allow overlap'));
    expect(duplicate.doc).toBeNull();
    expect(duplicate.diagnostics[0]?.message).toContain("duplicate attribute 'allow overlap'");
  });
});
