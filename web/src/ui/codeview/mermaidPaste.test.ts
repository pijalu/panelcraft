// SPDX-License-Identifier: GPL-3.0-only
// Mermaid paste conversion tests (M4-WP6/D-M4-4): detection + conversion for
// flowchart and C4 sources, and the null contract for non-mermaid text.
import { describe, expect, it } from 'vitest';
import { mermaidToPdl } from './mermaidPaste';
import { parsePDL } from '../../engine/format/parser';

describe('mermaidToPdl', () => {
  it('converts a flowchart to canonical PDL that parses', () => {
    const src = 'flowchart TD\n  a[A] --> b(B)';
    const pdl = mermaidToPdl(src);
    expect(pdl).not.toBeNull();
    expect(pdl).toMatch(/^pcd 1\.0/);
    expect(parsePDL(pdl!).doc).not.toBeNull();
    expect(pdl).toContain('"A"');
  });

  it('converts a C4 diagram (C4Context header)', () => {
    const src = 'C4Context\n  System(api, "API", "svc")\n  Rel(u, api, "uses")';
    const pdl = mermaidToPdl(src);
    expect(pdl).not.toBeNull();
    expect(parsePDL(pdl!).doc).not.toBeNull();
  });

  it('detects mermaid after leading whitespace', () => {
    expect(mermaidToPdl('\n\nflowchart LR\n  a[A] --> b(B)')).not.toBeNull();
  });

  it('returns null for PDL and arbitrary text', () => {
    expect(mermaidToPdl('pcd 1.0\n\nsystem a "A" {\n}\n')).toBeNull();
    expect(mermaidToPdl('')).toBeNull();
    expect(mermaidToPdl('hello world')).toBeNull();
    // "graph" only counts as a header word, not mid-line
    expect(mermaidToPdl('see the graph below')).toBeNull();
  });

  it('is idempotent on already-converted output (no paste loop)', () => {
    const once = mermaidToPdl('flowchart TD\n  a[A] --> b(B)');
    expect(mermaidToPdl(once!)).toBeNull();
  });
});
