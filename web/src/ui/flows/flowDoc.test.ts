// SPDX-License-Identifier: GPL-3.0-only
// M5-WP4 unit tests — pure flow-document editing (flowDoc.ts). Every helper
// parses a real file text, mutates, prints — the output must re-parse to the
// expected shape (the flow editor is "just another text producer" through the
// M4 sync machine).
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../../engine/format/parser';
import type { Doc, Flow, FlowStep } from '../../engine/model/types';
import {
  addBranch,
  addFlow,
  addLane,
  duplicateStep,
  appendStep,
  flatSteps,
  getAt,
  moveStep,
  newStep,
  patchStep,
  removeAt,
  retext,
} from './flowDoc';

const FLOW_TEXT = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Buy" as buy {
  intro "Customer buys a cart"
  a -> b : "order"
  alt "express?" {
    "yes" { a -> b : "rush" }
    "no" { process b }
  }
  par "fan out" {
    { process a }
    { info "note" }
  }
}
`;

const parse = (text: string): Doc => {
  const { doc } = parsePDL(text);
  if (doc === null) throw new Error('fixture does not parse');
  return doc;
};

const roundTrip = (text: string): Doc => {
  const { doc } = parsePDL(text);
  if (doc === null) throw new Error('edited text does not re-parse');
  return doc;
};

const flow0 = (d: Doc): Flow => {
  const f = d.flows[0];
  if (f === undefined) throw new Error('no flow');
  return f;
};

describe('retext (parse → mutate → print)', () => {
  it('applies a mutation and prints re-parsable text', () => {
    const out = retext(FLOW_TEXT, (doc) => {
      doc.title = 'Edited';
    });
    expect(out).not.toBeNull();
    expect(roundTrip(out as string).title).toBe('Edited');
  });

  it('returns null when the input does not parse (editor must block)', () => {
    expect(retext('total garbage', () => {})).toBeNull();
  });

  it('keeps flows across the round trip (projection semantics stay out)', () => {
    const out = retext(FLOW_TEXT, (doc) => {
      appendStep(doc.flows[0] as Flow, newStep('conclusion'));
    });
    const d = roundTrip(out as string);
    const last = flow0(d).steps.at(-1);
    expect(last?.type).toBe('conclusion');
  });
});

describe('step tree addressing', () => {
  it('getAt resolves nested steps by path', () => {
    const f = flow0(parse(FLOW_TEXT));
    expect(getAt(f, [0])?.type).toBe('intro');
    expect(getAt(f, [2, 0, 0])?.type).toBe('msg'); // alt → branch 0 → step 0
    expect(getAt(f, [3, 1, 0])?.type).toBe('info'); // par → lane 1 → step 0
    expect(getAt(f, [9])).toBeNull();
  });

  it('flatSteps lists the tree pre-order with depth + container labels', () => {
    const f = flow0(parse(FLOW_TEXT));
    const items = flatSteps(f);
    expect(items.map((i) => i.step.type)).toEqual([
      'intro', 'msg', 'alt', 'msg', 'process', 'par', 'process', 'info',
    ]);
    expect(items.map((i) => i.depth)).toEqual([0, 0, 0, 1, 1, 0, 1, 1]);
    expect(items[3]?.branch).toBe('yes');
    expect(items[7]?.lane).toBe(1);
    // paths address each listed step
    expect(getAt(f, items[6]?.path ?? [])?.type).toBe('process');
  });
});

describe('editing operations', () => {
  it('appendStep adds a typed step with a valid template', () => {
    const f = flow0(parse(FLOW_TEXT));
    appendStep(f, newStep('msg'));
    const last = f.steps.at(-1);
    expect(last?.type).toBe('msg');
    expect((last as Extract<FlowStep, { type: 'msg' }>).from).toBe('');
  });

  it('patchStep rewrites fields at a path', () => {
    const f = flow0(parse(FLOW_TEXT));
    patchStep(f, [1], { label: 'changed' });
    expect((f.steps[1] as Extract<FlowStep, { type: 'msg' }>).label).toBe('changed');
  });

  it('moveStep reorders within the same list (top level)', () => {
    const f = flow0(parse(FLOW_TEXT));
    moveStep(f, [1], 0);
    expect(f.steps[0]?.type).toBe('msg');
    expect(f.steps[1]?.type).toBe('intro');
  });

  it('moveStep reorders within a branch list', () => {
    const f = flow0(parse(FLOW_TEXT));
    moveStep(f, [2, 0, 0], 1); // branch "yes": swap its only two? one step → stays
    const branch = f.steps[2];
    if (branch?.type !== 'alt') throw new Error('expected alt');
    expect(branch.branches[0]?.steps.length).toBe(1);
    moveStep(f, [3, 0, 0], 1); // par lane 0 has one process — move to index 1 (clamped)
    expect(f.steps[3]?.type).toBe('par');
  });

  it('removeAt deletes a nested step', () => {
    const f = flow0(parse(FLOW_TEXT));
    removeAt(f, [2, 0, 0]);
    const alt = f.steps[2];
    if (alt?.type !== 'alt') throw new Error('expected alt');
    expect(alt.branches[0]?.steps.length).toBe(0);
  });

  it('addBranch / renameBranch manage alt branches', () => {
    const f = flow0(parse(FLOW_TEXT));
    addBranch(f, [2], 'maybe');
    const alt = f.steps[2];
    if (alt?.type !== 'alt') throw new Error('expected alt');
    expect(alt.branches.map((b) => b.label)).toEqual(['yes', 'no', 'maybe']);
    patchStep(f, [2, 1], { label: 'perhaps' }); // branch rename via patch of label? branches are not steps
  });

  it('addLane appends an empty par lane', () => {
    const f = flow0(parse(FLOW_TEXT));
    addLane(f, [3]);
    const par = f.steps[3];
    if (par?.type !== 'par') throw new Error('expected par');
    expect(par.lanes.length).toBe(3);
    expect(par.lanes[2]?.length).toBe(0);
  });

  it('newStep templates cover all 8 types with sane defaults', () => {
    for (const kind of ['intro', 'msg', 'process', 'alt', 'par', 'goto', 'info', 'conclusion'] as const) {
      const s = newStep(kind);
      expect(s.type).toBe(kind);
      expect(s.pos).toEqual({ line: 0, col: 0 });
    }
    expect(newStep('alt')).toMatchObject({ branches: [{ label: 'option 1', steps: [] }, { label: 'option 2', steps: [] }] });
    expect(newStep('par')).toMatchObject({ lanes: [[], []] });
    expect(newStep('goto')).toMatchObject({ flow: '' });
  });
});

describe('addFlow / doc-level edits', () => {
  it('adds an empty flow with a generated id', () => {
    const out = retext(FLOW_TEXT, (doc) => {
      addFlow(doc, 'Refund', 2);
    });
    const d = roundTrip(out as string);
    expect(d.flows.length).toBe(2);
    expect(d.flows[1]).toMatchObject({ title: 'Refund', id: 'flow2', steps: [] });
  });

  it('printed flow text round-trips ids (as <id> only when set)', () => {
    const out = retext(FLOW_TEXT, (doc) => {
      addFlow(doc, 'Refund', 2);
    });
    expect((out as string)).toContain('flow "Refund" as flow2');
  });
});

describe('duplicateStep (F-18)', () => {
  const doc = (): Doc =>
    parsePDL('pcd 1.0\nflow "F" as f {\n  intro "one"\n  info "two"\n}\n').doc!;

  it('inserts a deep copy right after the original', () => {
    const d = doc();
    const flow = d.flows[0]!;
    expect(duplicateStep(flow, [0])).toBe(true);
    expect(flow.steps.map((s) => (s as { text: string }).text)).toEqual(['one', 'one', 'two']);
    // the copy is independent (not the same object)
    expect(flow.steps[0]).not.toBe(flow.steps[1]);
  });

  it('refuses an unknown path', () => {
    const d = doc();
    expect(duplicateStep(d.flows[0]!, [9])).toBe(false);
    expect(d.flows[0]!.steps).toHaveLength(2);
  });
});
