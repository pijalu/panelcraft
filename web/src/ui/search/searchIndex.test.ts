// SPDX-License-Identifier: GPL-3.0-only
// Quick search index tests (M6-WP5).
import { describe, expect, it } from 'vitest';
import { buildIndex, fuzzyScore, search, type SearchEntry } from './searchIndex';

const FILES = [
  { path: 'checkout/checkout.pcd', content: 'pcd 1.0\nsystem api "Checkout API" { tag core }\nsystem db "Orders DB"\napi -> db\nflow "Buy" as buy {\n intro "go"\n}\n' },
  { path: 'billing.pcd', content: 'pcd 1.0\nsystem inv "Invoicing"\nflow "Refund" as refund {\n}\n' },
  { path: 'notes.txt', content: 'this is not pdl at all {{{' },
];

describe('fuzzyScore', () => {
  it('exact prefix beats scattered match', () => {
    expect(fuzzyScore('api', 'api')).toBeLessThan(fuzzyScore('api', 'auth -> paid invoice'));
  });

  it('no match → Infinity', () => {
    expect(fuzzyScore('zzz', 'api')).toBe(Infinity);
  });

  it('empty query is neutral', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('word-start bonus ranks "Orders DB" high for "db" vs a scattered match', () => {
    const good = fuzzyScore('db', 'Orders DB');
    const bad = fuzzyScore('db', 'abracadabra');
    expect(good).toBeLessThan(bad);
  });
});

describe('search', () => {
  const entries: SearchEntry[] = [
    { kind: 'file', path: 'checkout/checkout.pcd', label: 'checkout/checkout.pcd' },
    { kind: 'object', path: 'checkout/checkout.pcd', id: 'api', label: 'Checkout API', sub: 'api' },
    { kind: 'object', path: 'checkout/checkout.pcd', id: 'db', label: 'Orders DB', sub: 'db' },
    { kind: 'flow', path: 'checkout/checkout.pcd', id: 'buy', label: 'Buy', sub: 'buy' },
    { kind: 'object', path: 'billing.pcd', id: 'inv', label: 'Invoicing', sub: 'inv' },
  ];

  it('ranks label matches first; returns kind/path/id', () => {
    const hits = search(entries, 'ch');
    expect(hits[0]).toMatchObject({ kind: 'object', id: 'api', path: 'checkout/checkout.pcd' }); // "Checkout API"
    expect(hits[1]).toMatchObject({ kind: 'file' }); // the checkout file path
    expect(hits[0]!.score).toBeLessThan(hits[1]!.score);
  });

  it('matches ids and secondary text too', () => {
    const hits = search(entries, 'buy');
    expect(hits[0]).toMatchObject({ kind: 'flow', id: 'buy' });
    const byId = search(entries, 'inv');
    expect(byId[0]).toMatchObject({ kind: 'object', id: 'inv' });
  });

  it('limit caps results; empty query lists everything (stable order)', () => {
    expect(search(entries, 'zzz')).toHaveLength(0);
    expect(search(entries, '', 3)).toHaveLength(3);
    const all = search(entries, '');
    expect(all.map((h) => h.label)).toEqual(entries.map((e) => e.label));
  });
});

describe('buildIndex', () => {
  it('indexes files, objects, flows; skips unparsable content beyond the file entry', () => {
    const idx = buildIndex(FILES);
    expect(idx.filter((e) => e.kind === 'file').map((e) => e.path)).toEqual(FILES.map((f) => f.path));
    const co = idx.filter((e) => e.path === 'checkout/checkout.pcd');
    expect(co.some((e) => e.kind === 'object' && e.id === 'api' && e.label === 'Checkout API')).toBe(true);
    expect(co.some((e) => e.kind === 'object' && e.id === 'db')).toBe(true);
    expect(co.some((e) => e.kind === 'flow' && e.id === 'buy' && e.label === 'Buy')).toBe(true);
    expect(idx.filter((e) => e.path === 'billing.pcd' && e.kind === 'flow')).toHaveLength(1);
    // unparsable .txt: file entry only
    expect(idx.filter((e) => e.path === 'notes.txt')).toHaveLength(1);
  });
});
