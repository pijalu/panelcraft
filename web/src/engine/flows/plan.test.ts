// SPDX-License-Identifier: GPL-3.0-only
// M5-WP1 unit tests — playback plan builder (SPEC FR-F1/F2/F3, FILE-FORMAT §6).
// The plan is pure: parsed Doc + flow in, beats out. No DOM, no timers.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../format/parser';
import { buildPlan, canvasLinkId, collectAlts, type Beat } from './plan';
import { MOTION } from '../anim/timings';

const FIXTURE = `pcd 1.0
title "Plan test"

person a "Ada"
system b "Web"
container c "API"

a -> b : "uses" as ab
b -> c as bc
a -> c

flow "Buy" as buy {
  intro "Customer buys a cart"
  a -> b : "order"
  process c "compiles order"
  a -> c : "rush" flip
  alt "express?" {
    "yes" { a -> c : "express" }
    "no" { b -> c flip }
  }
  par "fan out" {
    { a -> b : "notify" flip }
    { process b }
  }
  info "be kind"
  goto refunds return here
  conclusion "done"
}
`;

const parse = (text: string): NonNullable<ReturnType<typeof parsePDL>['doc']> => {
  const { doc } = parsePDL(text);
  if (doc === null) throw new Error('fixture does not parse');
  return doc;
};

/** Test fixtures always have these — narrow once, keep assertions readable. */
const firstFlow = (d: NonNullable<ReturnType<typeof parsePDL>['doc']>) => {
  const f = d.flows[0];
  if (f === undefined) throw new Error('fixture has no flow');
  return f;
};
const beat = (beats: Beat[], i: number): Beat => {
  const b = beats[i];
  if (b === undefined) throw new Error(`no beat ${i}`);
  return b;
};

const kinds = (beats: Beat[]): string[] => beats.map((x) => x.kind);

describe('playback plan builder (M5-WP1)', () => {
  const doc = parse(FIXTURE);
  const flow = firstFlow(doc);

  it('flattens the flow into sequential beats with 1-based indices', () => {
    const plan = buildPlan({ doc, flow });
    expect(plan.flowId).toBe('buy');
    expect(plan.flowTitle).toBe('Buy');
    expect(plan.beats.map((b) => b.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(kinds(plan.beats)).toEqual([
      'intro', 'msg', 'process', 'msg', 'alt', 'msg', 'par', 'info', 'goto', 'conclusion',
    ]);
  });

  it('intro shows the whole scene (no dimming, no camera target)', () => {
    const b = beat(buildPlan({ doc, flow }).beats, 0);
    expect(b.title).toBe('Customer buys a cart');
    expect(b.actors).toEqual([]);
    expect(b.dim).toEqual([]);
  });

  it('msg beat resolves the underlying link and names participants', () => {
    const b = beat(buildPlan({ doc, flow }).beats, 1);
    expect(b.title).toBe('order');
    expect(b.actors).toEqual(['a', 'b']);
    expect(b.links).toEqual([{ linkId: 'ab', from: 'a', to: 'b', flipped: false }]);
    expect(b.dim).toEqual(['c', 'bc', 'a-c-2']); // universe order: objects then links
    expect(b.delayMs).toBe(MOTION.stepDelayMs);
  });

  it('inherits connector labels and element descriptions unless a step overrides them', () => {
    const inherited = parse(`pcd 1.0
person a "Ada" { description "Customer actor" }
system b "Web"
a -> b : "uses" as ab
flow "Inherited" as inherited {
  a -> b
  process a
}
`);
    const beats = buildPlan({ doc: inherited, flow: firstFlow(inherited) }).beats;
    expect(beats[0]?.title).toBe('uses');
    expect(beats[1]).toMatchObject({ title: 'Ada', description: 'Customer actor' });
  });

  it('flip reverses the travel direction but keeps the link', () => {
    const b = beat(buildPlan({ doc, flow }).beats, 3);
    expect(b.links).toEqual([{ linkId: 'a-c-2', from: 'c', to: 'a', flipped: true }]);
    expect(b.actors).toEqual(['a', 'c']);
  });

  it('process beat focuses one object; title falls back to its name', () => {
    const b = beat(buildPlan({ doc, flow }).beats, 2);
    expect(b.title).toBe('compiles order');
    expect(b.actors).toEqual(['c']);
    expect(b.dim).toEqual(['a', 'b', 'ab', 'bc', 'a-c-2']);
  });

  it('dim covers every object and link id not participating in the beat', () => {
    const beats = buildPlan({ doc, flow }).beats;
    const msgDim = new Set(beat(beats, 1).dim);
    expect(msgDim.has('a')).toBe(false);
    expect(msgDim.has('b')).toBe(false);
    expect(msgDim.has('ab')).toBe(false);
    // process beat 3: only c is on stage
    expect(beat(beats, 2).dim).not.toContain('c');
    expect(beat(beats, 2).dim).toContain('ab');
  });

  it('alt yields a chooser beat, then the default (first) branch beats', () => {
    const plan = buildPlan({ doc, flow });
    const chooser = beat(plan.beats, 4);
    expect(chooser.kind).toBe('alt');
    expect(chooser.branch).toBe('yes');
    expect(chooser.dim).toEqual([]); // overview while choosing
    const chosen = beat(plan.beats, 5);
    expect(chosen.kind).toBe('msg');
    expect(chosen.title).toBe('express');
    expect(chosen.links[0]?.linkId).toBe('a-c-2');
    expect(chosen.links[0]?.flipped).toBe(false);
  });

  it('choices pick the alt branch by chooser beat path', () => {
    const plan = buildPlan({ doc, flow, choices: { '5': 1 } });
    const chosen = beat(plan.beats, 5);
    expect(chosen.title).toBe('Web → API'); // no label → narrated from names
    expect(chosen.links).toEqual([{ linkId: 'bc', from: 'c', to: 'b', flipped: true }]);
  });

  it('collectAlts exposes chooser paths + branch labels for the editor UI', () => {
    expect(collectAlts(flow)).toEqual([{ path: '5', label: 'express?', branches: ['yes', 'no'] }]);
    // the exposed path is a valid choice key
    const plan = buildPlan({ doc, flow, choices: { '5': 0 } });
    expect(beat(plan.beats, 5).title).toBe('express');
  });

  it('par animates lanes concurrently under one beat', () => {
    const b = beat(buildPlan({ doc, flow }).beats, 6);
    expect(b.kind).toBe('par');
    expect(b.index).toBe(7);
    expect(b.lanes?.length).toBe(2);
    // union of lane participants is on stage; dim is the complement
    expect(b.actors).toEqual(['a', 'b']);
    expect(b.dim).toEqual(['c', 'bc', 'a-c-2']);
    // lanes are lists of concurrent sub-beats; no own dim (parent dims once)
    expect(b.lanes?.map((lane) => kinds(lane))).toEqual([['msg'], ['process']]);
    expect(b.lanes?.every((lane) => lane.every((l) => l.index === 7))).toBe(true);
    expect(b.lanes?.every((lane) => lane.every((l) => l.dim.length === 0))).toBe(true);
    expect(b.lanes?.[0]?.[0]?.links[0]).toEqual({ linkId: 'ab', from: 'b', to: 'a', flipped: true });
    expect(b.lanes?.[1]?.[0]?.title).toBe('Web'); // process without text → object name
  });
});

describe('beats without stage presence (M5-WP1)', () => {
  const doc = parse(FIXTURE);
  const flow = firstFlow(doc);

  it('info and conclusion beats dim nothing (conclusion un-dims)', () => {
    const beats = buildPlan({ doc, flow }).beats;
    expect(beat(beats, 7)).toMatchObject({ kind: 'info', title: 'be kind', actors: [], dim: [] });
    expect(beat(beats, 9)).toMatchObject({ kind: 'conclusion', title: 'done', actors: [], dim: [] });
  });

  it('goto keeps target + return mode; unresolved target keeps breadcrumb title', () => {
    const b = beat(buildPlan({ doc, flow }).beats, 8);
    expect(b.kind).toBe('goto');
    expect(b.goto).toEqual({ flow: 'refunds', ret: 'here' });
    expect(b.title).toBe('goto refunds');
  });

  it('cross-file goto resolves through the injected flow resolver', () => {
    const d = parse(`pcd 1.0
person u "U"
flow "main" as main {
  intro "start"
  goto "other.pcd#refund" return end
}
`);
    let asked: { file?: string; flow: string } | null = null;
    const plan = buildPlan({
      doc: d,
      flow: firstFlow(d),
      resolveFlow: (file, id) => {
        asked = { file, flow: id };
        return file === 'other.pcd' && id === 'refund' ? { title: 'Refund flow' } : null;
      },
    });
    expect(asked).toEqual({ file: 'other.pcd', flow: 'refund' });
    expect(beat(plan.beats, 1).goto).toEqual({
      file: 'other.pcd',
      flow: 'refund',
      targetTitle: 'Refund flow',
    });
    expect(beat(plan.beats, 1).title).toBe('goto Refund flow');
  });

  it('an unresolvable msg step still yields a beat (validation reports it)', () => {
    const d = parse(`pcd 1.0
person u "U"
flow "f" as f {
  intro "x"
  ghost -> lost : "?"
}
`);
    const b = beat(buildPlan({ doc: d, flow: firstFlow(d) }).beats, 1);
    expect(b.kind).toBe('msg');
    expect(b.links).toEqual([]);
    expect(b.actors).toEqual(['ghost', 'lost']);
    expect(b.title).toBe('?');
  });

  it('delayMs defaults to the theme config and is overridable', () => {
    const beats = buildPlan({ doc, flow }).beats;
    expect(beats.every((b) => b.delayMs === MOTION.stepDelayMs)).toBe(true);
    expect(MOTION.stepDelayMs).toBe(2500); // FR-F3 default
    const custom = buildPlan({ doc, flow, delayMs: 1000 }).beats;
    expect(custom.every((b) => b.delayMs === 1000)).toBe(true);
  });

  it('carries a per-step advance trigger into the beat', () => {
    const source = FIXTURE.replace(
      'intro "Customer buys a cart"',
      'intro "Customer buys a cart" advance click',
    );
    const clickDoc = parse(source);
    const clickFlow = clickDoc.flows[0]!;
    const beats = buildPlan({ doc: clickDoc, flow: clickFlow }).beats;
    expect((beats[0] as unknown as Record<string, unknown>)['advance']).toBe('click');
    expect((beats[1] as unknown as Record<string, unknown>)['advance']).toBeUndefined();
  });
});

describe('msg ref resolution', () => {
  it('as RefId disambiguates parallel links; no as → first pair match', () => {
    const d = parse(`pcd 1.0
person u "U"
system s "S"
u -> s as p1
u -> s as p2
flow "f" as f {
  intro "x"
  u -> s : "explicit" as p2
  u -> s : "implicit"
}
`);
    const beats = buildPlan({ doc: d, flow: firstFlow(d) }).beats;
    expect(beat(beats, 1).links[0]?.linkId).toBe('p2');
    expect(beat(beats, 2).links[0]?.linkId).toBe('p1');
  });

  it('pair matching is direction-insensitive', () => {
    const d = parse(`pcd 1.0
person u "U"
system s "S"
u -> s as one
flow "f" as f {
  intro "x"
  s -> u : "back"
}
`);
    const beats = buildPlan({ doc: d, flow: firstFlow(d) }).beats;
    expect(beat(beats, 1).links).toEqual([{ linkId: 'one', from: 's', to: 'u', flipped: false }]);
  });
});

describe('canvasLinkId', () => {
  it('uses the explicit id when present, else the from-to-index fallback', () => {
    expect(canvasLinkId({ from: 'a', to: 'b', id: 'L9' }, 4)).toBe('L9');
    expect(canvasLinkId({ from: 'a', to: 'b' }, 3)).toBe('a-b-3');
  });
});

// UX08-WP13 — presentation camera intents, narration description and duration
// estimate. The locked table lives in docs/milestones/ux08/WP13-flow-presentation.md;
// the plan resolves every step to an explicit intent so the camera port stays dumb.
const CAM_FIXTURE = `pcd 1.0
person a "Ada"
system b "Web"
container c "API"
a -> b : "uses" as ab
b -> c as bc
a -> c
flow "Buy" as buy {
  intro "start"
  a -> b : "order"
  process c "compile"
  par "fan out" {
    { a -> b : "notify" flip }
    { process b }
  }
  alt "express?" {
    "yes" { a -> c : "rush" }
    "no" { b -> c flip }
  }
  info "be kind"
  goto refunds
  conclusion "done"
}
`;

const camDoc = parse(CAM_FIXTURE);
const camFlow = firstFlow(camDoc);
const camBeats = (): Beat[] => buildPlan({ doc: camDoc, flow: camFlow }).beats;
const byKind = (beats: Beat[], kind: Beat['kind']): Beat => {
  const b = beats.find((x) => x.kind === kind);
  if (b === undefined) throw new Error(`no ${kind} beat`);
  return b;
};

describe('presentation camera intents (UX08-WP13)', () => {
  it('intro and conclusion fit the whole diagram (overview)', () => {
    const beats = camBeats();
    const intro = byKind(beats, 'intro');
    expect(intro.camera.mode).toBe('overview');
    expect(intro.cameraIds).toEqual(['a', 'b', 'c', 'ab', 'bc', 'a-c-2']);
    expect(byKind(beats, 'conclusion').camera.mode).toBe('overview');
  });

  it('msg fits both actors together with the connector', () => {
    const msg = byKind(camBeats(), 'msg');
    expect(msg.camera).toEqual({ mode: 'auto' });
    expect(msg.cameraIds).toEqual(['a', 'b', 'ab']);
  });

  it('process fits only its target shape', () => {
    const proc = byKind(camBeats(), 'process');
    expect(proc.camera.mode).toBe('auto');
    expect(proc.cameraIds).toEqual(['c']);
  });

  it('par fits the union of its concurrent participants', () => {
    const par = byKind(camBeats(), 'par');
    expect(par.camera.mode).toBe('auto');
    expect(par.cameraIds).toEqual(['a', 'b', 'ab']);
  });

  it('alt holds at the chooser, info holds, goto holds', () => {
    const beats = camBeats();
    expect(byKind(beats, 'alt').camera.mode).toBe('hold');
    expect(byKind(beats, 'alt').cameraIds).toEqual([]);
    expect(byKind(beats, 'info').camera.mode).toBe('hold');
    expect(byKind(beats, 'goto').camera.mode).toBe('hold');
  });

  it('a chosen alt branch step computes its own camera', () => {
    const plan = buildPlan({ doc: camDoc, flow: camFlow, choices: { '5': 0 } });
    const branch = plan.beats.find((b) => b.kind === 'msg' && b.title === 'rush');
    expect(branch?.camera.mode).toBe('auto');
    expect(branch?.cameraIds).toEqual(['a', 'c', 'a-c-2']);
  });
});

describe('presentation overrides + narration (UX08-WP13)', () => {
  const withPresentation = (body: string): Beat[] => {
    const d = parse(`pcd 1.0
person a "Ada"
system b "Web"
a -> b as ab
flow "F" as f {
  a -> b : "order" presentation {
${body}
  }
}
`);
    return buildPlan({ doc: d, flow: firstFlow(d) }).beats;
  };

  it('description becomes the beat description, narration stays the title', () => {
    const b = beat(withPresentation('    description "the order leaves the shop"'), 0);
    expect(b.description).toBe('the order leaves the shop');
    expect(b.title).toBe('order');
  });

  it('camera auto keeps the computed participants and adds an explicit duration', () => {
    expect(beat(withPresentation('    camera auto\n    duration 120'), 0).camera).toEqual({
      mode: 'auto',
      durationMs: 120,
    });
  });

  it('camera hold drops the participants (no camera work for the beat)', () => {
    const b = beat(withPresentation('    camera hold'), 0);
    expect(b.camera).toEqual({ mode: 'hold' });
    expect(b.cameraIds).toEqual([]);
  });

  it('camera focus carries the canvas point, zoom and duration', () => {
    expect(beat(withPresentation('    camera focus (420, 180) zoom 1.25 duration 0'), 0).camera).toEqual({
      mode: 'focus',
      x: 420,
      y: 180,
      zoom: 1.25,
      durationMs: 0,
    });
  });
});

describe('flow duration estimate (UX08-WP13)', () => {
  it('sums dwell plus camera transit for every beat', () => {
    const plan = buildPlan({ doc: camDoc, flow: camFlow });
    const camMs = MOTION.cameraMs;
    // 10 beats: intro overview, msg, process, par, alt hold, branch msg, info
    // hold, goto hold, conclusion overview … camera time only where the mode moves
    const moving = plan.beats.filter((b) => b.camera.mode !== 'hold').length;
    const dwelling = plan.beats.length * MOTION.stepDelayMs;
    expect(plan.estimatedMs).toBe(dwelling + moving * camMs);
    expect(moving).toBeGreaterThan(0);
  });

  it('honours per-step dwell and camera overrides', () => {
    const d = parse(`pcd 1.0
person a "Ada"
system b "Web"
a -> b as ab
flow "F" as f {
  a -> b : "order" delay 500 presentation {
    camera auto
    duration 100
  }
  intro "bye"
}
`);
    const plan = buildPlan({ doc: d, flow: firstFlow(d) });
    expect(plan.estimatedMs).toBe(500 + 100 + MOTION.stepDelayMs + MOTION.cameraMs);
  });
});
