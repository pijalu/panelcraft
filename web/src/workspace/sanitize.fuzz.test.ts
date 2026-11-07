// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// SVG export sanitizer fuzz + adversarial unit cases (M7-WP4, SPEC N6).
// Two layers are exercised:
//   1. the real pipeline: hostile labels → DOM (textContent/aria-label) →
//      XMLSerializer → sanitizeSvg — the serializer must render payloads
//      inert and the sanitizer must strip anything that still looks active;
//   2. raw-string adversarial inputs targeting the sanitizer's documented
//      threat classes (script/foreignObject elements, on* event attrs,
//      javascript: hrefs, srcdoc) — case variance, entity encoding, split
//      tags. Seeded PRNG keeps failures reproducible.
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from './io';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** mulberry32 — tiny seeded PRNG (reproducible fuzz runs). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PAYLOADS = [
  '<script>alert(1)</script>',
  '</text><script>alert(2)</script><text>',
  '<foreignObject><body><img src=x onerror=alert(3)></body></foreignObject>',
  '<img src=x onerror="alert(4)">',
  '"><svg onload=alert(5)>',
  "<a href='javascript:alert(6)'>click</a>",
  '<a href="jav&#x09;ascript:alert(7)">x</a>',
  '&lt;script&gt;alert(8)&lt;/script&gt;',
  '<ScRiPt>alert(9)</sCrIpT>',
  '<iframe srcdoc="<script>alert(10)</script>"></iframe>',
  '<script\n>alert(11)</script>',
  'xlink:href="javascript:alert(12)"',
  'onmouseover=alert(13) onfocus=alert(14)',
  '</title><script>alert(15)</script>',
  '&#60;script&#62;alert(16)&#60;/script&#62;',
];

/**
 * Structural audit — the fuzz oracle. Parse the sanitized output and walk
 * the element tree: no script/foreignObject/iframe elements, no on* event
 * attributes, no javascript: href/srcdoc anywhere. Escaped markup inside
 * text nodes is inert by construction (DOMParser gives it back as text),
 * so this never false-positives on hostile label TEXT.
 */
function auditProblems(svgText: string): string[] {
  const problems: string[] = [];
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() === 'parsererror' || root.tagName.toLowerCase() !== 'svg') {
    return ['output is not a well-formed svg document'];
  }
  const walk = (el: Element): void => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'foreignobject' || tag === 'iframe') {
      problems.push(`active element <${tag}>`);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith('on')) problems.push(`event attribute ${name}`);
      if ((name === 'href' || name.endsWith(':href') || name === 'srcdoc') && value.includes('javascript:')) {
        problems.push(`script URL in ${name}`);
      }
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return problems;
}

function assertClean(out: string, ctx: string): void {
  const problems = auditProblems(out);
  expect(problems, `${ctx}: ${problems.join('; ')}`).toEqual([]);
}

/** Real pipeline: hostile label through DOM serialization + sanitizer. */
function pipeline(labelText: string, labelAttr: string): string {
  const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'pc-obj');
  g.setAttribute('aria-label', labelAttr);
  const text = document.createElementNS(SVG_NS, 'text');
  text.textContent = labelText;
  g.appendChild(text);
  svg.appendChild(g);
  const serialized = new XMLSerializer().serializeToString(svg);
  return sanitizeSvg(serialized);
}

describe('sanitizeSvg — real pipeline fuzz (labels → DOM → serialize → sanitize)', () => {
  it('500 seeded hostile labels stay inert (text node + aria-label slots)', () => {
    const rand = prng(0xc0ffee);
    for (let i = 0; i < 500; i++) {
      const p1 = PAYLOADS[Math.floor(rand() * PAYLOADS.length)] ?? '';
      const p2 = PAYLOADS[Math.floor(rand() * PAYLOADS.length)] ?? '';
      const glued = `${i === 0 ? 'legit' : ''}${rand() < 0.5 ? p1 : p1.toLowerCase()} ${p2}`;
      const out = pipeline(glued, glued);
      // XMLSerializer escapes markup into text — sanitizer is layer two
      assertClean(out, `seed-case ${i} (text=${glued.slice(0, 40)})`);
      // legit neighbor text must survive (sanitizer is not over-destructive)
      if (glued.startsWith('legit')) expect(out).toContain('legit');
    }
  });

  it('benign labels pass through byte-identical semantics', () => {
    const out = pipeline('Checkout API', 'object Checkout API');
    expect(out).toContain('>Checkout API</text>');
    expect(out).toContain('aria-label="object Checkout API"');
  });
});

describe('sanitizeSvg — raw adversarial inputs (documented threat classes)', () => {
  const raw: string[] = [
    '<svg><script>alert(1)</script></svg>',
    '<svg><text>&lt;/text&gt;&lt;script&gt;x&lt;/script&gt;</text></svg>',
    '<svg><ScRiPt >alert(2)</ScRiPt></svg>',
    '<svg><script\n type="text/javascript">alert(3)</script></svg>',
    '<svg><foreignObject><body onload=alert(4)></body></foreignObject></svg>',
    '<svg><a href="javascript:alert(5)">x</a></svg>',
    "<svg><a href='JavaScript:alert(6)'>x</a></svg>",
    '<svg><a href = "javascript:alert(7)">x</a></svg>',
    '<svg><rect onload=alert(8)/></svg>',
    '<svg><rect ONERROR=alert(9)/></svg>',
    '<svg><iframe srcdoc="<script>alert(10)</script>"></iframe></svg>',
    '<svg><a xlink:href="javascript:alert(11)">x</a></svg>',
    '<svg><text>a</text><script/src=//evil/alert(12)></script></svg>',
  ];
  for (const input of raw) {
    it(`strips: ${input.slice(0, 48)}`, () => {
      const out = sanitizeSvg(input);
      assertClean(out, input);
    });
  }
});
