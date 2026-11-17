// SPDX-License-Identifier: GPL-3.0-only
// An embedded child is a document inside its root file, never a fake VFS file.
// Its identity is the root path plus the owning object/path chain.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import {
  embeddedTree, resolveDocument, rootRef, writeDocument, type DocumentRef,
} from './documents';

const ROOT = `pcd 1.0
title "Root"
level context

system shop "Webshop" {
  drilldown embedded "containers/shop.pcd" {
    pcd 1.0
    title "Containers"
    level container

    container api "API" {
      drilldown embedded "components/api.pcd" {
        pcd 1.0
        title "Components"
        level component
        component handler "Handler"
      }
    }
    container worker "Worker"
  }
}
`;

describe('embedded document references', () => {
  it('projects embedded children as a derived tree with stable owner/path identity', () => {
    const doc = parsePDL(ROOT).doc!;
    const tree = embeddedTree('root.pcd', doc);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe('containers/shop.pcd');
    expect(tree[0]?.label).toBe('Containers');
    expect(tree[0]?.ref.segments[0]).toEqual({ path: 'containers/shop.pcd', objectId: 'shop' });
    expect(tree[0]?.children.map((c) => c.path)).toEqual(['containers/components/api.pcd']);
    expect(tree[0]?.children[0]?.ref.segments).toHaveLength(2);
  });

  it('resolves a nested document and its canonical text from the root alone', () => {
    const ref = embeddedTree('root.pcd', parsePDL(ROOT).doc!)[0]!.children[0]!.ref;
    const resolved = resolveDocument('root.pcd', ROOT, ref);
    expect(resolved?.doc.title).toBe('Components');
    expect(resolved?.text).toContain('component handler "Handler"');
  });

  it('writes a nested edit into the root without a second VFS file', () => {
    const ref = embeddedTree('root.pcd', parsePDL(ROOT).doc!)[0]!.ref;
    const resolved = resolveDocument('root.pcd', ROOT, ref)!;
    const next = {
      ...resolved.doc,
      objects: [...resolved.doc.objects, {
        kind: 'container' as const,
        id: 'queue',
        name: 'Queue',
        pos: { line: 1, col: 1 },
      }],
    };
    const written = writeDocument('root.pcd', ROOT, ref, next);
    expect(written).not.toBeNull();
    expect(written).toContain('title "Root"');
    expect(written).toContain('container worker "Worker"');
    expect(written).toContain('container queue "Queue"');
    expect(resolveDocument('root.pcd', written!, ref)?.doc.objects.map((o) => o.id))
      .toEqual(['api', 'worker', 'queue']);
    // The original text is untouched: callers commit one canonical root write.
    expect(parsePDL(ROOT).doc!.objects[0]?.drilldown?.kind).toBe('embedded');
    expect(printDoc(parsePDL(ROOT).doc!)).toBe(printDoc(parsePDL(ROOT).doc!));
  });

  it('recovers selection by owning object when a logical path changes', () => {
    const original = embeddedTree('root.pcd', parsePDL(ROOT).doc!)[0]!.ref;
    const changed = ROOT.replace('containers/shop.pcd', 'containers/new-shop.pcd');
    const recovered = resolveDocument('root.pcd', changed, original);
    expect(recovered?.doc.title).toBe('Containers');
  });

  it('returns null when a selected child was removed', () => {
    const ref: DocumentRef = {
      root: 'root.pcd',
      segments: [{ path: 'gone.pcd', objectId: 'gone' }],
    };
    expect(resolveDocument('root.pcd', ROOT, ref)).toBeNull();
    expect(writeDocument('root.pcd', ROOT, ref, parsePDL(ROOT).doc!)).toBeNull();
    expect(resolveDocument('root.pcd', ROOT, rootRef('root.pcd'))?.doc.title).toBe('Root');
  });
});
