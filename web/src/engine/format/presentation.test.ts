// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP11 (IR v8): flow/step descriptions and the optional per-step camera
// contract. The canonical PDL must be the single source of truth — no camera or
// description state may exist only in the UI — so these tests pin the surface
// syntax, the canonical printing, the IR JSON and the diagnostics.
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { serializeDoc } from '../model/serialize';
import { IR_VERSION, type Doc, type FlowStep } from '../model/types';

/** Parse, assert success and return the doc. */
function doc(src: string): Doc {
  const res = parsePDL(src);
  expect(res.diagnostics).toEqual([]);
  expect(res.doc).not.toBeNull();
  return res.doc!;
}

/** Canonical print → re-parse → print (idempotence in one step). */
function canonical(src: string): string {
  const once = printDoc(doc(src));
  expect(printDoc(doc(once))).toBe(once);
  return once;
}

const stepOf = (d: Doc, index = 0): FlowStep => d.flows[0]!.steps[index]!;

const HEAD = `pcd 1.0
person a "A"
person b "B"
a -> b as L
`;

describe('IR v8 contract', () => {
  it('bumps the schema version', () => {
    expect(IR_VERSION).toBeGreaterThanOrEqual(9);
  });

  it('keeps camera and description out of view lines', () => {
    const src = `pcd 1.0\nview "V" {\n  layout auto LR\n  hide a\n}\n`;
    const json = serializeDoc(doc(src));
    expect(json).not.toContain('camera');
    expect(json).not.toContain('description');
  });
});

describe('flow description', () => {
  it('parses, prints and serializes a flow description', () => {
    const src = `${HEAD}flow "Checkout" as checkout {\n  description "A customer submits an order."\n  intro "Start"\n}\n`;
    const d = doc(src);
    expect(d.flows[0]!.description).toBe('A customer submits an order.');
    expect(canonical(src)).toContain('  description "A customer submits an order."');
    expect(serializeDoc(d)).toContain('"description": "A customer submits an order."');
  });

  it('omits the description line when the document has none', () => {
    const src = `${HEAD}flow "Checkout" {\n  intro "Start"\n}\n`;
    expect(canonical(src)).not.toContain('description');
  });
});

describe('step presentation metadata', () => {
  it('round-trips a description on every step kind', () => {
    const src = `${HEAD}flow "F" as f {
  intro "Welcome" presentation {
    description "Intro text"
  }
  info "Note" presentation {
    description "Info text"
  }
  conclusion "Done" presentation {
    description "Conclusion text"
  }
  process a "work" presentation {
    description "Process text"
  }
  a -> b : "call" presentation {
    description "Message text"
  }
  goto f return here presentation {
    description "Goto text"
  }
  alt "path?" {
    "yes" {
      info "y"
    }
  } presentation {
    description "Alt text"
  }
  par {
    { info "lane" }
  } presentation {
    description "Par text"
  }
}
`;
    const d = doc(src);
    expect(d.flows[0]!.steps.map((s) => s.description)).toEqual([
      'Intro text', 'Info text', 'Conclusion text', 'Process text',
      'Message text', 'Goto text', 'Alt text', 'Par text',
    ]);
    const once = canonical(src);
    // Every step carries its own block, and nothing else changed.
    expect(once.match(/presentation \{/g)).toHaveLength(8);
    expect(once).toContain('} presentation {');
  });

  it('keeps the step line itself unchanged when metadata is added', () => {
    const src = `${HEAD}flow "F" {
  a -> b : "call" as L delay 1200 presentation {
    description "Message text"
  }
}
`;
    expect(canonical(src)).toContain('  a -> b : "call" as L delay 1200 presentation {\n');
  });
});

describe('step camera', () => {
  it('round-trips every camera mode with bounds-safe values', () => {
    const src = `${HEAD}flow "F" {
  intro "A" presentation {
    camera auto
    duration 300
  }
  process a presentation {
    camera hold
  }
  intro "B" presentation {
    camera focus (420, 180) zoom 1.25
  }
  intro "C" presentation {
    camera focus (10.5, 20.25) zoom 0.1 duration 0
  }
}
`;
    const d = doc(src);
    expect(d.flows[0]!.steps.map((s) => s.camera)).toEqual([
      { mode: 'auto', durationMs: 300 },
      { mode: 'hold' },
      { mode: 'focus', x: 420, y: 180, zoom: 1.25 },
      { mode: 'focus', x: 10.5, y: 20.25, zoom: 0.1, durationMs: 0 },
    ]);
    const once = canonical(src);
    expect(once).toContain('    camera focus (420, 180) zoom 1.25');
    expect(once).toContain('    duration 300');
    expect(serializeDoc(d)).toContain('"camera": {');
  });

  it('prints metadata in a stable order regardless of source order', () => {
    const src = `${HEAD}flow "F" {
  intro "A" presentation {
    duration 200
    camera auto
    description "D"
  }
}
`;
    const once = canonical(src);
    const lines = once.split('\n');
    const d = lines.findIndex((l) => l.includes('description "D"'));
    const c = lines.findIndex((l) => l.includes('camera auto'));
    const u = lines.findIndex((l) => l.includes('duration 200'));
    expect(d).toBeLessThan(c);
    expect(c).toBeLessThan(u);
  });

  it('rejects out-of-range zoom, duration and dangling duration', () => {
    const zoom = parsePDL(`${HEAD}flow "F" {\n  intro "A" presentation {\n    camera focus (1, 2) zoom 9\n  }\n}\n`);
    expect(zoom.diagnostics[0]).toMatchObject({ code: 'E100' });
    expect(zoom.diagnostics[0]!.message).toContain('zoom');

    const duration = parsePDL(`${HEAD}flow "F" {\n  intro "A" presentation {\n    camera auto\n    duration 900\n  }\n}\n`);
    expect(duration.diagnostics[0]).toMatchObject({ code: 'E100' });
    expect(duration.diagnostics[0]!.message).toContain('duration');

    const dangling = parsePDL(`${HEAD}flow "F" {\n  intro "A" presentation {\n    duration 200\n  }\n}\n`);
    expect(dangling.diagnostics[0]).toMatchObject({ code: 'E100' });
    expect(dangling.diagnostics[0]!.message).toContain('camera');
  });

  it('rejects unknown and duplicated presentation keys', () => {
    const unknown = parsePDL(`${HEAD}flow "F" {\n  intro "A" presentation {\n    sparkle yes\n  }\n}\n`);
    expect(unknown.diagnostics[0]).toMatchObject({ code: 'E100' });

    const duplicate = parsePDL(
      `${HEAD}flow "F" {\n  intro "A" presentation {\n    camera auto\n    camera hold\n  }\n}\n`,
    );
    expect(duplicate.diagnostics[0]).toMatchObject({ code: 'E110' });
  });

  it('does not let presentation leak into a non-focus camera', () => {
    const res = parsePDL(`${HEAD}flow "F" {\n  intro "A" presentation {\n    camera focus 420 180\n  }\n}\n`);
    expect(res.diagnostics[0]).toMatchObject({ code: 'E100' });
  });
});

describe('backward compatibility', () => {
  it('parses a pre-v8 flow without any presentation metadata', () => {
    const src = `${HEAD}flow "Legacy" as legacy {\n  intro "Start"\n  a -> b delay 100\n  conclusion "End"\n}\n`;
    const d = doc(src);
    expect(d.flows[0]!.description).toBeUndefined();
    expect(d.flows[0]!.steps.every((s) => s.camera === undefined && s.description === undefined)).toBe(true);
    // No metadata means no block in the canonical form (no unrelated diff).
    expect(printDoc(d)).not.toContain('presentation');
  });

  it('treats an empty presentation block as no metadata', () => {
    const src = `${HEAD}flow "F" {\n  intro "A" presentation {\n  }\n}\n`;
    const d = doc(src);
    expect(stepOf(d).camera).toBeUndefined();
    const printed = printDoc(d);
    expect(printed).not.toContain('presentation');
    expect(printed).toContain('  intro "A"\n');
  });
});
