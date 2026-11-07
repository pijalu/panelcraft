// SPDX-License-Identifier: GPL-3.0-only
// Corpus checker + generator (M1-WP8) — "parity job: TS IR vs Go IR
// byte-equal on every corpus file". Layout (D-M1-23): testdata/corpus/<case>/
// holds input.pcd | input.mmd | input.c4 plus, for parseable sources,
// canonical.pcd + canonical.ir.json (IR JSON incl. trailing newline) and
// diagnostics.json ({parse, validate} of the canonical form); converter
// inputs also record convert.diagnostics.json (TS-only — the Go parity job
// replays canonical.pcd, it has no converters).
//
// Normal runs verify the committed goldens against the TS engine;
// `npm run corpus:accept` (CORPUS_FIXTURE=1) regenerates them.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePDL } from './parser';
import { printDoc } from './printer';
import { fromMermaid } from './mermaid';
import { fromC4 } from './mermaidC4';
import { validateDoc } from '../model/validate';
import { serializeDoc } from '../model/serialize';

interface Diag {
  code: string;
  message: string;
  line: number;
  col: number;
  severity: string;
}

interface CaseDiags {
  parse: Diag[];
  validate: Diag[];
}

interface Derived {
  canonical: string | null;
  ir: string | null;
  diags: CaseDiags;
  convertDiags: Diag[] | null;
}

const ROOT = join('testdata', 'corpus');
const ACCEPT = process.env['CORPUS_FIXTURE'] === '1';
const EXTS = ['.pcd', '.mmd', '.c4'] as const;
type Ext = (typeof EXTS)[number];

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const inputPath = (dir: string): { ext: Ext; text: string } => {
  for (const ext of EXTS) {
    const p = join(ROOT, dir, `input${ext}`);
    if (existsSync(p)) return { ext, text: readFileSync(p, 'utf8') };
  }
  throw new Error(`${dir}: no input.pcd/.mmd/.c4`);
};

/** Run the TS engine over one corpus input; goldens derive from canonical.pcd. */
const derive = (ext: Ext, text: string): Derived => {
  if (ext === '.pcd') {
    const res = parsePDL(text);
    if (res.doc === null) {
      return { canonical: null, ir: null, diags: { parse: res.diagnostics, validate: [] }, convertDiags: null };
    }
    const canonical = printDoc(res.doc);
    const re = parsePDL(canonical);
    return {
      canonical,
      ir: `${serializeDoc(re.doc!)}\n`,
      diags: { parse: re.diagnostics, validate: validateDoc(re.doc!) },
      convertDiags: null,
    };
  }
  const conv = ext === '.mmd' ? fromMermaid(text) : fromC4(text);
  const canonical = printDoc(conv.doc);
  const re = parsePDL(canonical);
  return {
    canonical,
    ir: `${serializeDoc(re.doc!)}\n`,
    diags: { parse: re.diagnostics, validate: validateDoc(re.doc!) },
    convertDiags: conv.diagnostics,
  };
};

const json = (x: unknown): string => `${JSON.stringify(x, null, 2)}\n`;

/** Write or assert the goldens of one case. */
const checkCase = (dir: string): void => {
  const { ext, text } = inputPath(dir);
  const d = derive(ext, text);
  const base = join(ROOT, dir);
  const canonPath = join(base, 'canonical.pcd');
  const irPath = join(base, 'canonical.ir.json');
  const diagPath = join(base, 'diagnostics.json');
  const convPath = join(base, 'convert.diagnostics.json');
  if (ACCEPT) {
    if (d.canonical !== null) {
      writeFileSync(canonPath, d.canonical);
      writeFileSync(irPath, d.ir ?? '');
    }
    writeFileSync(diagPath, json(d.diags));
    if (d.convertDiags !== null) writeFileSync(convPath, json(d.convertDiags));
    return;
  }
  if (d.canonical === null) {
    expect(existsSync(canonPath), `${dir}: syntax abort must not ship goldens`).toBe(false);
  } else {
    expect(readFileSync(canonPath, 'utf8'), `${dir}: canonical.pcd drift`).toBe(d.canonical);
    expect(readFileSync(irPath, 'utf8'), `${dir}: canonical.ir.json drift`).toBe(d.ir);
  }
  expect(readFileSync(diagPath, 'utf8'), `${dir}: diagnostics.json drift`).toBe(json(d.diags));
  if (d.convertDiags === null) {
    expect(existsSync(convPath), `${dir}: stray convert.diagnostics.json`).toBe(false);
  } else {
    expect(readFileSync(convPath, 'utf8'), `${dir}: convert.diagnostics.json drift`).toBe(json(d.convertDiags));
  }
};

describe('corpus (M1-WP8)', () => {
  it('has ≥15 seeds incl. seeds + checkout + converter + error families', () => {
    expect(dirs.length).toBeGreaterThanOrEqual(15);
    for (const must of ['docs-overview', 'docs-modules', 'checkout', 'mm-shapes', 'c4-context', 'err-unclosed']) {
      expect(dirs, `missing corpus family ${must}`).toContain(must);
    }
  });

  it.each(dirs)('corpus/%s', (dir) => {
    checkCase(dir);
  });

  it('checkout seed carries the deliberate P101 (process mailx)', () => {
    const d = derive('.pcd', readFileSync(join(ROOT, 'checkout', 'input.pcd'), 'utf8'));
    expect(d.diags.parse).toEqual([]);
    expect(d.diags.validate.some((x) => x.code === 'P101' && x.message.includes('mailx'))).toBe(true);
  });
});
