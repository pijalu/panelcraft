// SPDX-License-Identifier: GPL-3.0-only
// Regression tests: a message step edits the style of the connector it resolves
// to, never a guessed first match. Bounds live here so both inspectors use them.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../format/parser';
import type { Doc, FlowStep } from '../model/types';
import {
  patchMsgLinkStyle,
  resolveMsgLink,
  validSparkCount,
  validSparkSpeed,
} from './linkStyle';

const parse = (text: string): Doc => {
  const { doc } = parsePDL(text);
  if (doc === null) throw new Error('fixture must parse');
  return doc;
};

const docWith = (linkLines: string, step: string): Doc => parse(`pcd 1.0
person a "Ada"
system b "Web"
${linkLines}
flow "Main" as main {
  ${step}
}
`);

const msgStep = (doc: Doc): Extract<FlowStep, { type: 'msg' }> => {
  const step = doc.flows[0]?.steps[0];
  if (step?.type !== 'msg') throw new Error('fixture must hold a message step');
  return step;
};

describe('shared link animation bounds', () => {
  it('accepts only the documented 1–8 count and 0.25–4× speed', () => {
    expect(validSparkCount(1)).toBe(true);
    expect(validSparkCount(8)).toBe(true);
    expect(validSparkCount(0)).toBe(false);
    expect(validSparkCount(9)).toBe(false);
    expect(validSparkCount(1.5)).toBe(false);
    expect(validSparkSpeed(0.25)).toBe(true);
    expect(validSparkSpeed(4)).toBe(true);
    expect(validSparkSpeed(0.2)).toBe(false);
    expect(validSparkSpeed(4.5)).toBe(false);
    expect(validSparkSpeed(Number.NaN)).toBe(false);
  });
});

describe('patchMsgLinkStyle', () => {
  it('patches the link named by linkRef, even when its direction is reversed', () => {
    const doc = docWith('b -> a as ab', 'a -> b : "order" as ab');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 4, speed: 2 })).toBe(true);
    expect(doc.links[0]?.style?.sparks).toBe(4);
    expect(doc.links[0]?.style?.speed).toBe(2);
  });

  it('falls back to a direction-insensitive endpoint match when no ref is authored', () => {
    const doc = docWith('b -> a as ab', 'a -> b : "order"');
    expect(resolveMsgLink(doc, msgStep(doc)).status).toBe('ok');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 3 })).toBe(true);
    expect(doc.links[0]?.style?.sparks).toBe(3);
  });

  it('clears a printed default when a field is set back to null', () => {
    const doc = docWith('a -> b as ab {\n  style {\n    sparks 2\n    speed 2\n  }\n}', 'a -> b : "order"');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: null, speed: null })).toBe(true);
    expect(doc.links[0]?.style?.sparks).toBeUndefined();
    expect(doc.links[0]?.style?.speed).toBeUndefined();
  });

  it('rejects out-of-bounds and non-integer values without touching the link', () => {
    const doc = docWith('a -> b as ab', 'a -> b : "order"');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 9 })).toBe(false);
    expect(patchMsgLinkStyle(doc, msgStep(doc), { speed: 0.1 })).toBe(false);
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 1.5 })).toBe(false);
    expect(doc.links[0]?.style).toBeUndefined();
  });

  it('refuses an invalid linkRef instead of editing the first plausible link', () => {
    const doc = docWith('a -> b as ab {\n  style {\n    sparks 2\n  }\n}', 'a -> b : "order" as ghost');
    const target = resolveMsgLink(doc, msgStep(doc));
    expect(target.status).toBe('unresolved-ref');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 8 })).toBe(false);
    expect(doc.links[0]?.style?.sparks).toBe(2);
  });

  it('refuses an ambiguous endpoint match instead of guessing a connector', () => {
    const doc = docWith('a -> b as L1\nb -> a as L2', 'a -> b : "order"');
    expect(resolveMsgLink(doc, msgStep(doc)).status).toBe('ambiguous');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 8 })).toBe(false);
    expect(doc.links[0]?.style?.sparks).toBeUndefined();
    expect(doc.links[1]?.style?.sparks).toBeUndefined();
  });

  it('reports a missing connector without editing any link', () => {
    const doc = docWith('a -> b as ab', 'b -> b : "order"');
    expect(resolveMsgLink(doc, msgStep(doc)).status).toBe('missing');
    expect(patchMsgLinkStyle(doc, msgStep(doc), { sparks: 8 })).toBe(false);
  });
});
