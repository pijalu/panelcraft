// SPDX-License-Identifier: GPL-3.0-only

// Spec/doc parity gate (M1-WP10): the §14 code block in docs/FILE-FORMAT.md is
// the normative sample and must stay byte-identical to the corpus seed it
// spawned (testdata/corpus/checkout/input.pcd). If this test fails, either the
// doc was edited without `npm run corpus:accept`, or the corpus golden was
// hand-edited (forbidden — D-M1-23).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DOC = 'docs/FILE-FORMAT.md';
const SEED = 'testdata/corpus/checkout/input.pcd';

const section14 = (doc: string): string => {
  const marker = '## 14. Full example';
  const start = doc.indexOf(marker);
  expect(start, `${DOC} must contain ${marker}`).toBeGreaterThan(-1);
  const fence = doc.indexOf('```', start);
  const open = doc.indexOf('\n', fence) + 1;
  const close = doc.indexOf('\n```', open);
  expect(close, '§14 code fence must close').toBeGreaterThan(open);
  return doc.slice(open, close + 1);
};

describe('FILE-FORMAT §14 ⇄ corpus/checkout parity', () => {
  it('the normative sample is byte-identical to the checkout corpus seed', () => {
    const doc = readFileSync(DOC, 'utf8');
    const seed = readFileSync(SEED, 'utf8');
    expect(section14(doc)).toBe(seed);
  });

  it('the errata section exists (grammar frozen at pcd/1)', () => {
    const doc = readFileSync(DOC, 'utf8');
    expect(doc).toContain('## 15. Errata and frozen-grammar rulings');
  });
});
