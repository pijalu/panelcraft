// SPDX-License-Identifier: GPL-3.0-only
// Canonical printer tests (M1-WP3): §11 rules, idempotence fuzz (seeded),
// round-trip property print∘parse∘print + IR equality modulo positions.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { forAllSeeds, type Rng } from './fuzz';
import {
  IR_VERSION, type Doc, type Flow, type FlowStep, type ImportStmt, type Link,
  type Obj, type Pos, type StyleStmt, type View, type ViewLine,
} from '../model/types';
import { serializeDoc } from '../model/serialize';
import { CHECKOUT_SRC } from './format.testdata';

const ID_POOL = ['user', 'shop', 'api', 'db', 'events', 'psp', 'ctx', 'n1'] as const;
const KINDS = ['person', 'system', 'system_ext', 'container', 'component', 'datastore', 'queue', 'group', 'note'] as const;
const NASTY = [
  'plain', 'with space', 'quote " inside', 'back\\slash', 'hash # not comment',
  'unicode é☃ 字', 'trailing  ', ' leading', '', 'L1',
] as const;

const pos = (n: number): Pos => ({ line: n, col: 1 });

const genObject = (rng: Rng, id: string): Obj => ({
  kind: rng.pick(KINDS),
  id,
  name: rng.bool(0.8) ? rng.pick(NASTY) : undefined,
  description: rng.bool(0.5) ? rng.pick(NASTY) : undefined,
  technology: rng.bool(0.4) ? rng.pick(NASTY) : undefined,
  tags: rng.bool(0.4) ? rng.some(['core', 'pci', 'web'], 3) : undefined,
  properties: rng.bool(0.3) ? [{ key: 'owner', value: rng.pick(NASTY) }] : undefined,
  contains: rng.bool(0.2) ? ['api', 'db'].slice(0, 1 + rng.int(2)) : undefined,
  attach: rng.bool(0.2) ? 'api' : undefined,
  icon: rng.bool(0.2) ? 'cloud' : undefined,
  comments: rng.bool(0.3) ? ['note about ' + id] : undefined,
  pos: pos(0),
});

const genAtomicStep = (rng: Rng, roll: number, p: Pos): FlowStep => {
  if (roll < 0.55) {
    return {
      type: 'msg', from: rng.pick(ID_POOL), to: rng.pick(ID_POOL), pos: p,
      label: rng.bool(0.6) ? rng.pick(NASTY) : undefined,
      linkRef: rng.bool(0.4) ? 'L1' : undefined,
      flip: rng.bool(0.2) || undefined,
    };
  }
  if (roll < 0.7) return { type: 'process', target: rng.pick(ID_POOL), text: rng.bool(0.5) ? rng.pick(NASTY) : undefined, pos: p };
  if (roll < 0.8) return { type: 'goto', flow: 'other', file: rng.bool(0.3) ? 'billing/refunds.pcd' : undefined, ret: rng.bool(0.3) ? 'here' : undefined, pos: p };
  return { type: 'intro', text: rng.pick(NASTY), pos: p };
};

const genStep = (rng: Rng, depth: number): FlowStep => {
  const roll = rng.next();
  const p = pos(0);
  if (depth < 2 && roll < 0.15) {
    return {
      type: 'alt', label: rng.pick(NASTY), pos: p,
      branches: [0, 1].map((i) => ({ label: `branch ${i}`, steps: [genStep(rng, depth + 1)], pos: p })),
    };
  }
  if (depth < 2 && roll < 0.3) {
    return { type: 'par', label: rng.pick(NASTY), pos: p, lanes: [[genStep(rng, depth + 1)], []] };
  }
  if (roll < 0.9) return genAtomicStep(rng, roll, p);
  return { type: 'conclusion', text: rng.pick(NASTY), pos: p };
};

const genLink = (rng: Rng, uniq: string[]): Link => ({
  from: uniq[0]!, to: uniq[1]!, id: 'L1',
  type: rng.bool(0.4) ? 'requests' : undefined,
  label: rng.bool(0.8) ? rng.pick(NASTY) : undefined,
  bidir: rng.bool(0.2) || undefined,
  waypoints: rng.bool(0.3) ? [[120, 300] as [number, number]] : undefined,
  pos: pos(0),
});

const genImport = (rng: Rng): ImportStmt => ({
  alias: 'common', path: '../common/actors.pcd',
  comments: rng.bool(0.3) ? ['imp'] : undefined, pos: pos(0),
});

const genFlow = (rng: Rng): Flow => ({
  id: rng.bool(0.7) ? 'f1' : undefined,
  title: rng.pick(NASTY),
  steps: [genStep(rng, 0), genStep(rng, 0)],
  pos: pos(0),
});

const genView = (rng: Rng, firstId: string): View => ({
  id: 'v1', name: rng.pick(NASTY), pos: pos(0),
  lines: [
    (rng.bool(0.5)
      ? { type: 'layout', mode: 'auto', dir: rng.pick(['LR', 'TB', 'RL', 'BT'] as const), pos: pos(0) }
      : { type: 'hide', id: 'db', pos: pos(0) }) as ViewLine,
    { type: 'position', id: firstId, x: 0, y: 120, pos: pos(0) } as ViewLine,
  ],
});

const genStyleStmt = (rng: Rng, firstId: string): StyleStmt => ({
  target: firstId,
  style: {
    fill: '#2d6cdf',
    dashed: rng.bool(0.5) || undefined,
    raw: rng.bool(0.3) ? [{ raw: 'blur 2px', pos: { line: 0, col: 1 } }] : undefined,
  },
  pos: pos(0),
});

/** Half the time pick a value from `vals`, else undefined. */
const optOf = <T>(rng: Rng, vals: readonly T[]): T | undefined =>
  rng.bool(0.5) ? rng.pick(vals) : undefined;

const genDoc = (rng: Rng): Doc => {
  const ids = rng.some(ID_POOL, 5);
  const uniq = [...new Set(ids.length > 0 ? ids : ['x1'])];
  const hasTitle = rng.bool(0.9);
  return {
    irVersion: IR_VERSION,
    formatVersion: '1.0',
    title: hasTitle ? rng.pick(NASTY) : undefined,
    level: optOf(rng, ['container']),
    direction: optOf(rng, ['LR', 'TB', 'RL', 'BT'] as const),
    theme: optOf(rng, ['dark']),
    comments: hasTitle && rng.bool(0.4) ? ['doc note', 'second'] : undefined,
    imports: rng.bool(0.4) ? [genImport(rng)] : [],
    objects: uniq.map((id) => genObject(rng, id)),
    links: uniq.length > 1 ? [genLink(rng, uniq)] : [],
    flows: rng.bool(0.7) ? [genFlow(rng)] : [],
    views: rng.bool(0.5) ? [genView(rng, uniq[0]!)] : [],
    styles: rng.bool(0.4) ? [genStyleStmt(rng, uniq[0]!)] : [],
  };
};

/** Zero every {line,col} value (deep): printer never emits positions, so
 * re-parsed docs differ there; also default missing object names. Comparison
 * uses the canonical serializer, so key order is normalized too. */
const zeroPos = (v: unknown): void => {
  if (Array.isArray(v)) {
    v.forEach(zeroPos);
    return;
  }
  if (v === null || typeof v !== 'object') return;
  const o = v as Record<string, unknown>;
  if (typeof o.line === 'number' && typeof o.col === 'number') {
    o.line = 0;
    o.col = 0;
    return;
  }
  for (const k of Object.keys(o)) zeroPos(o[k]);
};

const strip = (d: Doc): string => {
  const j: unknown = JSON.parse(JSON.stringify(d));
  zeroPos(j);
  const r = j as { objects: { name?: string; id: string }[] };
  for (const o of r.objects) if (o.name === undefined) o.name = o.id;
  return serializeDoc(j as Doc);
};

describe('printer (WP3)', () => {
  it('checkout sample: canonical output is stable and idempotent', () => {
    const d1 = parsePDL(CHECKOUT_SRC).doc!;
    const p1 = printDoc(d1);
    const d2 = parsePDL(p1).doc!;
    const p2 = printDoc(d2);
    expect(p2).toBe(p1);
    // ids survive: unref'd L1 stays too (D-M1-16: ids are data)
    expect(p1).toContain('shop -requests-> api : "POST /checkout" as L1');
    expect(p1).toContain('api -writes-> db');
  });

  it('round-trips the checkout sample with equal IR (modulo positions)', () => {
    const d1 = parsePDL(CHECKOUT_SRC).doc!;
    const p1 = printDoc(d1);
    const d2 = parsePDL(p1).doc!;
    expect(strip(d2)).toEqual(strip(d1));
  });

  it('quotes and escapes strings round-trip safely', () => {
    const { doc } = parsePDL('pcd 1.0\nsystem a "say \\"hi\\\\"\n');
    const printed = printDoc(doc!);
    const r = parsePDL(printed);
    expect(r.diagnostics).toEqual([]);
    expect(r.doc!.objects[0]!.name).toBe('say "hi\\');
  });

  it('prints sections in §2 canonical order with blank separators', () => {
    const { doc } = parsePDL('pcd 1.0\nstyle a { fill #111 }\nperson b "B"\n');
    const out = printDoc(doc!);
    expect(out.indexOf('person b')).toBeLessThan(out.indexOf('style a'));
  });

  it('omits the attribute block when an object has no attributes (F-05)', () => {
    const { doc } = parsePDL('pcd 1.0\n\nsystem a "A" {\n}\n');
    expect(printDoc(doc!)).toBe('pcd 1.0\n\nsystem a "A"\n');
  });

  it('keeps the block for any real attribute, style or raw line (F-05)', () => {
    const { doc } = parsePDL('pcd 1.0\n\nsystem a "A" {\n  technology "Go"\n}\n');
    expect(printDoc(doc!)).toContain('system a "A" {\n  technology "Go"\n}');
  });

  it('print∘parse∘print is stable without empty blocks (F-05)', () => {
    const src = 'pcd 1.0\n\nsystem a "A" {\n}\n\nsystem b "B" {\n  tag x\n}\n\na -> b\n';
    const once = printDoc(parsePDL(src).doc!);
    const twice = printDoc(parsePDL(once).doc!);
    expect(twice).toBe(once);
    expect(once).not.toContain('{ }');
    expect(once).not.toContain('{\n}');
  });

  it('idempotence + IR-stability fuzz (50 seeds)', () => {
    forAllSeeds(Array.from({ length: 50 }, (_, k) => k + 1), (rng, seed) => {
      const doc = genDoc(rng);
      const p1 = printDoc(doc);
      const r = parsePDL(p1);
      if (!r.doc) throw new Error(`seed ${seed}: reparse failed:\n${p1}\n${JSON.stringify(r.diagnostics)}`);
      const p2 = printDoc(r.doc);
      if (p2 !== p1) throw new Error(`seed ${seed}: not idempotent:\n--- p1\n${p1}\n--- p2\n${p2}`);
      const a = strip(doc);
      const b = strip(r.doc);
      if (a !== b) throw new Error(`seed ${seed}: IR drift\n--- a\n${a}\n--- b\n${b}`);
    });
  });
});
