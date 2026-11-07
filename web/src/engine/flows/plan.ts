// SPDX-License-Identifier: GPL-3.0-only
// Playback plan builder (M5-WP1, PLAN §7; SPEC FR-F1/F2; FILE-FORMAT §6).
//
// Pure step-machine: a parsed Doc + Flow in, a flat list of playback Beats out.
// No DOM, no timers — the executor (engine/anim + ui) consumes Beats, so this
// module is unit-testable in isolation and deterministic (handover protocol c/d).
//
// Semantics implemented here:
// - msg steps resolve to an existing link via direction-insensitive pair match;
//   `as RefId` disambiguates, `flip` reverses the travel direction (FR-F2).
// - alt expands to a chooser beat + the CHOSEN branch's beats (default first);
//   the choice is a playback-time concern, never stored (FILE-FORMAT §6).
// - par becomes ONE beat whose lanes are concurrent sub-beats (same index).
// - goto produces a navigation beat; same-file and cross-file targets resolve
//   through the injected resolveFlow (imports NOT required — §6).
// - dim sets: every object/link id NOT participating in the beat (FR-F4 25%).
//   Link ids use the canvas-side id rule (canvasLinkId) so the executor can
//   address rendered elements directly.
import type { Doc, Flow, FlowStep, Link, Obj } from '../model/types';
import { MOTION } from '../anim/timings';

/** Canvas-side link id: explicit id or the from-to-index fallback (workspace
 * docToState uses the same rule — single source of truth for anim targeting). */
export function canvasLinkId(l: Pick<Link, 'from' | 'to' | 'id'>, i: number): string {
  return l.id ?? `${l.from}-${l.to}-${i}`;
}

export interface BeatLink {
  /** canvas-side link id (data-id of the rendered g.pc-link) */
  linkId: string;
  /** travel endpoints AFTER flip resolution (token runs from→to) */
  from: string;
  to: string;
  flipped: boolean;
}

export interface BeatGoto {
  file?: string;
  flow: string;
  ret?: 'here';
  /** title of the target flow, when the injected resolver knows it */
  targetTitle?: string;
}

export interface Beat {
  /** 1-based playback beat number (badges, step±) */
  index: number;
  kind: FlowStep['type'];
  /** narration text (ARIA live region, FR-F2/F5) */
  title: string;
  /** focus object ids: camera target + emphasis ring (FR-F4) */
  actors: string[];
  /** animated links (msg beats, possibly flipped) */
  links: BeatLink[];
  /** every other object/link id — dimmed to 25% while the beat plays */
  dim: string[];
  /** auto-advance delay (FR-F3; theme config default) */
  delayMs: number;
  /** alt beats: label of the chosen branch */
  branch?: string;
  /** par beats: lane sub-beat lists, played concurrently under the same index */
  lanes?: Beat[][];
  /** goto beats: navigation target (FR-F2) */
  goto?: BeatGoto;
}

export interface AltInfo {
  /** path/id of the chooser beat — the choice key for buildPlan */
  path: string;
  label?: string;
  branches: string[];
}

/** Resolve a goto target; returns the target flow's title when known. */
export type FlowResolver = (file: string | undefined, flow: string) => { title?: string } | null;

export interface PlanInput {
  doc: Doc;
  flow: Flow;
  /** branch choice per chooser beat path (missing → first branch, FR-F2) */
  choices?: Record<string, number>;
  /** per-step auto delay override (FR-F3); default MOTION.stepDelayMs */
  delayMs?: number;
  /** goto target lookup (same/cross file); omit → unresolved breadcrumb */
  resolveFlow?: FlowResolver;
}

export interface PlaybackPlan {
  flowId?: string;
  flowTitle: string;
  beats: Beat[];
  /** all alt choosers in the flow, in order (editor UI + chooser dialog) */
  alts: AltInfo[];
}

// --- step machine -----------------------------------------------------------

interface MsgStepLike {
  from: string;
  to: string;
  label?: string;
  linkRef?: string;
  flip?: boolean;
}

interface ResolveCtx {
  doc: Doc;
  choices: Record<string, number>;
  delayMs: number;
  resolveFlow?: FlowResolver;
}

/** Direction-insensitive pair match; `as RefId` wins; first match otherwise. */
export function resolveMsg(doc: Doc, s: MsgStepLike): { link: Link; index: number } | null {
  const pick = (i: number): { link: Link; index: number } | null => {
    const link = doc.links[i];
    return link === undefined ? null : { link, index: i };
  };
  if (s.linkRef !== undefined) return pick(doc.links.findIndex((l) => l.id === s.linkRef));
  return pick(
    doc.links.findIndex(
      (l) => (l.from === s.from && l.to === s.to) || (l.from === s.to && l.to === s.from),
    ),
  );
}

const nameOf = (doc: Doc, id: string): string =>
  doc.objects.find((o) => o.id === id)?.name ?? id;

const msgTitle = (doc: Doc, s: MsgStepLike): string =>
  s.label ?? `${nameOf(doc, s.from)} → ${nameOf(doc, s.to)}`;

function beatLink(doc: Doc, s: MsgStepLike): BeatLink | null {
  const r = resolveMsg(doc, s);
  if (r === null) return null;
  const flipped = s.flip === true;
  return {
    linkId: canvasLinkId(r.link, r.index),
    from: flipped ? s.to : s.from,
    to: flipped ? s.from : s.to,
    flipped,
  };
}

/** Beats contributed by a step (alt expands to chooser + chosen branch).
 * `next` is the shared beat counter: alt branch steps continue the numbering. */
function stepBeats(s: FlowStep, ctx: ResolveCtx, index: number, next: { i: number }): Beat[] {
  switch (s.type) {
    case 'msg':
      return msgBeat(s, ctx, index);
    case 'process':
      return processBeat(s, ctx, index);
    case 'alt':
      return altBeats(s, ctx, index, next);
    case 'par':
      return parBeat(s, ctx, index);
    case 'goto':
      return gotoBeat(s, ctx, index);
    case 'intro':
    case 'info':
    case 'conclusion':
      return textBeat(s, ctx, index);
  }
}

const msgBeat = (s: MsgStepLike & { type: 'msg' }, ctx: ResolveCtx, index: number): Beat[] => {
  const link = beatLink(ctx.doc, s);
  return [
    {
      index,
      delayMs: ctx.delayMs,
      kind: 'msg',
      title: msgTitle(ctx.doc, s),
      actors: [s.from, s.to],
      links: link === null ? [] : [link],
      dim: [],
    },
  ];
};

const processBeat = (s: { target: string; text?: string }, ctx: ResolveCtx, index: number): Beat[] => [
  {
    index,
    delayMs: ctx.delayMs,
    kind: 'process',
    title: s.text ?? nameOf(ctx.doc, s.target),
    actors: [s.target],
    links: [],
    dim: [],
  },
];

const altBeats = (
  s: { label?: string; branches: { label: string; steps: FlowStep[] }[] },
  ctx: ResolveCtx,
  index: number,
  next: { i: number },
): Beat[] => {
  const pick = ctx.choices[String(index)] ?? 0;
  const branch = s.branches[pick] ?? s.branches[0];
  return [
    {
      index,
      delayMs: ctx.delayMs,
      kind: 'alt',
      title: s.label ?? 'choose a path',
      actors: [],
      links: [],
      dim: [],
      ...(branch === undefined ? {} : { branch: branch.label }),
    },
    ...branchSteps(branch, ctx, next),
  ];
};

const parBeat = (s: { label?: string; lanes: FlowStep[][] }, ctx: ResolveCtx, index: number): Beat[] => {
  const lanes = s.lanes.map((lane) => laneBeats(lane, ctx, index));
  // the par beat itself is on stage for the union of its lanes' actors
  const actors = [...new Set(lanes.flat().flatMap((b) => b.actors))];
  return [
    {
      index,
      delayMs: ctx.delayMs,
      kind: 'par',
      title: s.label ?? 'in parallel',
      actors,
      links: [],
      dim: [],
      lanes,
    },
  ];
};

const gotoBeat = (s: { file?: string; flow: string; ret?: 'here' }, ctx: ResolveCtx, index: number): Beat[] => {
  const resolved = ctx.resolveFlow?.(s.file, s.flow) ?? null;
  const where = s.file === undefined ? s.flow : `${s.file}#${s.flow}`;
  return [
    {
      index,
      delayMs: ctx.delayMs,
      kind: 'goto',
      title: resolved?.title === undefined ? `goto ${where}` : `goto ${resolved.title}`,
      actors: [],
      links: [],
      dim: [],
      goto: {
        ...(s.file === undefined ? {} : { file: s.file }),
        flow: s.flow,
        ...(s.ret === undefined ? {} : { ret: s.ret }),
        ...(resolved?.title === undefined ? {} : { targetTitle: resolved.title }),
      },
    },
  ];
};

/** intro / info / conclusion: one text beat, no dimming, no camera. */
const textBeat = (
  s: { type: 'intro' | 'info' | 'conclusion'; text: string },
  ctx: ResolveCtx,
  index: number,
): Beat[] => [
  { index, delayMs: ctx.delayMs, kind: s.type, title: s.text, actors: [], links: [], dim: [] },
];

/** Steps of the chosen alt branch, continuing the beat numbering. */
function branchSteps(branch: { steps: FlowStep[] } | undefined, ctx: ResolveCtx, next: { i: number }): Beat[] {
  if (branch === undefined) return [];
  const out: Beat[] = [];
  for (const st of branch.steps) {
    next.i += 1;
    out.push(...stepBeats(st, ctx, next.i, next));
  }
  return out;
}

/** Flatten a par lane into sub-beats sharing the parent's index. */
function laneBeats(lane: FlowStep[], ctx: ResolveCtx, index: number): Beat[] {
  const out: Beat[] = [];
  const same = { i: index };
  for (const st of lane) out.push(...stepBeats(st, ctx, index, same));
  return out;
}

// --- dim sets ---------------------------------------------------------------

const participantsOf = (b: Beat, acc: Set<string>): void => {
  for (const id of b.actors) acc.add(id);
  for (const l of b.links) {
    acc.add(l.linkId);
    acc.add(l.from);
    acc.add(l.to);
  }
  for (const lane of b.lanes ?? []) for (const sub of lane) participantsOf(sub, acc);
};

/** Every id (objects + links) NOT on stage during the beat, in universe order
 * (objects then links). Beats with no participants (intro/info/conclusion,
 * goto, alt chooser) dim NOTHING — overview means the whole scene (FR-F2). */
function dimSet(b: Beat, all: string[]): string[] {
  const on = new Set<string>();
  participantsOf(b, on);
  return on.size === 0 ? [] : all.filter((id) => !on.has(id));
}

// --- public entry -----------------------------------------------------------

/** All alt choosers in the flow tree, in playback order. */
export function collectAlts(flow: Flow): AltInfo[] {
  const out: AltInfo[] = [];
  const walk = (steps: FlowStep[], counter: { i: number }): void => {
    for (const s of steps) {
      counter.i += 1;
      if (s.type === 'alt') {
        out.push({
          path: String(counter.i),
          ...(s.label === undefined ? {} : { label: s.label }),
          branches: s.branches.map((b) => b.label),
        });
        for (const b of s.branches) walk(b.steps, counter);
      }
      // par lanes are concurrent — their steps share the par beat's index and
      // are NOT chooser carriers (alt inside par is v1-discouraged; unused).
    }
  };
  walk(flow.steps, { i: 0 });
  return out;
}

/** Beats of one step, with its per-step dwell applied (F-18). */
function beatsForStep(s: FlowStep, ctx: ResolveCtx, index: number, next: { i: number }): Beat[] {
  const produced = stepBeats(s, ctx, index, next);
  if (s.delayMs !== undefined) for (const b of produced) b.delayMs = s.delayMs;
  return produced;
}

export function buildPlan(input: PlanInput): PlaybackPlan {
  const { doc, flow } = input;
  const ctx: ResolveCtx = {
    doc,
    choices: input.choices ?? {},
    delayMs: input.delayMs ?? MOTION.stepDelayMs,
    ...(input.resolveFlow === undefined ? {} : { resolveFlow: input.resolveFlow }),
  };
  const beats: Beat[] = [];
  const next = { i: 0 };
  for (const s of flow.steps) {
    next.i += 1;
    beats.push(...beatsForStep(s, ctx, next.i, next));
  }
  // numbering is final — compute dim sets over the complete id universe
  const all = [...doc.objects.map((o: Obj) => o.id), ...doc.links.map((l, li) => canvasLinkId(l, li))];
  for (const b of beats) {
    b.dim = dimSet(b, all);
    for (const lane of b.lanes ?? []) {
      for (const sub of lane) sub.dim = [];
    }
  }
  return { ...(flow.id === undefined ? {} : { flowId: flow.id }), flowTitle: flow.title ?? flow.id ?? '?', beats, alts: collectAlts(flow) };
}
