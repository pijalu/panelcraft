// SPDX-License-Identifier: GPL-3.0-only
// Top-level layout model tests (ADR 0007): effective layout resolution, the
// document hide/pin mutations, and fade computation (FR-V1).
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import type { Doc } from '../engine/model/types';
import {
  effectiveLayout, fadeSets, setLayoutDirective, toggleHideId, toggleHideTag, togglePin,
} from './layoutDoc';

const docOf = (src: string): Doc => {
  const { doc } = parsePDL(src);
  if (doc === null) throw new Error('parse failed: ' + src);
  return doc;
};

const SRC = `pcd 1.0
system api "API" { tag backend }
system db "DB" { tag backend storage }
system web "Web" { tag frontend }
api -> db as L1 { tag sync }
api -> web
hide tag frontend
hide web
pin db
layout auto TB
position api (10, 20)
`;

describe('effectiveLayout', () => {
  it('resolves the top-level layout into render state', () => {
    const ev = effectiveLayout(docOf(SRC));
    expect(ev.layout).toEqual({ mode: 'auto', dir: 'TB' });
    expect(ev.hiddenTags).toEqual(new Set(['frontend']));
    expect(ev.hiddenIds).toEqual(new Set(['web']));
    expect(ev.pins).toEqual(new Set(['db']));
    expect(ev.positions.get('api')).toEqual({ x: 10, y: 20 });
  });

  it('implicit layout when no layout block exists (auto, doc direction, all visible)', () => {
    const ev = effectiveLayout(docOf('pcd 1.0\ndirection TB\nsystem a "A"\n'));
    expect(ev.layout).toEqual({ mode: 'auto', dir: 'TB' });
    expect(ev.hiddenTags.size).toBe(0);
    expect(ev.positions.size).toBe(0);
  });

  it('layout saved resolves to saved mode', () => {
    const ev = effectiveLayout(docOf('pcd 1.0\nlayout saved\nposition a (1, 2)\nsystem a "A"\n'));
    expect(ev.layout).toEqual({ mode: 'saved' });
    expect(ev.positions.get('a')).toEqual({ x: 1, y: 2 });
  });
});

describe('layout mutations via print round-trip', () => {
  it('toggleHideTag adds then removes a hide-tag line', () => {
    const d = docOf('pcd 1.0\nsystem a "A"\n');
    toggleHideTag(d, 'external');
    expect(printDoc(d)).toContain('hide tag external');
    toggleHideTag(d, 'external');
    expect(printDoc(d)).not.toContain('hide tag');
  });

  it('toggleHideId / togglePin add then remove their lines', () => {
    const d = docOf('pcd 1.0\nsystem a "A"\n');
    toggleHideId(d, 'a');
    togglePin(d, 'a');
    const printed = printDoc(d);
    expect(printed).toContain('hide a');
    expect(printed).toContain('pin a');
    const reparsed = docOf(printed);
    toggleHideId(reparsed, 'a');
    togglePin(reparsed, 'a');
    const out = printDoc(reparsed);
    expect(out).not.toContain('hide a');
    expect(out).not.toContain('pin a');
  });

  it('setLayoutDirective replaces the directive but keeps positions', () => {
    const d = docOf(SRC);
    setLayoutDirective(d, 'saved');
    expect(effectiveLayout(d).layout).toEqual({ mode: 'saved' });
    setLayoutDirective(d, 'auto', 'BT');
    expect(effectiveLayout(d).layout).toEqual({ mode: 'auto', dir: 'BT' });
    expect(printDoc(d).match(/layout /g)).toHaveLength(1);
    expect(printDoc(d)).toContain('position api (10, 20)');
  });
});

describe('fadeSets (FR-V1)', () => {
  it('no hides → nothing fades', () => {
    const d = docOf(SRC);
    const f = fadeSets(d, effectiveLayout(docOf('pcd 1.0\nsystem api "API"\n')));
    expect(f.objects.size).toBe(0);
    expect(f.links.size).toBe(0);
  });

  it('tag filter: matching objects stay crisp, untagged fade, links fade only when both endpoints fade', () => {
    const d = docOf(SRC);
    const ev = effectiveLayout(docOf('pcd 1.0\nhide tag backend\n'));
    const f = fadeSets(d, ev);
    expect(f.objects.has('api')).toBe(false);
    expect(f.objects.has('db')).toBe(false);
    expect(f.objects.has('web')).toBe(true);
    expect(f.links.has('L1')).toBe(false);
    expect(f.links.has('api-web')).toBe(false);
  });

  it('link fades when BOTH endpoints faded', () => {
    const d = docOf(SRC);
    const f = fadeSets(d, effectiveLayout(docOf('pcd 1.0\nhide tag storage\n')));
    expect(f.objects.has('api')).toBe(true);
    expect(f.objects.has('db')).toBe(false);
    expect(f.objects.has('web')).toBe(true);
    expect(f.links.has('api-db')).toBe(false);
    expect(f.links.has('api-web')).toBe(true);
  });

  it('hide id fades that object; element-hidden link fades too', () => {
    const f = fadeSets(docOf(SRC), effectiveLayout(docOf(SRC)));
    expect(f.objects.has('web')).toBe(true);
    expect(f.links.has('L1')).toBe(true);
  });
});
