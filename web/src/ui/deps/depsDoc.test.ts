// SPDX-License-Identifier: GPL-3.0-only
// Dependencies view model tests (M6-WP4).
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../../engine/format/parser';
import type { Doc } from '../../engine/model/types';
import { effectiveView } from '../views/viewDoc';
import { adjacency, canvasLinkId, depsFade } from './depsDoc';

function docOf(src: string): Doc {
  const { doc } = parsePDL(src);
  if (doc === null) throw new Error('parse failed');
  return doc;
}

const SRC = `pcd 1.0
system api "API"
system db "DB"
system web "Web"
system auth "Auth"
api -> db as L1
api -> db : "cache" as L2
web -> api
auth -> api : "verify"
`;

describe('adjacency', () => {
  it('splits incoming/outgoing with peers, labels, types', () => {
    const adj = adjacency(docOf(SRC), 'api');
    expect(adj.outgoing.map((e) => [e.peerId, e.type])).toEqual([['db', 'uses'], ['db', 'uses']]);
    expect(adj.incoming.map((e) => e.peerId)).toEqual(['web', 'auth']);
    expect(adj.incoming.find((e) => e.peerId === 'auth')?.label).toBe('verify');
    expect(adj.incoming.find((e) => e.peerId === 'auth')?.linkId).toBe('auth-api');
  });

  it('keeps explicit link ids on multi-edges', () => {
    const adj = adjacency(docOf(SRC), 'db');
    expect(adj.incoming.map((e) => e.linkId)).toEqual(['L1', 'L2']);
  });

  it('isolated object → empty adjacency', () => {
    const adj = adjacency(docOf(SRC), 'nosuch');
    expect(adj.incoming).toEqual([]);
    expect(adj.outgoing).toEqual([]);
  });
});

describe('depsFade', () => {
  it('active id: everything except the object + its neighbors fades', () => {
    const d = docOf(SRC);
    const ev = effectiveView(d);
    const f = depsFade(d, ev, 'api');
    expect(f.objects.has('db')).toBe(false); // neighbor
    expect(f.objects.has('web')).toBe(false); // neighbor
    expect(f.objects.has('auth')).toBe(false);
    expect(f.objects.has('api')).toBe(false); // focus stays crisp
    expect(f.links.size).toBe(0); // all adjacent
  });

  it('non-adjacent links fade in focus mode', () => {
    const d = docOf(SRC + 'db -> auth\n');
    const f = depsFade(d, effectiveView(d), 'api');
    expect(f.links.has('db-auth')).toBe(true);
    expect(f.links.has('L1')).toBe(false);
  });

  it('no active id → view fade passes through (tag filter still works)', () => {
    const d = docOf(SRC);
    const ev = effectiveView(docOf('pcd 1.0\nview "V" {\n hide tag x\n}\n'), 'V');
    const f = depsFade(d, ev, null);
    expect(f.objects.size).toBe(4); // untagged all fade
    const f2 = depsFade(d, effectiveView(d), null);
    expect(f2.objects.size).toBe(0);
  });

  it('unknown active id falls back to view fade', () => {
    const d = docOf(SRC);
    const f = depsFade(d, effectiveView(d), 'ghost');
    expect(f.objects.size).toBe(0);
  });
});

describe('canvasLinkId', () => {
  it('explicit id wins, else from-to pair', () => {
    expect(canvasLinkId('a', 'b', 'L9')).toBe('L9');
    expect(canvasLinkId('a', 'b')).toBe('a-b');
  });
});
