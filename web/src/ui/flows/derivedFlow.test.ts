// SPDX-License-Identifier: GPL-3.0-only
// Item 10: a link-only document gets a presentable flow without anything being
// written into the file. These tests pin the derivation, its precedence rules and
// the single materialisation on an explicit edit.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import { buildPlan } from '../../engine/flows/plan';
import type { Doc } from '../../engine/model/types';
import { WorkspaceManager, pcdToState } from '../../workspace/workspace';
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
    const d = doc(C4);
    const flow = derivedFlow(d)!;
    expect(flow.title).toBe('Default flow');
    expect(buildPlan({ doc: d, flow }).beats.map((beat) => beat.title)).toEqual([
      'buys',
      'charges',
    ]);
    expect(flow?.steps.map((step) => step.type === 'msg' ? step.from : null)).toEqual([
      'customer',
      'shop',
    ]);
  });

});

describe('derived default flow currency and creation order', () => {
  it('resolves the latest canvas source and inherits narration without persisting Default', () => {
    const workspace = new WorkspaceManager({ skipWelcome: true });
    workspace.createFileAt('live.pcd', 'pcd 1.0\n');
    const drawn = pcdToState(`pcd 1.0

person a "Ada" {
description "Customer actor"
}
component b "Component"
a -> b : "test"
`);
    workspace.saveCanvas('live.pcd', drawn);

    const current = doc(workspace.text('live.pcd'));
    const flow = findFlow(current, 'default')!;
    expect(buildPlan({ doc: current, flow }).beats).toMatchObject([
      { title: 'test', links: [{ from: 'a', to: 'b' }] },
    ]);
    expect(current.flows).toHaveLength(0);
    expect(workspace.text('live.pcd')).not.toContain('flow ');

    // A second canvas edit is visible to the next resolution, including process
    // narration for an element not represented by a connector.
    workspace.saveCanvas('live.pcd', {
      ...drawn,
      links: drawn.links.map((link) => ({ ...link, label: 'latest label' })),
      objects: [...drawn.objects, pcdToState('pcd 1.0\nsystem c "C" { description "Latest detail" }\n').objects[0]!],
    });
    const updated = doc(workspace.text('live.pcd'));
    expect(buildPlan({ doc: updated, flow: findFlow(updated, 'default')! }).beats).toMatchObject([
      { title: 'latest label' },
      { title: 'C', description: 'Latest detail' },
    ]);
    expect(updated.flows).toHaveLength(0);
  });

  it('keeps an up-to-date default alongside authored custom flows', () => {
    const d = doc(AUTHORED);
    expect(derivedFlow(d)).toMatchObject({ id: 'default', title: 'Default flow' });
    expect(flowsForDisplay(d).map((f) => f.title)).toEqual(['Default flow', 'Checkout']);
  });

  it('derives process steps for unconnected elements and an empty Default for a blank diagram', () => {
    expect(derivedFlow(doc('pcd 1.0\n\nsystem a "A"\ncontainer b "B"\n'))?.steps).toMatchObject([
      { type: 'process', target: 'a' },
      { type: 'process', target: 'b' },
    ]);
    expect(derivedFlow(doc('pcd 1.0\n'))).toMatchObject({
      id: 'default',
      title: 'Default flow',
      steps: [],
    });
    expect(derivedFlow(null)).toBeNull();
    // An orphan connection is not presentable, but its real object still is.
    const orphan = parsePDL('pcd 1.0\n\nsystem a "A"\nb -> a : "orphan"\n').doc;
    expect(derivedFlow(orphan)?.steps).toMatchObject([{ type: 'process', target: 'a' }]);
  });

  it('uses strict creation order when topology, parallel links and a cycle suggest another order', () => {
    const d = doc(`pcd 1.0

system a "A"
system b "B"
system c "C"

b -> c : "created first"
a -> b : "created second"
a -> b : "created third"
c -> a : "created fourth"
`);
    const flow = derivedFlow(d)!;
    expect(flow.steps.map((step) => step.type === 'msg' ? step.linkRef : null)).toEqual([
      undefined,
      '#1',
      '#2',
      undefined,
    ]);
    expect(buildPlan({ doc: d, flow }).beats.map((beat) => beat.title)).toEqual([
      'created first',
      'created second',
      'created third',
      'created fourth',
    ]);
  });

});

describe('derived default flow references and custom copies', () => {
  it('keeps parallel links distinct and keeps a cycle deterministic', () => {
    const parallel = doc(`pcd 1.0

system a "A"
system b "B"

a -> b : "one"
a -> b : "two"
`);
    expect(derivedFlow(parallel)?.steps).toHaveLength(2);
    expect(buildPlan({ doc: parallel, flow: derivedFlow(parallel)! }).beats.map((beat) => beat.title)).toEqual([
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
    expect(buildPlan({ doc: cyclic, flow: derivedFlow(cyclic)! }).beats.map((beat) => beat.title)).toEqual([
      'ab',
      'ba',
    ]);
  });

  it('references elements without copying their labels into step overrides', () => {
    const flow = derivedFlow(doc(C4));
    expect(flow?.steps.every((step) => step.type === 'msg' && step.linkRef === undefined)).toBe(true);
    expect(flow?.steps.every((step) => step.type === 'msg' && step.label === undefined)).toBe(true);

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

  it('copies the derived flow for editing while preserving the live default', () => {
    const d = doc(C4);
    const derived = derivedFlow(d)!;
    expect(findFlow(d, derived.id!)).toEqual(derived);
    expect(findFlow(d, 'nope')).toBeNull();

    const edited = flowForEdit(d, derived.id!)!;
    expect(edited).toMatchObject({ id: 'flow1', title: 'Custom flow' });
    expect(d.flows).toHaveLength(1);
    expect(edited.steps).toHaveLength(derived.steps.length);
    expect(derivedFlow(d)).not.toBeNull();
    expect(flowsForDisplay(d).map((flow) => flow.title)).toEqual(['Default flow', 'Custom flow']);
    // The editor follows the custom copy; editing it does not append another.
    expect(flowForEdit(d, edited.id!)).toBe(edited);
    expect(d.flows).toHaveLength(1);
    expect(printDoc(d)).toContain('flow "Custom flow" as flow1');
  });

  it('keeps the custom copy reference-based after a save and reload', () => {
    const d = doc(C4);
    const derived = derivedFlow(d)!;
    flowForEdit(d, derived.id!);
    const reread = doc(printDoc(d));
    expect(reread.flows[0]?.steps.map((s) => s.type === 'msg' ? s.label : null)).toEqual([
      undefined,
      undefined,
    ]);
    expect(reread.flows[0]?.steps.map((s) => s.type === 'msg' ? s.from : null)).toEqual([
      'customer',
      'shop',
    ]);
  });
});
