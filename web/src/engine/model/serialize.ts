// SPDX-License-Identifier: GPL-3.0-only
// Canonical IR JSON serializer (M1-WP1). Key order is FIXED and mirrored by
// internal/ir (Go) — corpus parity (M1-WP8) requires byte-identical output.
// Empty collections and absent scalars are omitted on both sides.

import type {
  Branch, CameraSpec, Comments, Doc, Flow, FlowStep, IconDecl, ImportStmt, Link, Obj,
  Pos, Property, RawAttr, StyleBlock, StyleStmt,
} from './types';
import { IR_VERSION } from './types';

type JSONRecord = Record<string, unknown>;

type Entry = [string, unknown];

/** Fixed-order object builder; skips undefined values (omitted in JSON). */
function obj(...entries: Entry[]): JSONRecord {
  const out: JSONRecord = {};
  for (const [key, value] of entries) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const pos = (p: Pos): JSONRecord => ({ line: p.line, col: p.col });

const comments = (c?: Comments): Entry => ['comments', c];

const properties = (props?: Property[]): Entry => [
  'properties',
  props?.map((pr) => ({ key: pr.key, value: pr.value })),
];

const rawAttrs = (raw?: RawAttr[]): Entry => [
  'raw',
  raw?.map((r) => obj(['raw', r.raw], ['pos', pos(r.pos)], comments(r.comments))),
];

function styleBlock(s?: StyleBlock): Entry {
  if (!s) return ['style', undefined];
  const inner = obj(
    ['fill', s.fill],
    ['stroke', s.stroke],
    ['text', s.text],
    ['icon', s.icon],
    ['shape', s.shape],
    ['dashed', s.dashed === true ? true : undefined],
    ['head', s.head],
    ['tail', s.tail],
    ['line', s.line],
    ['route', s.route],
    ['width', s.width],
    ['sparks', s.sparks],
    ['speed', s.speed],
    rawAttrs(s.raw),
  );
  return ['style', Object.keys(inner).length > 0 ? inner : undefined];
}

const importStmt = (imp: ImportStmt): JSONRecord =>
  obj(['alias', imp.alias], ['path', imp.path], comments(imp.comments), ['pos', pos(imp.pos)]);

const iconDecl = (ic: IconDecl): JSONRecord =>
  obj(
    ['id', ic.id],
    ['label', ic.label],
    ['mediaType', ic.mediaType],
    ['data', ic.data],
    comments(ic.comments),
    ['pos', pos(ic.pos)],
  );

const objectStmt = (o: Obj): JSONRecord =>
  obj(
    ['kind', o.kind],
    ['id', o.id],
    ['name', o.name],
    ['description', o.description],
    ['technology', o.technology],
    ['tags', arr(o.tags ?? [])],
    properties(o.properties),
    ['contains', arr(o.contains ?? [])],
    ['attach', o.attach],
    ['icon', o.icon],
    ['size', o.size === undefined ? undefined : { w: o.size.w, h: o.size.h }],
    ['z', o.z],
    ['drilldown',
      o.drilldown === undefined
        ? undefined
        : o.drilldown.kind === 'linked'
          ? obj(['kind', 'linked'], ['path', o.drilldown.path])
          : obj(['kind', 'embedded'], ['path', o.drilldown.path], ['doc', docJson(o.drilldown.doc)])],
    ['source',
      o.source === undefined
        ? undefined
        : obj(['language', o.source.language], ['lines', o.source.lines])],
    styleBlock(o.style),
    [
      'attributes',
      o.attributes?.map((r) => obj(['raw', r.raw], ['pos', pos(r.pos)], comments(r.comments))),
    ],
    comments(o.comments),
    ['pos', pos(o.pos)],
  );

const linkStmt = (l: Link): JSONRecord =>
  obj(
    ['id', l.id],
    ['from', l.from],
    ['to', l.to],
    ['type', l.type],
    ['label', l.label],
    ['bidir', l.bidir === true ? true : undefined],
    ['tags', arr(l.tags ?? [])],
    styleBlock(l.style),
    ['waypoints', arr(l.waypoints ?? [])],
    ['fromAnchor', l.fromAnchor],
    ['toAnchor', l.toAnchor],
    ['allowOverlap', l.allowOverlap === true ? true : undefined],
    [
      'attributes',
      l.attributes?.map((r) => obj(['raw', r.raw], ['pos', pos(r.pos)], comments(r.comments))),
    ],
    comments(l.comments),
    ['pos', pos(l.pos)],
  );

const branchToJSON = (b: Branch): JSONRecord =>
  obj(
    ['label', b.label],
    ['steps', arr(b.steps.map(stepToJSON))],
    comments(b.comments),
    ['pos', pos(b.pos)],
  );

const stepBuilders: Record<string, (s: FlowStep) => Entry[]> = {
  intro: (s) => [['text', (s as { text: string }).text]],
  msg: (s) => {
    const m = s as { from: string; to: string; label?: string; linkRef?: string; flip?: boolean };
    return [
      ['from', m.from],
      ['to', m.to],
      ['label', m.label],
      ['linkRef', m.linkRef],
      ['flip', m.flip === true ? true : undefined],
    ];
  },
  process: (s) => {
    const pr = s as { target: string; text?: string };
    return [['text', pr.text], ['target', pr.target]];
  },
  alt: (s) => {
    const a = s as { label?: string; branches: Branch[] };
    return [['label', a.label], ['branches', arr(a.branches.map(branchToJSON))]];
  },
  par: (s) => {
    const p = s as { label?: string; lanes: FlowStep[][] };
    return [['label', p.label], ['lanes', arr(p.lanes.map((lane) => arr(lane.map(stepToJSON))))]];
  },
  goto: (s) => {
    const g = s as { file?: string; flow: string; ret?: 'here' };
    return [['file', g.file], ['flow', g.flow], ['ret', g.ret]];
  },
  info: (s) => [['text', (s as { text: string }).text]],
  conclusion: (s) => [['text', (s as { text: string }).text]],
};

const cameraJSON = (c?: CameraSpec): Entry => [
  'camera',
  c === undefined
    ? undefined
    : obj(
      ['mode', c.mode],
      ['x', c.x],
      ['y', c.y],
      ['zoom', c.zoom],
      ['durationMs', c.durationMs],
    ),
];

const stepToJSON = (s: FlowStep): JSONRecord => {
  const build = stepBuilders[s.type];
  const payload = build ? build(s) : [];
  return obj(
    ['type', s.type],
    ...payload,
    ['delayMs', s.delayMs],
    ['description', s.description],
    cameraJSON(s.camera),
    comments(s.comments),
    ['pos', pos(s.pos)],
  );
};

const flowStmt = (f: Flow): JSONRecord =>
  obj(
    ['id', f.id],
    ['title', f.title],
    ['description', f.description],
    ['descriptionLines', f.descriptionLines],
    ['presentation', f.presentation === true ? true : undefined],
    ['steps', arr(f.steps.map(stepToJSON))],
    comments(f.comments),
    ['pos', pos(f.pos)],
  );

/**
 * Top-level layout state (ADR 0007). Fixed key order mirrors internal/ir; empty
 * collections are omitted, matching the other document-level collections.
 */
const layoutState = (l: Doc['layout']): Entry => [
  'layout',
  l === undefined
    ? undefined
    : obj(
      ['directive',
        l.directive === undefined
          ? undefined
          : l.directive.mode === 'saved'
            ? obj(['mode', 'saved'])
            : obj(['mode', 'auto'], ['dir', l.directive.dir])],
      ['positions', arr(l.positions.map((p) => obj(['id', p.id], ['x', p.x], ['y', p.y])))],
      ['pins', arr(l.pins)],
      ['hidden', arr(l.hidden)],
      ['hiddenTags', arr(l.hiddenTags)],
      comments(l.comments),
      ['pos', pos(l.pos)],
    ),
];

const styleStmt = (st: StyleStmt): JSONRecord => {
  const [, inner] = styleBlock(st.style);
  return obj(
    ['target', st.target],
    ['style', inner],
    comments(st.comments),
    ['pos', pos(st.pos)],
  );
};

/** Non-empty array or undefined (empty collections are omitted in IR JSON). */
const arr = (xs: unknown[]): unknown[] | undefined => (xs.length > 0 ? xs : undefined);

/** Canonical field order for one document, reused by embedded children. */
function docJson(doc: Doc): JSONRecord {
  return obj(
    ['irVersion', doc.irVersion ?? IR_VERSION],
    ['formatVersion', doc.formatVersion],
    ['title', doc.title],
    ['level', doc.level],
    ['direction', doc.direction],
    ['theme', doc.theme],
    comments(doc.comments),
    ['imports', arr(doc.imports.map(importStmt))],
    ['icons', arr(doc.icons.map(iconDecl))],
    ['objects', arr(doc.objects.map(objectStmt))],
    ['links', arr(doc.links.map(linkStmt))],
    ['flows', arr(doc.flows.map(flowStmt))],
    layoutState(doc.layout),
    ['styles', arr(doc.styles.map(styleStmt))],
  );
}

/** Serialize a Doc to canonical IR JSON (deterministic key order, 2-space indent). */
export function serializeDoc(doc: Doc): string {
  return JSON.stringify(docJson(doc), null, 2);
}
