// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { flowToMermaid } from './mermaidSequenceExport';
import { derivedFlow } from '../../ui/flows/derivedFlow';

const DOC = `pcd 1.0
person user "Customer"
system shop "Shop"
system api "API"
system psp "PSP"
system events "Events"
user -> shop : "adds"
api -requests-> psp : "charge" as L4 {
  style { dashed }
}
api -> events
flow "Happy path" as happy {
  intro "Customer buys a cart"
  user -> shop : "adds to cart"
  process api "Validates cart"
  alt "payment method" {
    "card" {
      api -> psp : "charge" as L4
    }
    "invoice" {
      info "invoicing not in this story"
    }
  }
  par "fan-out" {
    {
      api -> events : "order created"
    }
    {
      process api "send receipt"
    }
  }
  info "PCI scope ends at PSP"
  conclusion "Order stored"
}`;

describe('flow → mermaid sequenceDiagram export', () => {
  it('emits participants, messages, alternatives, parallel lanes and notes', () => {
    const doc = parsePDL(DOC).doc!;
    const { text, dropped } = flowToMermaid(doc, doc.flows[0]!);
    expect(text).toBe(`sequenceDiagram
  title Happy path
  actor user as Customer
  participant shop as Shop
  participant api as API
  participant psp as PSP
  participant events as Events
  Note over user,shop: Customer buys a cart
  user->>shop: adds to cart
  Note over api: Validates cart
  alt payment method — card
    api-->>psp: charge
  else invoice
    Note over api,psp: invoicing not in this story
  end
  par fan-out
    api->>events: order created
  and lane 2
    Note over api: send receipt
  end
  Note over user,events: PCI scope ends at PSP
  Note over user,events: Order stored
`);
    expect(dropped).toEqual([]);
  });

  it('honours flip, escapes control text and declares unsupported navigation', () => {
    const doc = parsePDL(`pcd 1.0
person a "A"
system b "B"
a -> b as L1
flow "Other" as other {
  goto "other.pcd#target" return here
  a -> b : "say: hello" as L1 flip
}`).doc!;
    const { text, dropped } = flowToMermaid(doc, doc.flows[0]!);
    expect(text).toContain('b->>a: say: hello');
    expect(dropped).toEqual(['goto navigation']);
  });

  it('escapes Mermaid delimiters and declares dropped timing or orphan notes', () => {
    const doc = parsePDL(`pcd 1.0
system a "A"
system b "B"
a -> b
flow "Timed" as timed {
  info "standalone; note" delay 100
  a -> b : "one; two" delay 200
}`).doc!;
    const { text, dropped } = flowToMermaid(doc, doc.flows[0]!);
    expect(text).toContain('a->>b: one#59; two');
    expect(dropped).toEqual(['per-step delays']);
    const empty = parsePDL('pcd 1.0\nflow "Empty" as empty { info "nothing visual" }').doc!;
    expect(flowToMermaid(empty, empty.flows[0]!).dropped).toEqual(['notes without participants']);
  });

  it('keeps anonymous parallel links distinct in a virtual default flow', () => {
    const doc = parsePDL(`pcd 1.0
  system a "A"
  system b "B"
  a -> b : "first" {
    style { dashed }
  }
  a -> b : "second"`).doc!;
    const flow = derivedFlow(doc)!;
    expect(flow.steps.map((step) => step.type === 'msg' ? step.linkRef : undefined)).toEqual(['#0', '#1']);
    const { text } = flowToMermaid(doc, flow);
    expect(text).toContain('a-->>b: first');
    expect(text).toContain('a->>b: second');
  });

  it('matches the checked-in checkout sequence golden', () => {
    const doc = parsePDL(readFileSync('testdata/corpus/checkout/canonical.pcd', 'utf8')).doc!;
    const out = flowToMermaid(doc, doc.flows[0]!);
    const path = 'testdata/corpus/checkout/export.happy.seq.mmd';
    if (process.env['EXPORT_FIXTURE'] === '1') writeFileSync(path, out.text);
    expect(existsSync(path), 'run EXPORT_FIXTURE=1 for the sequence golden').toBe(true);
    expect(out.text).toBe(readFileSync(path, 'utf8'));
  });

  it('uses deterministic fallback participant names for implicit objects', () => {
    const doc = parsePDL(`pcd 1.0
flow "F" as f {
  unknown -> other : "hello"
}`).doc!;
    const { text } = flowToMermaid(doc, doc.flows[0]!);
    expect(text).toContain('participant unknown as unknown');
    expect(text).toContain('participant other as other');
  });
});
