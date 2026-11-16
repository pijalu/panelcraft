// SPDX-License-Identifier: GPL-3.0-only
// Shared TS⇄Go parity fixture for project-icon payload rules (IR v9, §3.1).
// `CORPUS_FIXTURE=1 npx vitest run web/src/engine/format/iconParity.test.ts`
// regenerates testdata/icon-cases.json from the TS engine (the reference);
// plain runs assert the committed fixture still matches TS, and the Go port
// (internal/ir/svg.go via internal/ir/icon_test.go) replays it — that replay is
// what proves the browser and the CLI refuse the same payloads.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { svgIssues, isCanonicalBase64, decodeIconSvg } from './iconSvg';
import { BUILTIN_ICONS } from '../model/icons';

const FIXTURE_PATH = join('testdata', 'icon-cases.json');

/** One classifier case: payload text in, issue kinds out. */
interface IconCase {
  name: string;
  svg: string;
  issues: string[];
}

interface IconFixture {
  version: number;
  builtinIcons: string[];
  base64: { value: string; canonical: boolean }[];
  cases: IconCase[];
}

const SVG_CASES: { name: string; svg: string }[] = [
  { name: 'plain-path', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>' },
  {
    name: 'groups-and-gradients',
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">' +
      '<stop offset="0" stop-color="#0af" stop-opacity="1"/></linearGradient></defs>' +
      '<g transform="translate(1 1)" fill="url(#g)"><rect x="0" y="0" width="10" height="10" rx="2"/></g></svg>',
  },
  {
    name: 'text-and-title',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>API</title><text x="2" y="18" font-size="12" text-anchor="start">A</text></svg>',
  },
  { name: 'script-element', svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' },
  { name: 'event-handler', svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0h1v1z"/></svg>' },
  {
    name: 'external-href',
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z" xlink:href="https://example.com/x.svg"/></svg>',
  },
  {
    name: 'fragment-href-ok',
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="p" d="M0 0h1v1z"/></defs><use href="#p"/></svg>',
  },
  { name: 'foreign-object', svg: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><b>x</b></foreignObject></svg>' },
  { name: 'css-url', svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(http://x/y)" width="1" height="1"/></svg>' },
  { name: 'javascript-url', svg: '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>' },
  { name: 'style-element', svg: '<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:red}</style><rect width="1" height="1"/></svg>' },
  { name: 'animate', svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"><animate attributeName="x" to="5"/></rect></svg>' },
  { name: 'image-embed', svg: '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>' },
  { name: 'doctype', svg: '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>' },
  { name: 'entity-trick', svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>&#106;avascript:</text></svg>' },
  { name: 'unknown-attribute', svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" onclick="x()"/></svg>' },
  { name: 'bare-markup', svg: '<div>not an icon</div>' },
  { name: 'empty', svg: '' },
  {
    name: 'data-attrs-and-aria-ok',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Logo" data-name="x" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>',
  },
  {
    name: 'comment-inside-ok',
    svg: '<svg xmlns="http://www.w3.org/2000/svg"><!-- drawn in repo --><path d="M0 0h2v2z"/></svg>',
  },
];

const BASE64_CASES = [
  '',
  'AAAA',
  'AAA',
  'not base64!',
  'AAA=',
  'AA==',
  'AB==',
  'PGEvPg==',
  'PGEvPg',
  'PGEv Pg==',
  '####',
];

const build = (): IconFixture => ({
  version: 1,
  builtinIcons: BUILTIN_ICONS.map((i) => i.name).sort(),
  base64: BASE64_CASES.map((value) => ({ value, canonical: isCanonicalBase64(value) })),
  cases: SVG_CASES.map((c) => ({ name: c.name, svg: c.svg, issues: svgIssues(c.svg) })),
});

describe('icon payload fixture (TS⇄Go parity)', () => {
  if (process.env['CORPUS_FIXTURE'] === '1') {
    it('regenerates testdata/icon-cases.json from the TS engine', () => {
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(build(), null, 2)}\n`);
    });
    return;
  }
  it('committed fixture matches the current TS engine', () => {
    const fx = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as IconFixture;
    expect(fx).toEqual(build());
  });
});

describe('icon payload classifier', () => {
  it('accepts a static payload and refuses active content', () => {
    expect(svgIssues('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>')).toEqual([]);
    expect(svgIssues('<svg><script>x</script></svg>')).toContain('script');
    expect(svgIssues('<svg onload="x()"></svg>')).toContain('event-handler');
    expect(svgIssues('<svg><foreignObject/></svg>')).toContain('foreign-content');
  });

  it('reports issues in a stable order and never throws on hostile input', () => {
    const evil = '<svg onload="x()" href="http://e/x"><script>s</script><image href="http://e"/></svg>';
    expect(svgIssues(evil)).toEqual(['script', 'event-handler', 'external-ref', 'unknown-element']);
    for (const svg of SVG_CASES.map((c) => c.svg)) expect(() => svgIssues(svg)).not.toThrow();
  });

  it('rejects non-canonical Base64 and decodes canonical payloads as UTF-8', () => {
    expect(isCanonicalBase64('AAA')).toBe(false);
    expect(isCanonicalBase64('PGEvPg==')).toBe(true);
    expect(decodeIconSvg('PGEvPg==')).toBe('<a/>');
    expect(decodeIconSvg('####')).toBeNull();
    // 0xff is not valid UTF-8: a payload of raw bytes is refused, not rendered.
    expect(decodeIconSvg('/w==')).toBeNull();
  });

  it('reserves every built-in handle', () => {
    expect(BUILTIN_ICONS.length).toBeGreaterThan(20);
    expect(new Set(BUILTIN_ICONS.map((i) => i.name)).size).toBe(BUILTIN_ICONS.length);
  });
});
