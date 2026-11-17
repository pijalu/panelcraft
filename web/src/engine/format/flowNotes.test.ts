// SPDX-License-Identifier: GPL-3.0-only
// Flow notes are source text in the IR: one atomic multiline block or the legacy
// one-line description, plus the persisted presentation flag. These tests pin
// the grammar, canonical print, IR JSON and diagnostics before the implementation.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import type { Doc } from '../model/types';

const HEAD = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab
`;

function doc(src: string): Doc {
  const res = parsePDL(src);
  expect(res.diagnostics).toEqual([]);
  expect(res.doc).not.toBeNull();
  return res.doc!;
}

function canonical(src: string): string {
  const once = printDoc(doc(src));
  expect(printDoc(doc(once))).toBe(once);
  return once;
}

describe('flow notes format', () => {
  it('parses, prints and serializes an atomic multiline description', () => {
    const src = `${HEAD}flow "Checkout" as checkout {
  description {
    text "# Order"
    text ""
    text "**Pay** now"
    text "- card"
  }
  presentation
  intro "Start"
}
`;
    const d = doc(src);
    expect(d.flows[0]!.description).toBeUndefined();
    expect(d.flows[0]!.descriptionLines).toEqual(['# Order', '', '**Pay** now', '- card']);
    expect(d.flows[0]!.presentation).toBe(true);
    const once = canonical(src);
    expect(once).toContain('  description {\n    text "# Order"\n    text ""\n    text "**Pay** now"\n    text "- card"\n  }\n');
    expect(once).toContain('  presentation\n');
    expect(serializeDoc(d)).toContain('"descriptionLines": [\n        "# Order",\n        "",\n        "**Pay** now",\n        "- card"\n      ],\n      "presentation": true');
  });

  it('keeps the legacy one-line form unchanged and defaults the flag to absent', () => {
    const src = `${HEAD}flow "Legacy" as legacy {
  description "One line of prose"
  intro "Start"
}
`;
    const d = doc(src);
    expect(d.flows[0]!.description).toBe('One line of prose');
    expect(d.flows[0]!.descriptionLines).toBeUndefined();
    expect(d.flows[0]!.presentation).toBeUndefined();
    expect(canonical(src)).toContain('  description "One line of prose"\n');
    expect(canonical(src)).not.toContain('presentation');
    expect(serializeDoc(d)).not.toContain('descriptionLines');
  });

  it('parses the flag and block in any source order and prints them canonically', () => {
    const src = `${HEAD}flow "F" as f {
  presentation
  description {
    text "one"
  }
  intro "Start"
}
`;
    const once = canonical(src);
    expect(once.indexOf('  description {')).toBeLessThan(once.indexOf('  presentation\n'));
    expect(once.indexOf('  presentation\n')).toBeLessThan(once.indexOf('  intro'));
  });

  it('rejects an empty block, unknown lines, duplicate and mixed description forms', () => {
    const empty = parsePDL(`${HEAD}flow "F" {\n  description {\n  }\n  intro "Start"\n}\n`);
    expect(empty.diagnostics[0]).toMatchObject({ code: 'E119' });
    expect(empty.doc).toBeNull();

    const unknown = parsePDL(`${HEAD}flow "F" {\n  description {\n    image "x"\n  }\n}\n`);
    expect(unknown.diagnostics[0]).toMatchObject({ code: 'E100' });

    const duplicate = parsePDL(`${HEAD}flow "F" {\n  description "one"\n  description "two"\n}\n`);
    expect(duplicate.diagnostics[0]).toMatchObject({ code: 'E110' });

    const mixed = parsePDL(`${HEAD}flow "F" {\n  description "one"\n  description {\n    text "two"\n  }\n}\n`);
    expect(mixed.diagnostics[0]).toMatchObject({ code: 'E110' });

    const flag = parsePDL(`${HEAD}flow "F" {\n  presentation\n  presentation\n}\n`);
    expect(flag.diagnostics[0]).toMatchObject({ code: 'E110' });
  });

  it('does not treat a step presentation block as the flow flag', () => {
    const src = `${HEAD}flow "F" as f {
  intro "Start" presentation {
    description "step prose"
  }
}
`;
    const d = doc(src);
    expect(d.flows[0]!.presentation).toBeUndefined();
    expect(d.flows[0]!.description).toBeUndefined();
    expect(d.flows[0]!.steps[0]!.description).toBe('step prose');
  });

  it('preserves blank lines and escapes in each source line', () => {
    const src = `${HEAD}flow "F" as f {
  description {
    text "# H"
    text ""
    text "[link](https://example.test) and \\"quoted\\""
  }
}
`;
    const d = doc(src);
    expect(d.flows[0]!.descriptionLines).toEqual(['# H', '', '[link](https://example.test) and "quoted"']);
    expect(canonical(src)).toContain('text "[link](https://example.test) and \\"quoted\\""');
  });
});
