// SPDX-License-Identifier: GPL-3.0-only
// View model ops tests (M6-WP2, FR-V2/V4) + fade computation (FR-V1).
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Doc } from '../../engine/model/types';
import {
  DEFAULT_VIEW,
  addView,
  deleteView,
  effectiveView,
  fadeSets,
  findView,
  setLayout,
  toggleHideId,
  toggleHideTag,
  togglePin,
  viewNames,
} from './viewDoc';

function docOf(src: string): Doc {
  const { doc } = parsePDL(src);
  if (doc === null) throw new Error('parse failed: ' + src);
  return doc;
}

const SRC = `pcd 1.0
system api "API" { tag backend }
system db "DB" { tag backend storage }
system web "Web" { tag frontend }
api -> db as L1 { tag sync }
api -> web
view "Roadmap" {
  hide tag frontend
  hide web
  pin db
  layout auto TB
  position api (10, 20)
}
`;

describe('effectiveView', () => {
  it('resolves all five line kinds into render state', () => {
    const ev = effectiveView(docOf(SRC), 'Roadmap');
    expect(ev.layout).toEqual({ mode: 'auto', dir: 'TB' });
    expect(ev.hiddenTags).toEqual(new Set(['frontend']));
    expect(ev.hiddenIds).toEqual(new Set(['web']));
    expect(ev.pins).toEqual(new Set(['db']));
    expect(ev.positions.get('api')).toEqual({ x: 10, y: 20 });
  });

  it('implicit default when no view exists (auto, doc direction, everything visible)', () => {
    const d = docOf('pcd 1.0\ndirection TB\nsystem a "A"\n');
    const ev = effectiveView(d);
    expect(ev.layout).toEqual({ mode: 'auto', dir: 'TB' });
    expect(ev.hiddenTags.size).toBe(0);
    expect(ev.positions.size).toBe(0);
  });

  it('unknown view name falls back to implicit default', () => {
    const ev = effectiveView(docOf(SRC), 'Missing');
    expect(ev.layout).toEqual({ mode: 'auto', dir: 'LR' });
    expect(ev.hiddenTags.size).toBe(0);
  });

  it('layout saved resolves to saved mode', () => {
    const ev = effectiveView(docOf('pcd 1.0\nview "V" {\n layout saved\n position a (1, 2)\n}\nsystem a "A"\n'), 'V');
    expect(ev.layout).toEqual({ mode: 'saved' });
    expect(ev.positions.get('a')).toEqual({ x: 1, y: 2 });
  });
});

describe('view ops via retext round-trip', () => {
  it('addView + viewNames', () => {
    const d = docOf(SRC);
    addView(d, 'Audit');
    expect(viewNames(d)).toEqual(['Roadmap', 'Audit']);
    addView(d, 'Audit'); // no-op on duplicate
    expect(viewNames(d)).toHaveLength(2);
  });

  it('deleteView', () => {
    const d = docOf(SRC);
    deleteView(d, 'Roadmap');
    expect(viewNames(d)).toEqual([]);
  });

  it('toggleHideTag adds then removes hide-tag lines (round-trips through print)', () => {
    const d = docOf('pcd 1.0\nsystem a "A"\nview "V" {\n}\n');
    toggleHideTag(d, 'V', 'external');
    const t1 = printDoc(d);
    expect(t1).toContain('hide tag external');
    const again = docOf(t1);
    toggleHideTag(again, 'V', 'external');
    expect(printDoc(again)).not.toContain('hide tag');
  });

  it('toggleHideId / togglePin add then remove their lines', () => {
    const d = docOf('pcd 1.0\nsystem a "A"\n');
    toggleHideId(d, undefined, 'a'); // creates implicit Default view
    togglePin(d, undefined, 'a');
    const printed = printDoc(d);
    expect(printed).toContain('hide a');
    expect(printed).toContain('pin a');
    expect(findView(d, DEFAULT_VIEW)).toBeDefined();
    const reparsed = docOf(printed);
    toggleHideId(reparsed, DEFAULT_VIEW, 'a');
    togglePin(reparsed, DEFAULT_VIEW, 'a');
    const out = printDoc(reparsed);
    expect(out).not.toContain('hide a');
    expect(out).not.toContain('pin a');
  });

  it('setLayout replaces the layout line (latest wins), auto keeps dir', () => {
    const d = docOf(SRC);
    setLayout(d, 'Roadmap', 'saved');
    expect(effectiveView(d, 'Roadmap').layout).toEqual({ mode: 'saved' });
    setLayout(d, 'Roadmap', 'auto', 'BT');
    expect(effectiveView(d, 'Roadmap').layout).toEqual({ mode: 'auto', dir: 'BT' });
    const printed = printDoc(d);
    expect(printed.match(/layout /g)).toHaveLength(1);
  });
});

describe('fadeSets (FR-V1)', () => {
  it('no filter → nothing fades', () => {
    const d = docOf(SRC);
    const f = fadeSets(d, effectiveView(d, 'Fresh'));
    expect(f.objects.size).toBe(0);
    expect(f.links.size).toBe(0);
  });

  it('tag filter: matching objects stay crisp, untagged fade, links fade only when both endpoints fade', () => {
    const d = docOf(SRC);
    const ev = effectiveView(docOf('pcd 1.0\nview "V" {\n hide tag backend\n}\n'), 'V');
    const f = fadeSets(d, ev);
    expect(f.objects.has('api')).toBe(false); // backend tag → crisp
    expect(f.objects.has('db')).toBe(false);
    expect(f.objects.has('web')).toBe(true); // frontend/untagged → fade
    expect(f.links.has('L1')).toBe(false); // api→db: both crisp
    expect(f.links.has('api-web')).toBe(false); // api crisp + web faded → link stays crisp
  });

  it('link fades when BOTH endpoints faded (or element-hidden by id)', () => {
    const d = docOf(SRC);
    const ev = effectiveView(docOf('pcd 1.0\nview "V" {\n hide tag storage\n}\n'), 'V');
    const f = fadeSets(d, ev);
    expect(f.objects.has('api')).toBe(true); // no storage tag → fade
    expect(f.objects.has('db')).toBe(false); // storage → crisp
    expect(f.objects.has('web')).toBe(true);
    expect(f.links.has('api-db')).toBe(false); // db crisp → link crisp
    expect(f.links.has('api-web')).toBe(true); // both endpoints faded
  });

  it('hide id fades that object and any link explicitly hidden', () => {
    const d = docOf(SRC);
    const ev = effectiveView(d, 'Roadmap'); // hide web + hide tag frontend
    const f = fadeSets(d, ev);
    expect(f.objects.has('web')).toBe(true);
    expect(f.links.has('L1')).toBe(true); // api + db both fade (no frontend tag) → L1 fades
  });
});
