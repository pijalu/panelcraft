// SPDX-License-Identifier: GPL-3.0-only
// FLOW-02: connector spark settings are optional link-style data — parsed,
// printed only when present, round-tripped through the workspace, and validated
// against safe bounds.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { docToState, stateToDoc } from '../../workspace/workspace';

const DOC = `pcd 1.0

system a "A"
system b "B"

a -requests-> b as L1 {
  style {
    sparks 3
    speed 2
  }
}
`;

const linkOf = (src: string) => parsePDL(src).doc?.links[0];

const diagOf = (src: string) => parsePDL(src).diagnostics.map((d) => `${d.code}:${d.message}`);

describe('FLOW-02 spark format', () => {
  it('parses and reprints sparks and speed minimally', () => {
    const doc = parsePDL(DOC).doc!;
    expect(doc.links[0]?.style?.sparks).toBe(3);
    expect(doc.links[0]?.style?.speed).toBe(2);
    const printed = printDoc(doc);
    expect(printed).toContain('sparks 3');
    expect(printed).toContain('speed 2');
    expect(printDoc(parsePDL(printed).doc!)).toBe(printed);
    // defaults stay unprinted
    const plain = printDoc(parsePDL('pcd 1.0\na -> b as L1\n').doc!);
    expect(plain).not.toContain('sparks');
    expect(plain).not.toContain('speed');
  });

  it('serializes both fields into the IR', () => {
    const doc = parsePDL(DOC).doc!;
    const ir = JSON.parse(serializeDoc(doc)) as { links: Record<string, unknown>[] };
    const style = ir.links[0]?.['style'] as Record<string, unknown>;
    expect(style['sparks']).toBe(3);
    expect(style['speed']).toBe(2);
  });

  it('round-trips through the workspace canvas state', () => {
    const doc = parsePDL(DOC).doc!;
    const state = docToState(doc, undefined);
    expect(state.links[0]?.sparks).toBe(3);
    expect(state.links[0]?.speed).toBe(2);
    const back = stateToDoc(state);
    expect(back.links[0]?.style?.sparks).toBe(3);
    expect(back.links[0]?.style?.speed).toBe(2);
  });

  it('rejects counts and speeds outside the documented bounds', () => {
    for (const bad of ['sparks 0', 'sparks 9', 'sparks 1.5']) {
      expect(diagOf(`pcd 1.0\na -> b {\n  style {\n    ${bad}\n  }\n}\n`).length, bad).toBeGreaterThan(0);
    }
    for (const bad of ['speed 0', 'speed 5', 'speed -1']) {
      expect(diagOf(`pcd 1.0\na -> b {\n  style {\n    ${bad}\n  }\n}\n`).length, bad).toBeGreaterThan(0);
    }
    expect(diagOf(`pcd 1.0\na -> b {\n  style {\n    sparks 8\n    speed 4\n  }\n}\n`)).toEqual([]);
  });

  it('reports duplicate spark fields like other link style keys', () => {
    const diags = diagOf('pcd 1.0\na -> b {\n  style {\n    sparks 2\n    sparks 3\n  }\n}\n');
    expect(diags.some((d) => d.includes('sparks'))).toBe(true);
    expect(linkOf('pcd 1.0\na -> b {\n  style {\n    sparks 2\n  }\n}\n')?.style?.sparks).toBe(2);
  });
});
