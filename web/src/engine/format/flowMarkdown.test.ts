// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Doc } from '../model/types';
import { flowMarkdown, flowsMarkdown, markdownFileName } from './flowMarkdown';
import { parsePDL } from './parser';

const SOURCE = 'testdata/markdown/all-steps.pcd';

function golden(path: string, actual: string): void {
  if (process.env['EXPORT_FIXTURE'] === '1') writeFileSync(path, actual);
  expect(existsSync(path), `run EXPORT_FIXTURE=1 to write ${path}`).toBe(true);
  expect(actual).toBe(readFileSync(path, 'utf8'));
}

function docFor(): Doc {
  const doc = parsePDL(readFileSync(SOURCE, 'utf8')).doc;
  expect(doc).not.toBeNull();
  return doc!;
}

describe('flowMarkdown', () => {
  it('renders every step kind and all presentation metadata', () => {
    const doc = docFor();
    golden('testdata/markdown/all-steps.md', flowMarkdown(doc, doc.flows[0]!));
  });

  it('renders all flows as one outline', () => {
    golden('testdata/markdown/all-flows.md', flowsMarkdown(docFor()));
  });

  it('is deterministic across repeated runs', () => {
    const doc = docFor();
    expect(flowMarkdown(doc, doc.flows[0]!)).toBe(flowMarkdown(doc, doc.flows[0]!));
  });

  it('names the flow by title, then id, then a placeholder', () => {
    const doc = parsePDL('pcd 1.0\nflow "Titled" as t {\n  info "one"\n}\nflow {\n  info "two"\n}').doc!;
    expect(flowMarkdown(doc, doc.flows[0]!)).toContain('# Titled\n');
    expect(flowMarkdown(doc, doc.flows[1]!)).toContain('# Flow 2\n');
  });

  it('escapes markdown control characters in prose and labels', () => {
    const doc = parsePDL(`pcd 1.0
system a "A_system"
system b "B *system*"
flow "Under_score [draft]" as f {
  info "uses *stars* and _dots_"
  a -> b : "see <x> | ~y~"
}`).doc!;
    const out = flowMarkdown(doc, doc.flows[0]!);
    expect(out).toContain('# Under\\_score \\[draft\\]');
    expect(out).toContain('A\\_system `a` → B \\*system\\* `b`: see \\<x\\> \\| \\~y\\~');
    expect(out).toContain('**Info** — uses \\*stars\\* and \\_dots\\_');
  });

  it('keeps unresolved references visible instead of dropping the step', () => {
    const doc = parsePDL('pcd 1.0\nflow "Gaps" as g {\n  ghost -> a : "nowhere"\n}').doc!;
    const out = flowMarkdown(doc, doc.flows[0]!);
    expect(out).toContain('ghost `ghost` (not in this diagram) → a `a` (not in this diagram): nowhere');
    expect(out).toMatch(/^1\. \*\*Message\*\*/m);
  });

  it('carries flow and step descriptions, dwell, camera and transition', () => {
    const doc = parsePDL(`pcd 1.0
flow "Meta" as m {
  description "why it exists"
  process a "work" delay 250 presentation {
    description "step prose"
    camera focus (10, 20) zoom 2
    duration 90
  }
  process b "run" presentation { camera hold }
}`).doc!;
    const out = flowMarkdown(doc, doc.flows[0]!);
    expect(out).toContain('_why it exists_');
    expect(out).toContain('   _step prose_');
    expect(out).toContain('   (dwell 250 ms; camera focus (10, 20) zoom 2; transition 90 ms)');
    expect(out).toContain('   (camera hold)');
  });

  it('renumbers each nested branch and lane from one', () => {
    const doc = parsePDL(`pcd 1.0
flow "Nest" as n {
  intro "start"
  alt "a" {
    "left" { info "l1" info "l2" }
    "right" { info "r1" }
  }
  par "p" {
    { info "x1" info "x2" }
    { info "y1" }
  }
}`).doc!;
    const out = flowMarkdown(doc, doc.flows[0]!);
    expect(out).toContain('   - **Branch "left"**\n      1. **Info** — l1\n      2. **Info** — l2\n');
    expect(out).toContain('   - **Branch "right"**\n      1. **Info** — r1\n');
    expect(out).toContain('   - **Lane 2**\n      1. **Info** — y1\n');
    expect(out.startsWith('1. **Intro** — start')).toBe(false);
    expect(out).toContain('1. **Intro** — start');
    expect(out).toContain('\n2. **Alternative**');
    expect(out).toContain('\n3. **Parallel**');
  });

  it('renders an empty flow without inventing steps', () => {
    const doc = parsePDL('pcd 1.0\nflow "Nothing" as z {\n}').doc!;
    expect(flowMarkdown(doc, doc.flows[0]!)).toBe('# Nothing\n');
  });

  it('ends with exactly one newline and never mutates the document', () => {
    const doc = docFor();
    const before = JSON.stringify(doc);
    const out = flowMarkdown(doc, doc.flows[0]!);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('builds safe file names from the flow title', () => {
    const doc = docFor();
    expect(markdownFileName(doc.flows[0]!, 'diagram.pcd')).toBe('diagram.cafe-walkthrough.md');
    expect(markdownFileName(doc.flows[1]!, 'notes.txt')).toBe('notes.refunds.md');
    expect(markdownFileName(doc.flows[1]!, null)).toBe('flows.refunds.md');
  });
});
