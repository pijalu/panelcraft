// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { IR_VERSION } from '../model/types';
import { docToState, stateToDoc } from '../../workspace/workspace';

const SOURCE = `pcd 1.0

system auto "Auto"
system back "Back" {
  z -2
}
system zero "Zero" {
  z 0
}
system front "Front" {
  z 4
}
`;

describe('CX-03 object z PDL', () => {
  it('parses, prints and serializes optional integer stacking in IR v6', () => {
    const { doc, diagnostics } = parsePDL(SOURCE);
    expect(diagnostics).toEqual([]);
    expect(doc?.objects.map((o) => o.z)).toEqual([undefined, -2, 0, 4]);
    expect(IR_VERSION).toBe(9);
    expect(printDoc(doc!)).toBe(SOURCE);
    const json = serializeDoc(doc!);
    expect(json).toContain('"z": -2');
    expect(json).toContain('"z": 0');
    expect(json).not.toContain('"id": "auto",\n      "z"');
  });

  it('round-trips z through canvas state and omits auto', () => {
    const { doc } = parsePDL(SOURCE);
    const state = docToState(doc!);
    expect(state.objects.map((o) => o.z)).toEqual([undefined, -2, 0, 4]);
    expect(printDoc(stateToDoc(state))).toBe(SOURCE);
    const auto = stateToDoc({
      ...state,
      objects: state.objects.map((o) => ({ ...o, z: undefined })),
    });
    expect(auto.objects.every((o) => o.z === undefined)).toBe(true);
    expect(printDoc(auto)).not.toContain('z ');
  });

  it.each(['1.5', '-0.25'])('rejects non-integer z %s', (value) => {
    const { doc, diagnostics } = parsePDL(`pcd 1.0\nsystem a "A" {\n  z ${value}\n}\n`);
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain('z must be an integer');
  });

  it('rejects duplicate z attributes', () => {
    const { doc, diagnostics } = parsePDL('pcd 1.0\nsystem a "A" {\n  z 1\n  z 2\n}\n');
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain("duplicate attribute 'z'");
  });
});
