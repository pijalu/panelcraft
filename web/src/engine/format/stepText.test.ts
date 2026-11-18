// SPDX-License-Identifier: GPL-3.0-only
// Step prose owns its own Markdown source. A PDL quoted string escapes only `\`
// and `"`, so it cannot carry a line break; the block form (one `text` line per
// authored line) is the single way to write multiline step text. These tests pin
// the grammar, the canonical print, the IR payload and the diagnostics.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import type { Doc, Flow } from '../model/types';

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

function flow(src: string): Flow {
  return doc(src).flows[0]!;
}

function canonical(src: string): string {
  const once = printDoc(doc(src));
  // print ∘ parse ∘ print is stable: the block form is the canonical shape for
  // any prose that carries a newline.
  expect(printDoc(doc(once))).toBe(once);
  return once;
}

describe('multiline step text block', () => {
  it('reads one authored line per text line into the step text', () => {
    const f = flow(`${HEAD}flow "F" as f {
  intro {
    text "# Start"
    text ""
    text "Press **here**"
  }
  a -> b : "order"
  conclusion {
    text "Done"
  }
}
`);
    expect(f.steps[0]).toMatchObject({ type: 'intro', text: '# Start\n\nPress **here**' });
    expect(f.steps[2]).toMatchObject({ type: 'conclusion', text: 'Done' });
  });

  it('prints a block only when the text holds more than one line', () => {
    const single = canonical(`${HEAD}flow "F" as f {
  info "one line"
}
`);
    expect(single).toContain('  info "one line"');
    const multi = canonical(`${HEAD}flow "F" as f {
  info {
    text "line one"
    text "line two"
  }
}
`);
    expect(multi).toContain('  info {\n    text "line one"\n    text "line two"\n  }');
  });

  it('keeps blank lines and escaped quotes exactly as authored', () => {
    const f = flow(`${HEAD}flow "F" as f {
  intro {
    text "say \\"hi\\""
    text ""
    text "end"
  }
}
`);
    expect(f.steps[0]).toMatchObject({ text: 'say "hi"\n\nend' });
    expect(canonical(`${HEAD}flow "F" as f {
  intro {
    text "say \\"hi\\""
    text ""
    text "end"
  }
}
`)).toContain('    text "say \\"hi\\""\n    text ""');
  });

  it('carries a process note and a per-step delay on the block', () => {
    const f = flow(`${HEAD}flow "F" as f {
  process b {
    text "- step one"
    text "- step two"
  } delay 900
}
`);
    expect(f.steps[0]).toMatchObject({ type: 'process', target: 'b', text: '- step one\n- step two', delayMs: 900 });
    expect(canonical(`${HEAD}flow "F" as f {
  process b {
    text "- step one"
    text "- step two"
  } delay 900
}
`)).toContain('  } delay 900');
  });

  it('rejects an empty block and points at it', () => {
    const res = parsePDL(`${HEAD}flow "F" as f {
  intro {
  }
}
`);
    expect(res.doc).toBeNull();
    expect(res.diagnostics.map((d) => d.code)).toContain('E120');
  });

  it('rejects an unknown line inside the block', () => {
    const res = parsePDL(`${HEAD}flow "F" as f {
  intro {
    prose "nope"
  }
}
`);
    expect(res.doc).toBeNull();
    expect(res.diagnostics[0]?.message).toContain('unknown text block line');
  });
});

describe('multiline step description', () => {
  it('reads a description block inside the presentation block', () => {
    const f = flow(`${HEAD}flow "F" as f {
  a -> b : "order" presentation {
    description {
      text "First line"
      text ""
      text "Second **line**"
    }
  }
}
`);
    expect(f.steps[0]).toMatchObject({ description: 'First line\n\nSecond **line**' });
  });

  it('prints the description block and keeps camera metadata after it', () => {
    const printed = canonical(`${HEAD}flow "F" as f {
  a -> b : "order" presentation {
    description {
      text "one"
      text "two"
    }
    camera hold
  }
}
`);
    expect(printed).toContain('    description {\n      text "one"\n      text "two"\n    }\n    camera hold');
  });

  it('keeps a one-line description in the compact form', () => {
    expect(canonical(`${HEAD}flow "F" as f {
  a -> b : "order" presentation {
    description "just one line"
  }
}
`)).toContain('    description "just one line"');
  });
});
