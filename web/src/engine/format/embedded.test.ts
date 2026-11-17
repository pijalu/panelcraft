// SPDX-License-Identifier: GPL-3.0-only
// Discriminated decomposition targets: linked paths and recursively embedded
// documents are different IR values, never an optional path/document pair.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { IR_VERSION, type Drilldown } from '../model/types';

const asEmbedded = (target: Drilldown | undefined): Extract<Drilldown, { kind: 'embedded' }> => {
  if (target?.kind !== 'embedded') throw new Error('expected an embedded target');
  return target;
};

const EMBEDDED = `pcd 1.0
title "Context"
level context

system shop "Webshop" {
  drilldown embedded "containers/shop.pcd" {
    pcd 1.0
    title "Containers"
    level container
    container api "API" {
      source {
        language "go"
        text "func Run() {}"
      }
      drilldown "components/api.pcd"
    }
    system worker "Worker" {
      drilldown embedded "containers/worker.pcd" {
        pcd 1.0
        title "Worker"
        level component
        component job "Job"
      }
    }
  }
}
`;

describe('embedded decomposition target', () => {
  it('keeps a linked path as a discriminated linked target', () => {
    const { doc } = parsePDL('pcd 1.0\nsystem a "A" {\n  drilldown "a.pcd"\n}\n');
    expect(doc?.objects[0]?.drilldown).toEqual({ kind: 'linked', path: 'a.pcd' });
  });

  it('parses an embedded child as a logical path plus a recursive document', () => {
    const { doc, diagnostics } = parsePDL(EMBEDDED);
    expect(diagnostics).toEqual([]);
    const target = asEmbedded(doc?.objects[0]?.drilldown);
    expect(target.path).toBe('containers/shop.pcd');
    expect(target.doc.title).toBe('Containers');
    expect(target.doc.level).toBe('container');
    expect(target.doc.objects.map((o) => o.id)).toEqual(['api', 'worker']);
    // Source text stays a separate concept rather than becoming a child diagram.
    expect(target.doc.objects[0]?.source?.lines).toEqual(['func Run() {}']);
    expect(target.doc.objects[0]?.drilldown).toEqual({ kind: 'linked', path: 'components/api.pcd' });
    const nested = asEmbedded(target.doc.objects[1]?.drilldown);
    expect(nested.path).toBe('containers/worker.pcd');
    expect(nested.doc.objects[0]?.id).toBe('job');
    // Positions stay relative to the whole file, so diagnostics point at real lines.
    expect(target.doc.objects[0]?.pos.line).toBe(10);
  });

  it('prints and re-parses embedded children without losing the nesting', () => {
    const first = parsePDL(EMBEDDED).doc;
    expect(first).not.toBeNull();
    const text = printDoc(first!);
    expect(text).toContain('drilldown embedded "containers/shop.pcd" {');
    expect(text).toContain('    pcd 1.0');
    const second = parsePDL(text).doc;
    expect(second).not.toBeNull();
    expect(printDoc(second!)).toBe(text);
  });

  it('serializes the discriminant and the recursive document in canonical IR', () => {
    const doc = parsePDL(EMBEDDED).doc!;
    const ir = JSON.parse(serializeDoc(doc));
    expect(ir.irVersion).toBe(IR_VERSION);
    expect(ir.objects[0].drilldown.kind).toBe('embedded');
    expect(ir.objects[0].drilldown.path).toBe('containers/shop.pcd');
    expect(ir.objects[0].drilldown.doc.title).toBe('Containers');
    expect(ir.objects[0].drilldown.doc.objects[1].drilldown.kind).toBe('embedded');
  });

  it('rejects an embedded child without a complete nested document', () => {
    const { doc, diagnostics } = parsePDL(`pcd 1.0
system a "A" {
  drilldown embedded "b.pcd" {
    title "no magic line"
  }
}
`);
    expect(doc).toBeNull();
    expect(diagnostics.some((d) => d.code === 'E103')).toBe(true);
  });
});
