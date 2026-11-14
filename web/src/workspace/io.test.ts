// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  targetPathForImport, importText, exportPcd, exportMmd, docToMermaid,
  sanitizeSvg, exportSvg, exportPng,
} from './io';
import { createFile, newRoot, readFile, writeFile } from './fs';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';

const PCD = `pcd 1.0
system api "API" {
}
system db "DB" {
}
api -> db : "reads"`;

const MERMAID = `flowchart TD
  api[API]
  db[(DB)]
  api -->|reads| db
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('import (FR-W3)', () => {
  it('maps import names to workspace paths (.pcd kept, mermaid→.pcd)', () => {
    expect(targetPathForImport('a.pcd')).toBe('a.pcd');
    expect(targetPathForImport('b.mmd')).toBe('b.pcd');
    expect(targetPathForImport('c.mermaid')).toBe('c.pcd');
    expect(targetPathForImport('notes.txt')).toBe('notes.pcd');
  });

  it('.pcd imports pass through (validated)', () => {
    const out = importText('a.pcd', PCD);
    expect(out.path).toBe('a.pcd');
    expect(out.content).toBe(PCD);
    expect(out.diagnostics).toEqual([]);
  });

  it('invalid .pcd throws', () => {
    expect(() => importText('bad.pcd', 'system')).toThrow(/invalid \.pcd/);
  });

  it('.mmd/.txt convert to canonical .pcd', () => {
    expect(importText('flow.mmd', MERMAID).path).toBe('flow.pcd');
    expect(importText('flow.mermaid', MERMAID).path).toBe('flow.pcd');
    const txt = importText('notes.txt', MERMAID);
    expect(txt.path).toBe('notes.pcd');
    const doc = parsePDL(txt.content).doc;
    expect(doc?.objects.map((o) => o.id)).toEqual(['api', 'db']);
    expect(doc?.links[0]?.from).toBe('api');
    expect(doc?.links[0]?.to).toBe('db');
  });

  it('mermaid diagnostics are surfaced (non-fatal codes)', () => {
    const out = importText('x.mmd', `${MERMAID}\n  api --> api\n`);
    expect(out.content.length).toBeGreaterThan(0);
  });

  it('unsupported extensions are rejected', () => {
    expect(() => importText('image.svg', '<svg/>')).toThrow(/unsupported import type/);
  });
});

describe('export .pcd (FR-W4)', () => {
  it('re-prints canonically (idempotent with printer)', () => {
    const root = newRoot();
    writeFile(root, 'a.pcd', PCD);
    const canonical = printDoc(parsePDL(PCD).doc!);
    expect(exportPcd(root, 'a.pcd')).toBe(canonical);
  });

  it('refuses to export unparseable content', () => {
    const root = newRoot();
    writeFile(root, 'broken.pcd', 'system');
    expect(() => exportPcd(root, 'broken.pcd')).toThrow(/cannot export invalid/);
  });
});

describe('export .mmd (FR-W4; §9 exporter, M4-WP5)', () => {
  it('emits flowchart with nodes, links, labels and type prefixes', () => {
    const root = newRoot();
    writeFile(root, 'a.pcd', PCD);
    const { text, dropped } = exportMmd(root, 'a.pcd');
    expect(text).toContain('flowchart TD');
    expect(text).toContain('api[API]');
    expect(text).toContain('api -->|reads| db');
    // systems export as rect (container-aliased) — declared, not silent
    expect(dropped).toEqual(['system vs container kind distinction (both export as rect)']);
  });

  it('groups become subgraphs, bidir links use <-->', () => {
    const doc = parsePDL(`pcd 1.0
group svc "Service" {
  contains api
}
system api "API" {
}
system db "DB" {
}
api <-> db : "sync"`).doc!;
    const { text } = docToMermaid(doc);
    expect(text).toContain('subgraph svc[Service]');
    expect(text).toContain('api[API]');
    expect(text).toContain('  end');
    expect(text).toContain('api <-->|sync| db');
  });

  it('tags → classDef + class; dropped features are declared', () => {
    const root = newRoot();
    writeFile(root, 'a.pcd', `pcd 1.0
system api "API" {
  tag critical
}
flow "T" as go {
  api -> db : "a"
}`);
    const { text, dropped } = exportMmd(root, 'a.pcd');
    expect(text).toContain('classDef critical fill:#ffeeaa,stroke:#333;');
    expect(text).toMatch(/class api critical;/);
    expect(dropped).toContain('flows');
  });

  it('exported mermaid re-imports to the same object/link graph', () => {
    const root = newRoot();
    writeFile(root, 'a.pcd', PCD);
    const { text } = exportMmd(root, 'a.pcd');
    const back = importText('a.mmd', text);
    const original = parsePDL(PCD).doc!;
    const round = parsePDL(back.content).doc!;
    expect(round.objects.map((o) => [o.id, o.name])).toEqual(original.objects.map((o) => [o.id, o.name]));
    expect(round.links.map((l) => [l.from, l.to])).toEqual(original.links.map((l) => [l.from, l.to]));
  });
});

describe('svg sanitize + export (FR-W4, N6)', () => {
  it('strips script/foreignObject and event attributes', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><p>x</p></foreignObject><rect onload="evil()" onclick="x()" width="10"/><a href="javascript:alert(2)"><text>l</text></a></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('foreignObject');
    expect(clean).not.toMatch(/onload|onclick/);
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('<rect');
  });

  it('exportSvg serializes a clean svg unchanged', () => {
    const doc = typeof document !== 'undefined';
    expect(doc).toBe(true); // jsdom present
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    svg.appendChild(rect);
    const out = exportSvg(svg as unknown as SVGSVGElement);
    expect(out).toContain('<svg');
    expect(out).toContain('<rect');
  });
});

describe('png export guard (FR-W4)', () => {
  it('throws a clean error without OffscreenCanvas (jsdom)', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    await expect(exportPng(svg)).rejects.toThrow(/OffscreenCanvas/);
  });

  it('rasterizes via OffscreenCanvas when the platform provides it', async () => {
    const calls: string[] = [];
    const fakeCtx = { drawImage: () => calls.push('draw') };
    class FakeCanvas {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        calls.push(`canvas ${w}x${h}`);
      }
      getContext() {
        return fakeCtx;
      }
      async convertToBlob(): Promise<Blob> {
        calls.push('toblob');
        return new Blob([new Uint8Array([137, 80])], { type: 'image/png' });
      }
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    Object.defineProperty(svg, 'width', { value: { baseVal: { value: 100 } } });
    Object.defineProperty(svg, 'height', { value: { baseVal: { value: 50 } } });
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    let rasterSource = '';
    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      rasterSource = await blob.text();
      return {};
    });
    const out = await exportPng(svg, 2);
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
    expect(calls).toContain('canvas 200x100');
    expect(calls).toContain('draw');
    expect(calls).toContain('toblob');
    expect(rasterSource).toContain('width="100" height="50"');
    expect(out.blob.type).toBe('image/png');
  });
});

describe('io helpers', () => {
  it('exposes the supported extension sets', async () => {
    const { PCARD_IMPORT_EXTS, EXPORT_EXTS } = await import('./io');
    expect(PCARD_IMPORT_EXTS).toEqual(['.pcd', '.mmd', '.mermaid', '.txt']);
    expect(EXPORT_EXTS).toEqual(['.pcd', '.mmd', '.svg', '.png']);
  });

  it('readFile still drives round-trips through the workspace (integration)', () => {
    const root = newRoot();
    createFile(root, 'd/a.pcd', PCD);
    expect(readFile(root, 'd/a.pcd')).toBe(PCD);
    expect(() => exportPcd(root, 'missing.pcd')).toThrow();
  });
});
