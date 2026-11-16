// SPDX-License-Identifier: GPL-3.0-only
// Document icon operations (IR v9, §3.1): add/rename/remove must stay atomic and
// must never leave a reference pointing at nothing. These are the rules the
// management dialog relies on, so they are pinned here without any UI.
import { describe, expect, it } from 'vitest';
import {
  addIcon, declarationProblem, handleProblem, iconInventory, iconUsageCount, iconUsages,
  removeIcon, renameIcon, replaceIcon,
} from './iconOps';
import { encodeIconSvg } from '../format/iconSvg';
import type { Doc, IconDecl } from './types';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
const EVIL = '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>';

const decl = (id: string, svg = SVG): IconDecl => ({
  id,
  mediaType: 'image/svg+xml',
  data: encodeIconSvg(svg),
  pos: { line: 2, col: 1 },
});

const doc = (over: Partial<Doc> = {}): Doc => ({
  irVersion: 9,
  formatVersion: '1.0',
  icons: [],
  imports: [],
  objects: [],
  links: [],
  flows: [],
  views: [],
  styles: [],
  ...over,
});

const withRefs = (): Doc => doc({
  icons: [decl('brand'), decl('spare')],
  objects: [
    { kind: 'system', id: 'a', icon: 'brand', pos: { line: 3, col: 1 } },
    { kind: 'system', id: 'b', style: { icon: 'brand' }, pos: { line: 4, col: 1 } },
    { kind: 'system', id: 'c', icon: 'cloud', pos: { line: 5, col: 1 } },
  ],
  styles: [{ target: 'c', style: { icon: 'brand' }, pos: { line: 6, col: 1 } }],
});

describe('icon handles (§3.1)', () => {
  it('reserves the built-in namespace and the document’s own handles', () => {
    expect(handleProblem(doc(), 'brand')).toBeNull();
    expect(handleProblem(doc(), 'cloud')).toContain('built-in');
    expect(handleProblem(doc(), '1bad')).toContain('starting with a letter');
    expect(handleProblem(doc({ icons: [decl('brand')] }), 'brand')).toContain('already declared');
    // a rename may keep its own handle while ignoring itself
    expect(handleProblem(doc({ icons: [decl('brand')] }), 'brand', 'brand')).toBeNull();
  });

  it('refuses a payload that is unsafe or not SVG', () => {
    expect(declarationProblem(decl('ok'))).toBeNull();
    expect(declarationProblem(decl('evil', EVIL))).toContain('script');
    expect(declarationProblem({ ...decl('png'), mediaType: 'image/png' })).toContain('media type');
    expect(declarationProblem({ ...decl('b64'), data: 'not base64' })).toContain('Base64');
  });

  it('adds, replaces and rejects duplicates', () => {
    const one = addIcon(doc(), decl('brand'));
    expect(one.icons.map((i) => i.id)).toEqual(['brand']);
    expect(() => addIcon(one, decl('brand'))).toThrow();
    expect(() => addIcon(one, decl('cloud'))).toThrow();
    const replaced = replaceIcon(one, decl('brand', EVIL.replace('<script>x</script>', '')));
    expect(replaced.icons[0]?.data).not.toBe(one.icons[0]?.data);
    expect(replaced.icons[0]?.pos).toEqual({ line: 2, col: 1 });
  });
});

describe('renameIcon', () => {
  it('moves the handle and every reference in one transition', () => {
    const before = withRefs();
    const { doc: after, refs } = renameIcon(before, 'brand', 'logo');
    expect(refs).toBe(3);
    expect(after.icons.map((i) => i.id)).toEqual(['logo', 'spare']);
    expect(after.objects[0]?.icon).toBe('logo');
    expect(after.objects[1]?.style?.icon).toBe('logo');
    expect(after.styles[0]?.style.icon).toBe('logo');
    // untouched references stay untouched
    expect(after.objects[2]?.icon).toBe('cloud');
    expect(iconUsages(after, 'brand').objects).toEqual([]);
    expect(iconUsageCount(iconUsages(after, 'logo'))).toBe(3);
  });

  it('refuses a target that is taken, built-in or malformed, leaving the doc alone', () => {
    const before = withRefs();
    expect(() => renameIcon(before, 'brand', 'cloud')).toThrow(/built-in/);
    expect(() => renameIcon(before, 'spare', 'brand')).toThrow(/already declared/);
    expect(() => renameIcon(before, 'brand', 'x y')).toThrow();
    expect(() => renameIcon(before, 'ghost', 'logo')).toThrow(/no icon/);
    expect(before.icons.map((i) => i.id)).toEqual(['brand', 'spare']);
  });
});

describe('removeIcon', () => {
  it('reports usages instead of deleting a referenced icon', () => {
    const res = removeIcon(withRefs(), 'brand');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.refs).toBe(3);
    expect(res.usages.objects).toEqual(['a']);
    expect(res.usages.styleObjects).toEqual(['b']);
    expect(res.usages.styles).toEqual(['c']);
  });

  it('clears references only when the caller asks, and drops an emptied style block', () => {
    const res = removeIcon(withRefs(), 'brand', true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.refs).toBe(3);
    expect(res.doc.icons.map((i) => i.id)).toEqual(['spare']);
    expect(res.doc.objects[0]?.icon).toBeUndefined();
    expect(res.doc.objects[1]?.style).toBeUndefined();
    expect(res.doc.styles[0]?.style.icon).toBeUndefined();
    expect(iconUsageCount(iconUsages(res.doc, 'brand'))).toBe(0);
  });

  it('removes an unused icon without touching anything else', () => {
    const res = removeIcon(withRefs(), 'spare');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.refs).toBe(0);
    expect(res.doc.objects).toHaveLength(3);
  });
});

describe('iconInventory', () => {
  it('counts references per declared icon', () => {
    expect(iconInventory(withRefs())).toEqual([
      { decl: expect.objectContaining({ id: 'brand' }), refs: 3 },
      { decl: expect.objectContaining({ id: 'spare' }), refs: 0 },
    ]);
  });
});
