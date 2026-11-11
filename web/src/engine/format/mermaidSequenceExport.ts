// SPDX-License-Identifier: GPL-3.0-only
// Loss-declared PDL Flow → Mermaid sequenceDiagram converter (FR-W4, M6-WP7).
import type { Doc, Flow, FlowStep, Obj } from '../model/types';
import type { MermaidExportResult } from './mermaidExport';

export const SEQUENCE_DROP_CATALOGUE = ['per-step delays', 'goto navigation', 'notes without participants'] as const;

const sanitizeId = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, '_');

/** Mermaid treats semicolons as statement separators and <br/> as a line break. */
const text = (value: string): string =>
  value.replace(/;/g, '#59;').replace(/\r?\n/g, '<br/>');

const label = (value: string | undefined, fallback: string): string => text(value ?? fallback);

function objectFor(doc: Doc, id: string): Obj | undefined {
  return doc.objects.find((o) => o.id === id);
}

function noteIds(step: Extract<FlowStep, { type: 'intro' | 'info' | 'conclusion' }>, steps: FlowStep[], index: number): string[] {
  if (step.type === 'intro') {
    const next = steps.slice(index + 1).find((s) => s.type === 'msg');
    return next?.type === 'msg' ? [next.from, next.to] : [];
  }
  return [];
}

function participants(steps: FlowStep[], out: string[] = []): string[] {
  const add = (id: string): void => {
    if (!out.includes(id)) out.push(id);
  };
  for (const step of steps) {
    if (step.type === 'msg') {
      add(step.flip === true ? step.to : step.from);
      add(step.flip === true ? step.from : step.to);
    } else if (step.type === 'process') add(step.target);
    else if (step.type === 'alt') for (const b of step.branches) participants(b.steps, out);
    else if (step.type === 'par') for (const lane of step.lanes) participants(lane, out);
  }
  return out;
}

interface EmitContext {
  doc: Doc;
  lines: string[];
  dropped: string[];
  ids: string[];
  depth: number;
}

function emitNote(ctx: EmitContext, value: string, ids: string[], scope: string[]): void {
  const known = ids.filter((id) => ctx.ids.includes(id));
  const targets = known.length > 0 ? known : scope.length > 0 ? scope : ctx.ids;
  if (targets.length === 0) {
    if (!ctx.dropped.includes('notes without participants')) ctx.dropped.push('notes without participants');
    return;
  }
  const unique = [...new Set(targets)];
  const first = unique[0]!;
  const last = unique.at(-1)!;
  ctx.lines.push(`${'  '.repeat(ctx.depth)}Note over ${sanitizeId(first)},${sanitizeId(last)}: ${text(value)}`);
}

function messageArrow(doc: Doc, step: Extract<FlowStep, { type: 'msg' }>): string {
  const link = step.linkRef === undefined
    ? doc.links.find((l) => (l.from === step.from && l.to === step.to) || (l.from === step.to && l.to === step.from))
    : doc.links.find((l) => l.id === step.linkRef);
  return link?.style?.dashed === true ? '-->>' : '->>';
}

function emitAlt(ctx: EmitContext, step: Extract<FlowStep, { type: 'alt' }>, pad: string): void {
  const scope = participants(step.branches.flatMap((b) => b.steps));
  step.branches.forEach((branch, i) => {
    const heading = i === 0 ? `alt ${label(step.label, 'choice')}` : `else ${label(branch.label, `branch ${i + 1}`)}`;
    const suffix = i === 0 && branch.label ? ` — ${text(branch.label)}` : '';
    ctx.lines.push(`${pad}${heading}${suffix}`);
    ctx.depth += 1;
    emitSteps(ctx, branch.steps, scope);
    ctx.depth -= 1;
  });
  ctx.lines.push(`${pad}end`);
}

function emitPar(ctx: EmitContext, step: Extract<FlowStep, { type: 'par' }>, pad: string): void {
  const scope = participants(step.lanes.flat());
  step.lanes.forEach((lane, i) => {
    ctx.lines.push(`${pad}${i === 0 ? `par ${label(step.label, 'in parallel')}` : `and lane ${i + 1}`}`);
    ctx.depth += 1;
    emitSteps(ctx, lane, scope);
    ctx.depth -= 1;
  });
  ctx.lines.push(`${pad}end`);
}

function emitMessage(ctx: EmitContext, step: Extract<FlowStep, { type: 'msg' }>, pad: string): void {
  const from = step.flip === true ? step.to : step.from;
  const to = step.flip === true ? step.from : step.to;
  ctx.lines.push(`${pad}${sanitizeId(from)}${messageArrow(ctx.doc, step)}${sanitizeId(to)}: ${label(step.label, '')}`);
}

function emitStep(ctx: EmitContext, step: FlowStep, siblings: FlowStep[], index: number, scope: string[]): void {
  const pad = '  '.repeat(ctx.depth);
  switch (step.type) {
    case 'msg':
      emitMessage(ctx, step, pad);
      return;
    case 'process':
      ctx.lines.push(`${pad}Note over ${sanitizeId(step.target)}: ${label(step.text, 'process')}`);
      return;
    case 'intro':
    case 'info':
    case 'conclusion':
      emitNote(ctx, step.text, noteIds(step, siblings, index), scope);
      return;
    case 'alt':
      emitAlt(ctx, step, pad);
      return;
    case 'par':
      emitPar(ctx, step, pad);
      return;
    case 'goto':
      ctx.lines.push(`${pad}%% goto ${text(step.flow)}${step.file ? ` in ${text(step.file)}` : ''} not representable`);
      if (!ctx.dropped.includes('goto navigation')) ctx.dropped.push('goto navigation');
      return;
  }
}

function emitSteps(ctx: EmitContext, steps: FlowStep[], scope: string[]): void {
  steps.forEach((step, index) => emitStep(ctx, step, steps, index, scope));
}

function hasDelays(steps: FlowStep[]): boolean {
  return steps.some((s) => s.delayMs !== undefined ||
    (s.type === 'alt' && s.branches.some((b) => hasDelays(b.steps))) ||
    (s.type === 'par' && s.lanes.some(hasDelays)));
}

/** Export exactly one Flow. Other flows and diagram presentation are out of scope. */
export function flowToMermaid(doc: Doc, flow: Flow): MermaidExportResult {
  const ids = participants(flow.steps);
  const lines = ['sequenceDiagram'];
  if (flow.title !== undefined) lines.push(`  title ${text(flow.title)}`);
  for (const id of ids) {
    const object = objectFor(doc, id);
    const keyword = object?.kind === 'person' ? 'actor' : 'participant';
    lines.push(`  ${keyword} ${sanitizeId(id)} as ${text(object?.name ?? id)}`);
  }
  const ctx: EmitContext = { doc, lines, dropped: hasDelays(flow.steps) ? ['per-step delays'] : [], ids, depth: 1 };
  emitSteps(ctx, flow.steps, ids);
  return { text: `${lines.join('\n')}\n`, dropped: ctx.dropped };
}
