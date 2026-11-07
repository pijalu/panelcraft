// SPDX-License-Identifier: GPL-3.0-only
// F-01 regression suite: canvas writes must be a *merge* into the document.
// Every test here fails against the old `stateToDoc`-projection save path
// (workspace.ts before F-01): flows/views/styles/imports vanished.

import { describe, expect, it } from 'vitest';
import { applyCanvasState, type CanvasStateLike } from './merge';
import { parsePDL } from '../format/parser';
import { printDoc } from '../format/printer';
import type { Doc } from './types';

const RICH = `pcd 1.0
# workspace banner
title "Payments"
level container
direction LR
theme dark

import shared as "../shared.pcd"

# the API tier
system api "API" {
  description "edge"
  technology "Go"
  tag public edge
  property owner "core"
  contains db
  attach note1
  icon cloud
  style {
    fill #123456
    dashed
  }
  custom-attr 42
}

datastore db "Database" {
  technology "Postgres"
}

group g1 "Tier" {
  contains api db
}

note note1 "remember"

api -requests-> db : "reads" as L1 {
  tag perf
  style {
    stroke #abcdef
  }
  waypoint (10, 20)
}

flow "Checkout" as f1 {
  intro "start"
  api -> db : "query"
}

view "Default" {
  layout saved
  position api (120, 240)
  position db (400, 240)
  hide note1
}

view "Ops" {
  layout auto TB
}

style api {
  fill #ff0000
}
`;

const docOf = (text: string): Doc => {
  const { doc, diagnostics } = parsePDL(text);
  if (doc === null) throw new Error(`fixture does not parse: ${JSON.stringify(diagnostics)}`);
  return doc;
};

const stateFrom = (doc: Doc, patch: Partial<CanvasStateLike> = {}): CanvasStateLike => ({
  objects: doc.objects.map((o) => ({
    id: o.id,
    kind: o.kind,
    name: o.name,
    description: o.description,
    technology: o.technology,
    tags: o.tags,
    icon: o.icon,
    dashed: o.style?.dashed === true ? true : undefined,
  })),
  links: doc.links.map((l, i) => ({
    id: l.id ?? `anon${i}`,
    from: l.from,
    to: l.to,
    type: l.type,
    label: l.label,
    dashed: l.style?.dashed === true ? true : undefined,
    bidir: l.bidir === true ? true : undefined,
  })),
  ...patch,
});

const printed = (doc: Doc): string => printDoc(doc);

describe('applyCanvasState (F-01)', () => {
  it('a drag/rename round-trip keeps flows, views, styles and imports', () => {
    const before = docOf(RICH);
    const state = stateFrom(before);
    const api = state.objects[0]!;
    const renamed = { ...api, name: 'API Gateway' };
    const after = applyCanvasState(before, { ...state, objects: [renamed, ...state.objects.slice(1)] });
    const text = printed(after);

    expect(text).toContain('import shared as "../shared.pcd"');
    expect(text).toContain('flow "Checkout" as f1');
    expect(text).toContain('view "Default"');
    expect(text).toContain('position api (120, 240)');
    expect(text).toContain('hide note1');
    expect(text).toContain('style api {');
    expect(text).toContain('title "Payments"');
    expect(text).toContain('system api "API Gateway"');
    // untouched attributes/comments survive
    expect(text).toContain('# the API tier');
    expect(text).toContain('custom-attr 42');
    expect(text).toContain('property owner "core"');
    expect(text).toContain('attach note1');
    expect(text).toContain('fill #123456');
    // link semantics are preserved verbatim
    expect(text).toContain('api -requests-> db : "reads" as L1');
    expect(text).toContain('waypoint (10, 20)');
    expect(text).toContain('tag perf');
  });

  it('does not mutate the input document', () => {
    const before = docOf(RICH);
    const snapshot = printed(before);
    applyCanvasState(before, stateFrom(before, { objects: [], links: [] }));
    expect(printed(before)).toBe(snapshot);
  });

  it('appends new objects at the end and drops ids the canvas removed', () => {
    const before = docOf(RICH);
    const state = stateFrom(before);
    const kept = state.objects.filter((o) => o.id !== 'note1');
    const after = applyCanvasState(before, {
      objects: [...kept, { id: 'o9', kind: 'component', name: 'New' }],
      links: state.links,
    });
    expect(after.objects.map((o) => o.id)).toEqual(['api', 'db', 'g1', 'o9']);
    expect(printed(after)).not.toContain('note note1');
  });

  it('keeps a link without an id id-less (no id stamped on a canvas edit)', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A"\n\nsystem b "B"\n\na -> b\n');
    const after = applyCanvasState(doc, {
      objects: [
        { id: 'a', kind: 'system', name: 'A renamed' },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      links: [{ id: 'a-b-0', from: 'a', to: 'b' }],
    });
    expect(after.links).toHaveLength(1);
    expect(after.links[0]?.id).toBeUndefined();
    expect(printed(after)).toContain('a -> b');
    expect(printed(after)).not.toContain(' as ');
  });

  it('does not invent a link type for an untyped arrow (F-08)', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A"\n\nsystem b "B"\n\na -> b\n');
    const after = applyCanvasState(doc, {
      objects: [
        { id: 'a', kind: 'system', name: 'A' },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      links: [{ id: 'L', from: 'a', to: 'b', type: undefined }],
    });
    expect(after.links[0]?.type).toBeUndefined();
    expect(printed(after)).toContain('a -> b\n');
  });

  it('keeps a bidirectional link bidirectional (F-08)', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A"\n\nsystem b "B"\n\na -requests-> b as L {\n}\n');
    const bidir = applyCanvasState(doc, {
      objects: [
        { id: 'a', kind: 'system', name: 'A' },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      links: [{ id: 'L', from: 'a', to: 'b', type: 'requests', bidir: true }],
    });
    expect(printed(bidir)).toContain('a <-requests-> b as L');
  });

  it('folds canvas dashed into the style block and clears it again (F-07)', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A"\n\nsystem b "B"\n\na -> b as L\n');
    const on = applyCanvasState(doc, {
      objects: [
        { id: 'a', kind: 'system', name: 'A', dashed: true },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      links: [{ id: 'L', from: 'a', to: 'b', dashed: true }],
    });
    expect(printed(on)).toContain('style {\n    dashed\n  }');
    const off = applyCanvasState(on, {
      objects: [
        { id: 'a', kind: 'system', name: 'A' },
        { id: 'b', kind: 'system', name: 'B' },
      ],
      links: [{ id: 'L', from: 'a', to: 'b' }],
    });
    expect(printed(off)).not.toContain('dashed');
  });

  it('keeps other style keys while toggling dashed', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A" {\n  style {\n    fill #123456\n  }\n}\n');
    const after = applyCanvasState(doc, {
      objects: [{ id: 'a', kind: 'system', name: 'A', dashed: true }],
      links: [],
    });
    const style = after.objects[0]?.style;
    expect(style?.fill).toBe('#123456');
    expect(style?.dashed).toBe(true);
  });

});

describe('applyCanvasState — structure (F-01)', () => {
  it('drops links whose endpoints are gone', () => {
    const doc = docOf('pcd 1.0\n\nsystem a "A"\n\nsystem b "B"\n\na -> b as L\n');
    const after = applyCanvasState(doc, {
      objects: [{ id: 'a', kind: 'system', name: 'A' }],
      links: [{ id: 'L', from: 'a', to: 'b' }],
    });
    expect(after.links).toEqual([]);
  });

  it('is idempotent: a second merge of the same state changes nothing', () => {
    const before = docOf(RICH);
    const state = stateFrom(before);
    const once = applyCanvasState(before, state);
    const twice = applyCanvasState(once, state);
    expect(printed(twice)).toBe(printed(once));
  });

  it('round-trips print∘parse (the merged text always re-parses)', () => {
    const before = docOf(RICH);
    const text = printed(applyCanvasState(before, stateFrom(before)));
    const again = docOf(text);
    expect(printed(again)).toBe(text);
  });

  it('keeps group and note objects alive (F-06)', () => {
    const before = docOf(RICH);
    const after = applyCanvasState(before, stateFrom(before));
    expect(after.objects.map((o) => o.kind)).toContain('group');
    expect(after.objects.map((o) => o.kind)).toContain('note');
  });
});
