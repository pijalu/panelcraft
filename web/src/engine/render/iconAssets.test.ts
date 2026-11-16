// SPDX-License-Identifier: GPL-3.0-only
// Project-icon rendering (IR v9, FILE-FORMAT §3.1): a document icon is drawn as
// an <image> of its own sanitized bytes, and a payload that fails the allowlist
// is not drawn at all. These tests pin both halves — the shape of the emitted
// glyph and the refusal — plus the auto-fit reservation so a project icon gets
// the same band a built-in glyph gets.
import { describe, expect, it } from 'vitest';
import { shapeGlyphs, contentBox, type SceneObject } from './shapes';
import { autoSize, stubMeasurer } from './measure';
import {
  iconAssetsOf, iconDataUri, iconProblem, assetFor, sameIconAssets, type IconAsset,
} from './iconAssets';
import { encodeIconSvg } from '../format/iconSvg';
import { parsePDL } from '../format/parser';
import type { Doc, IconDecl } from '../model/types';

const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
const EVIL_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

const decl = (id: string, svg: string): IconDecl => ({
  id,
  mediaType: 'image/svg+xml',
  data: encodeIconSvg(svg),
  pos: { line: 1, col: 1 },
});

const docOf = (icons: IconDecl[]): Doc => ({
  irVersion: 9,
  formatVersion: '1.0',
  imports: [],
  icons,
  objects: [],
  links: [],
  flows: [],
  views: [],
  styles: [],
});

const sceneObj = (over: Partial<SceneObject> = {}): SceneObject => ({
  id: 'o1',
  kind: 'system',
  x: 0,
  y: 0,
  w: 160,
  h: 80,
  name: 'Checkout',
  ...over,
});

const asset = (svg = SAFE_SVG): IconAsset => iconAssetsOf(docOf([decl('x', svg)])).get('x') as IconAsset;

describe('project icon assets (IR v9)', () => {
  it('resolves usable declarations and drops unsafe ones', () => {
    const assets = iconAssetsOf(docOf([decl('brand', SAFE_SVG), decl('evil', EVIL_SVG)]));
    expect([...assets.keys()]).toEqual(['brand']);
    expect(assets.get('brand')?.text).toBe(SAFE_SVG);
    expect(assetFor('evil', assets)).toBeUndefined();
    expect(assetFor('brand', assets)).toBeDefined();
    expect(assetFor(undefined, assets)).toBeUndefined();
  });

  it('explains why a declaration cannot be drawn', () => {
    expect(iconProblem(decl('brand', SAFE_SVG))).toBeNull();
    expect(iconProblem(decl('evil', EVIL_SVG))).toContain('script');
  });

  it('compares assets by handle and payload, not by Map identity', () => {
    const a = iconAssetsOf(docOf([decl('brand', SAFE_SVG)]));
    const b = iconAssetsOf(docOf([decl('brand', SAFE_SVG)]));
    expect(b).not.toBe(a);
    expect(sameIconAssets(a, b)).toBe(true);
    expect(sameIconAssets(a, new Map())).toBe(false);
    expect(sameIconAssets(a, iconAssetsOf(docOf([decl('brand', EVIL_SVG)])))).toBe(false);
  });

  it('embeds the payload as a local data URI (never a fetch)', () => {
    const uri = iconDataUri(asset());
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(uri).not.toContain('http');
  });
});

describe('project icon glyphs', () => {
  it('draws an <image> in the icon band and keeps the label inline', () => {
    const spec = sceneObj({ icon: 'brand', iconAsset: asset() });
    const image = shapeGlyphs(spec).find((s) => s.tag === 'image');
    expect(image).toBeDefined();
    expect(String(image?.attrs.href)).toContain('data:image/svg+xml;base64,');
    // the icon keeps the shared top-centre band, not a right-side inset
    expect(contentBox(spec).icon).not.toBeNull();
  });

  it('never draws an icon the document did not deliver', () => {
    // name only (no asset, not a built-in): nothing reserves space, nothing draws
    const orphan = sceneObj({ icon: 'brand' });
    expect(shapeGlyphs(orphan).some((s) => s.tag === 'image')).toBe(false);
    expect(contentBox(orphan).icon).toBeNull();
    // and a built-in still draws its own path glyph
    const builtIn = sceneObj({ icon: 'cloud' });
    expect(shapeGlyphs(builtIn).some((s) => s.tag === 'path')).toBe(true);
  });

  it('reserves the same icon band as a built-in when fitting a box', () => {
    const builtIn = autoSize({ text: 'Checkout', kind: 'system', icon: 'cloud' }, stubMeasurer);
    const project = autoSize(
      { text: 'Checkout', kind: 'system', icon: 'brand', iconAsset: asset() },
      stubMeasurer,
    );
    expect(project).toEqual(builtIn);
    const none = autoSize({ text: 'Checkout', kind: 'system' }, stubMeasurer);
    expect(project.h).toBeGreaterThan(none.h);
  });
});

describe('project icons are reachable from PDL', () => {
  it('round-trips a declared icon into drawable scene state', () => {
    const src = `pcd 1.0
icon brand {
  media "image/svg+xml"
  data "${encodeIconSvg(SAFE_SVG)}"
}
system shop "Webshop" {
  icon brand
}
`;
    const { doc } = parsePDL(src);
    expect(doc?.icons).toHaveLength(1);
    const assets = iconAssetsOf(doc as Doc);
    const spec = sceneObj({ icon: doc?.objects[0]?.icon, iconAsset: assets.get('brand') });
    expect(shapeGlyphs(spec).some((s) => s.tag === 'image')).toBe(true);
  });
});
