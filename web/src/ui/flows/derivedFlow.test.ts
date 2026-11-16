// SPDX-License-Identifier: GPL-3.0-only
// Item 10: a link-only document gets a presentable flow without anything being
// written into the file. These tests pin the derivation, its precedence rules and
// the single materialisation on an explicit edit.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Doc } from '../../engine/model/types';
import {
  derivedFlow,
  findFlow,
  flowForEdit,
  flowsForDisplay,
} from './derivedFlow';

/** The shipped default C4 context template, minus its flows. */
const C4 = `pcd 1.0

person customer "Customer"
system shop "Shop"
system_ext payment "Payment provider"

customer -> shop : "buys"
shop -> payment : "charges"
`;

const AUTHORED = `pcd 1.0

system a "A"
system b "B"

a -> b : "calls"

flow "Checkout" {
  a -> b : "first"
}
`;

function doc(text: string): Doc {
  const parsed = parsePDL(text);
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.doc!;
}

describe('derived default flow (item 10)', () => {
  it('derives the provider template as "buys" then "charges"', () => {
    const flow = derivedFlow(doc(C4));
    expect(flow?.title).toBe('Default flow');
    expect(flow?.steps.map((step) => step.type === 'msg' ? step.label : null)).toEqual([
      'buys',
      'charges',
    ]);
    expect(flow?.steps.map((step) => step.type === 'msg' ? step.from : null)).toEqual([
      'customer',
      'shop',
    ]);
  });

  it('never derives a flow when one is authored', () => {
    expect(derivedFlow(doc(AUTHORED))).toBeNull();
    expect(flowsForDisplay(doc(AUTHORED)).map((f) => f.title)).toEqual(['Checkout']);
  });

  it('derives nothing without usable connections', () => {
    expect(derivedFlow(doc('pcd 1.0\n\nsystem a "A"\n'))).toBeNull();
    expect(derivedFlow(doc('pcd 1.0\n'))).toBeNull();
    expect(derivedFlow(null)).toBeNull();
    // A link to a shape the document does not define is not presentable. The
    // parser reports it, so the text is read without the "no diagnostics" guard.
    expect(derivedFlow(parsePDL('pcd 1.0\n\nsystem a "A"\nb -> a : "orphan"\n').doc)).toBeNull();
  });

  it('keeps parallel links distinct and keeps a cycle deterministic', () => {
    const parallel = doc(`pcd 1.0

system a "A"
system b "B"

a -> b : "one"
a -> b : "two"
`);
    expect(derivedFlow(parallel)?.steps).toHaveLength(2);
    expect(derivedFlow(parallel)?.steps.map((s) => s.type === 'msg' ? s.label : null)).toEqual([
      'one',
      'two',
    ]);

    const cyclic = doc(`pcd 1.0

system a "A"
system b "B"

a -> b : "ab"
b -> a : "ba"
`);
    // Creation order is the documented fallback for a cycle.
    expect(derivedFlow(cyclic)?.steps.map((s) => s.type === 'msg' ? s.label : null)).toEqual([
      'ab',
      'ba',
    ]);
  });

  it('references only link ids that already exist', () => {
    const flow = derivedFlow(doc(C4));
    expect(flow?.steps.every((step) => step.type === 'msg' && step.linkRef === undefined)).toBe(true);

    const identified = doc(`pcd 1.0

system a "A"
system b "B"

a -> b as L1 : "named"
`);
    expect(derivedFlow(identified)?.steps[0]).toMatchObject({ linkRef: 'L1' });
  });

  it('is presentation-only: the printed document does not change', () => {
    const text = C4;
    const d = doc(text);
    expect(derivedFlow(d)).not.toBeNull();
    expect(printDoc(d)).toBe(printDoc(doc(text)));
    // Displaying it does not append anything to the document.
    expect(flowsForDisplay(d)).toHaveLength(1);
    expect(d.flows).toHaveLength(0);
  });

  it('resolves the derived flow by its key, and materialises at most once', () => {
    const d = doc(C4);
    const derived = derivedFlow(d)!;
    expect(findFlow(d, derived.id!)).toEqual(derived);
    expect(findFlow(d, 'nope')).toBeNull();

    const edited = flowForEdit(d, derived.id!)!;
    expect(d.flows).toHaveLength(1);
    expect(edited.steps).toHaveLength(derived.steps.length);
    // A second edit finds the authored flow instead of appending a duplicate.
    flowForEdit(d, derived.id!);
    expect(d.flows).toHaveLength(1);
    expect(derivedFlow(d)).toBeNull();
    expect(printDoc(d)).toContain('flow');
  });

  it('two users get the materialised flow with the derived playback order', () => {
    const d = doc(C4);
    const derived = derivedFlow(d)!;
    flowForEdit(d, derived.id!);
    const printed = printDoc(d);
    const reread = doc(printed);
    expect(reread.flows[0]?.steps.map((s) => s.type === 'msg' ? s.label : null)).toEqual([
      'buys',
      'charges',
    ]);
  });
});
