// SPDX-License-Identifier: GPL-3.0-only
// F-18 per-step dwell: `delay <ms>` on a leaf step round-trips through the
// parser/printer/IR and the planner applies it to that step's beats only.

import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { buildPlan } from '../flows/plan';

const SRC =
  'pcd 1.0\n\nperson a "A"\nperson b "B"\n\na -> b as L\n\nflow "F" as f {\n  intro "start" delay 400\n  a -> b : "hi" as L delay 1200\n  process a "work" delay 250\n  info "note"\n}\n';

const docOf = (text: string) => {
  const { doc, diagnostics } = parsePDL(text);
  if (doc === null) throw new Error(`parse failed: ${JSON.stringify(diagnostics)}`);
  return doc;
};

describe('step delay (F-18)', () => {
  it('parses the delay of each leaf step', () => {
    const steps = docOf(SRC).flows[0]!.steps;
    expect(steps.map((s) => s.delayMs)).toEqual([400, 1200, 250, undefined]);
  });

  it('prints the delay only when present and round-trips byte-identically', () => {
    expect(printDoc(docOf(SRC))).toBe(SRC);
  });

  it('carries delayMs into the IR JSON', () => {
    const json = serializeDoc(docOf(SRC));
    expect(json).toContain('"delayMs": 400');
    expect(json).toContain('"delayMs": 1200');
  });

  it('rejects a negative delay', () => {
    const { doc, diagnostics } = parsePDL('pcd 1.0\nflow "F" {\n  intro "x" delay -5\n}\n');
    expect(doc).toBeNull();
    expect(diagnostics[0]?.message).toContain('delay must not be negative');
  });

  it('clearing the delay removes the attribute from the printed text', () => {
    const doc = docOf(SRC);
    const step = doc.flows[0]!.steps[0]! as { delayMs?: number };
    step.delayMs = undefined;
    expect(printDoc(doc)).toContain('intro "start"\n');
    expect(printDoc(doc)).not.toContain('delay 400');
  });

  it('applies the delay to that step’s beats only', () => {
    const doc = docOf(SRC);
    const plan = buildPlan({ doc, flow: doc.flows[0]!, delayMs: 900 });
    const delays = plan.beats.map((b) => b.delayMs);
    // the intro overrides the default; the msg/process override theirs; the
    // info without `delay` keeps the plan default (900)
    expect(delays).toEqual([400, 1200, 250, 900]);
  });
});
