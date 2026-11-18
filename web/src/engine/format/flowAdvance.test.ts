// SPDX-License-Identifier: GPL-3.0-only
// Per-step advance trigger: the author chooses end-driven auto-advance or a
// click-driven beat that cycles until the presenter moves on.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';

const DOC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start"
  a -> b : "order" delay 1200 advance click
  conclusion "done"
}
`;

const stepOf = (text: string, index = 0): Record<string, unknown> => {
  const step = parsePDL(text).doc?.flows[0]?.steps[index];
  if (step === undefined) throw new Error('fixture has no step');
  return step as unknown as Record<string, unknown>;
};

describe('per-step advance trigger format', () => {
  it('parses both triggers and keeps the default absent', () => {
    expect(stepOf(DOC, 1)['advance']).toBe('click');
    const end = DOC.replace('advance click', 'advance end');
    expect(stepOf(end, 1)['advance']).toBe('end');
    const plain = DOC.replace(' advance click', '');
    expect(stepOf(plain, 1)['advance']).toBeUndefined();
  });

  it('prints an authored trigger after the delay and round-trips', () => {
    const doc = parsePDL(DOC).doc!;
    const printed = printDoc(doc);
    expect(printed).toContain('delay 1200 advance click');
    expect(printDoc(parsePDL(printed).doc!)).toBe(printed);
    const plain = printDoc(parsePDL(DOC.replace(' advance click', '')).doc!);
    expect(plain).not.toContain('advance');
  });

  it('rejects an unknown trigger with a diagnostic', () => {
    const result = parsePDL(DOC.replace('advance click', 'advance later'));
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
