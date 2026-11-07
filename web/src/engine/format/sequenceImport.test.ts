// SPDX-License-Identifier: GPL-3.0-only
// F-21 sequenceDiagram import (FR-M3): participants become objects, messages
// become a flow of msg steps, response arrows stay dashed, blocks warn.

import { describe, expect, it } from 'vitest';
import { fromMermaid } from './mermaid';
import { printDoc } from './printer';

const SRC = `sequenceDiagram
  participant A as Alice
  actor B as Bob
  A->>B: Hello
  B-->>A: Hi
`;

describe('sequenceDiagram import (F-21)', () => {
  it('creates objects from participants/actors', () => {
    const { doc } = fromMermaid(SRC);
    expect(doc.objects.map((o) => [o.id, o.kind, o.name])).toEqual([
      ['A', 'system', 'Alice'],
      ['B', 'person', 'Bob'],
    ]);
  });

  it('turns messages into a flow of msg steps', () => {
    const { doc } = fromMermaid(SRC);
    expect(doc.flows).toHaveLength(1);
    const steps = doc.flows[0]!.steps;
    expect(steps.map((s) => s.type)).toEqual(['msg', 'msg']);
    expect(steps[0]).toMatchObject({ from: 'A', to: 'B', label: 'Hello' });
    expect(steps[1]).toMatchObject({ from: 'B', to: 'A', label: 'Hi' });
  });

  it('keeps the response arrow dashed on the link', () => {
    const { doc } = fromMermaid(SRC);
    const reply = doc.links.find((l) => l.label === 'Hi');
    expect(reply?.style?.dashed).toBe(true);
    const question = doc.links.find((l) => l.label === 'Hello');
    expect(question?.style?.dashed).toBeUndefined();
  });

  it('warns about blocks it cannot represent', () => {
    const { doc, diagnostics } = fromMermaid(`sequenceDiagram\n  participant A\n  loop every minute\n  end\n`);
    expect(diagnostics.map((d) => d.code)).toContain('M200');
    expect(doc.objects).toHaveLength(1);
  });

  it('prints a document that re-parses (flow + links survive)', () => {
    const { doc } = fromMermaid(SRC);
    const text = printDoc(doc);
    expect(text).toContain('flow "Sequence"');
    expect(text).toContain('A -> B');
  });
});
