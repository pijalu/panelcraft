// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Icon ingest (IR v9, §3.1): what the editor accepts when a user imports or
// pastes an icon. The sanitizer reconstructs the payload from an allowlist, so
// these tests care about both halves — hostile input is stripped to something
// inert, and input that cannot be made safe is refused rather than stored.
import { describe, expect, it } from 'vitest';
import { ingestIconInput, ingestSvgText } from './iconIngest';
import { decodeIconSvg, encodeIconSvg, svgIssues } from '../engine/format/iconSvg';

const safe = (svg: string): string => {
  const text = decodeIconSvg(encodeIconSvg(svg));
  expect(text).not.toBeNull();
  return text as string;
};

describe('icon ingest sanitizer', () => {
  it('keeps static drawing and gives the payload a viewBox', () => {
    const res = ingestSvgText('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h4v4z"/></svg>');
    expect(res.error).toBeNull();
    expect(res.svg).toContain('viewBox="0 0 24 24"');
    expect(svgIssues(safe(res.svg as string))).toEqual([]);
  });

  it('normalises a pixel size into a viewBox instead of keeping width/height', () => {
    const res = ingestSvgText('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48"/></svg>');
    expect(res.svg).toContain('viewBox="0 0 48 48"');
    // the root's pixel size is dropped (the canvas owns the size); the shape keeps its own
    expect(res.svg).toMatch(/^<svg[^>]*>/);
    expect(res.svg?.slice(0, res.svg.indexOf('>'))).not.toContain('width=');
  });

  it('removes scripts, event handlers, external refs and foreign content', () => {
    const hostile = [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">',
      '<script>alert(1)</script>',
      '<foreignObject><b>x</b></foreignObject>',
      '<style>rect{fill:red}</style>',
      '<image href="https://evil.example/x.png"/>',
      '<a href="javascript:alert(1)"><rect width="4" height="4"/></a>',
      '<path d="M0 0h4v4z" xlink:href="http://evil.example/"/>',
      '<rect width="4" height="4" style="fill:url(http://evil.example)"/>',
      '</svg>',
    ].join('');
    const res = ingestSvgText(hostile);
    expect(res.error).toBeNull();
    const out = res.svg as string;
    for (const bad of ['<script', 'onload', 'javascript:', 'http://evil', 'foreignObject', '<style', 'url(']) {
      expect(out).not.toContain(bad);
    }
    // the inert geometry survives, so the icon is not just dropped wholesale
    expect(out).toContain('<rect');
    expect(svgIssues(safe(out))).toEqual([]);
  });

  it('keeps fragment-only links and gradient defs', () => {
    const res = ingestSvgText(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#0af"/></linearGradient></defs>' +
      '<use href="#g"/><circle cx="12" cy="12" r="6" fill="url(#g)"/></svg>',
    );
    expect(res.error).toBeNull();
    expect(res.svg).toContain('linearGradient');
  });

  it('refuses markup that is not SVG, is empty, or is not well formed', () => {
    expect(ingestSvgText('').error).toContain('empty');
    expect(ingestSvgText('<div>hi</div>').error).toContain('SVG');
    expect(ingestSvgText('<svg><path d="M0 0h1v1z"').error).toContain('well-formed');
  });

  it('accepts SVG markup, a data: URI and bare Base64, and refuses junk', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>';
    const fromMarkup = ingestIconInput(svg);
    const fromData = ingestIconInput(`data:image/svg+xml;base64,${encodeIconSvg(svg)}`);
    const fromBase64 = ingestIconInput(encodeIconSvg(svg));
    expect(fromMarkup.error).toBeNull();
    expect(fromBase64.data).toBe(fromMarkup.data);
    expect(fromData.data).toBe(fromMarkup.data);
    expect(ingestIconInput('hello').error).toContain('neither SVG markup nor canonical Base64');
    expect(ingestIconInput('').error).toContain('paste SVG markup');
  });

  it('is idempotent: re-ingesting a stored payload changes nothing', () => {
    const once = ingestSvgText('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4"/></svg>');
    const twice = ingestIconInput(once.data as string);
    expect(twice.data).toBe(once.data);
  });
});
