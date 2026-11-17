// SPDX-License-Identifier: GPL-3.0-only
// Deterministic flow documentation for humans and agents (UX08-WP14).
// Renders the parsed IR — never flattened playback beats — so the output is a
// faithful, reviewable description of what the flow does.
import type { CameraSpec, Doc, Flow, FlowStep } from '../model/types';
import { parseSafeMarkdown, serializeSafeMarkdown } from './safeMarkdown';

/** One nesting level; three spaces keeps ordered and bullet lists aligned. */
const INDENT = '   ';

const ESCAPED = /[\\`*_[\]<>|~]/g;

/** Escape markdown control characters so prose renders verbatim. */
export function escapeMarkdown(text: string): string {
  return text.replace(ESCAPED, (char) => `\\${char}`);
}

/**
 * User prose on exactly one line: line breaks collapse to spaces, so no value
 * from the IR can inject a heading or a list item into the outline.
 */
function prose(text: string): string {
  return escapeMarkdown(text.replace(/\s+/g, ' '));
}

const KIND: Record<FlowStep['type'], string> = {
  intro: 'Intro',
  msg: 'Message',
  process: 'Process',
  alt: 'Alternative',
  par: 'Parallel',
  goto: 'Go to',
  info: 'Info',
  conclusion: 'Conclusion',
};

/** `Name `id`` — and an explicit marker rather than a silent drop for gaps. */
function ref(doc: Doc, id: string): string {
  const name = doc.objects.find((obj) => obj.id === id)?.name;
  if (name === undefined) return `\`${id}\` (not in this diagram)`;
  return `${prose(name)} \`${id}\``;
}

function quoted(value: string | undefined): string {
  return value === undefined ? '' : ` "${prose(value)}"`;
}

function cameraText(camera: CameraSpec): string {
  if (camera.mode === 'auto') return 'camera auto';
  if (camera.mode === 'hold') return 'camera hold';
  const point = `camera focus (${camera.x ?? 0}, ${camera.y ?? 0})`;
  return camera.zoom === undefined ? point : `${point} zoom ${camera.zoom}`;
}

/** Dwell, camera and transition in one parenthetical; '' when unset. */
function metaText(step: FlowStep): string {
  const parts: string[] = [];
  if (step.delayMs !== undefined) parts.push(`dwell ${step.delayMs} ms`);
  if (step.camera !== undefined) parts.push(cameraText(step.camera));
  if (step.camera?.durationMs !== undefined) parts.push(`transition ${step.camera.durationMs} ms`);
  return parts.length === 0 ? '' : `(${parts.join('; ')})`;
}

function gotoText(step: Extract<FlowStep, { type: 'goto' }>): string {
  const file = step.file === undefined || step.file === '' ? '' : `${step.file}#`;
  return `${file}${step.flow}${step.ret === 'here' ? ' (returns here)' : ''}`;
}

function messageText(doc: Doc, step: Extract<FlowStep, { type: 'msg' }>): string {
  const label = step.label === undefined ? '' : `: ${prose(step.label)}`;
  return `${ref(doc, step.from)} → ${ref(doc, step.to)}${label}${step.flip === true ? ', flipped' : ''}`;
}

/** Detail after the kind badge: `**Message** — Ada `a` → Shop `b`: order`. */
function detail(doc: Doc, step: FlowStep): string {
  switch (step.type) {
    case 'msg':
      return messageText(doc, step);
    case 'process': {
      const text = step.text === undefined ? '' : `: ${prose(step.text)}`;
      return `${ref(doc, step.target)}${text}`;
    }
    case 'goto':
      return gotoText(step);
    case 'alt':
    case 'par':
      return quoted(step.label).trim();
    default:
      return prose(step.text);
  }
}

function nested(doc: Doc, steps: FlowStep[], depth: number, lines: string[]): void {
  for (const [index, step] of steps.entries()) {
    const pad = INDENT.repeat(depth);
    const badge = `${pad}${index + 1}. **${KIND[step.type]}**`;
    const label = step.type === 'alt' || step.type === 'par' ? quoted(step.label) : ` — ${detail(doc, step)}`;
    lines.push(`${badge}${label}`);
    const inner = `${pad}${INDENT}`;
    if (step.description !== undefined && step.description !== '') {
      lines.push(`${inner}_${prose(step.description)}_`);
    }
    const meta = metaText(step);
    if (meta !== '') lines.push(`${inner}${meta}`);
    children(doc, step, depth + 1, inner, lines);
  }
}

/** Alt branches and par lanes, one bullet each with their own numbering. */
function children(doc: Doc, step: FlowStep, depth: number, inner: string, lines: string[]): void {
  if (step.type === 'alt') {
    for (const branch of step.branches) {
      lines.push(`${inner}- **Branch${quoted(branch.label)}**`);
      nested(doc, branch.steps, depth + 1, lines);
    }
  } else if (step.type === 'par') {
    for (const [lane, steps] of step.lanes.entries()) {
      lines.push(`${inner}- **Lane ${lane + 1}**`);
      nested(doc, steps, depth + 1, lines);
    }
  }
}

/**
 * The authored notes source. The multiline block wins when both forms exist
 * in a hand-built IR; the editor always keeps them mutually exclusive.
 */
function notesSource(flow: Flow): string | undefined {
  return flow.descriptionLines?.join('\n');
}

/**
 * Notes are parsed with the same AST as the presentation panel and printed
 * with headings shifted under the flow heading, never flattened to prose.
 */
function noteOutline(flow: Flow, headingOffset: number): string | undefined {
  const source = notesSource(flow);
  if (source === undefined || source.trim() === '') return undefined;
  return serializeSafeMarkdown(parseSafeMarkdown(source), headingOffset).trimEnd() || undefined;
}

function titleOf(doc: Doc, flow: Flow): string {
  if (flow.title !== undefined && flow.title.trim() !== '') return flow.title;
  if (flow.id !== undefined && flow.id !== '') return flow.id;
  return `Flow ${doc.flows.indexOf(flow) + 1}`;
}

function outline(doc: Doc, flow: Flow, lines: string[], headingOffset: number): void {
  if (flow.description !== undefined && flow.description !== '') {
    lines.push('', `_${prose(flow.description)}_`);
  }
  const notes = noteOutline(flow, headingOffset);
  if (notes !== undefined) lines.push('', notes);
  if (flow.steps.length > 0) lines.push('', ...bodies(doc, flow));
}

function bodies(doc: Doc, flow: Flow): string[] {
  const lines: string[] = [];
  nested(doc, flow.steps, 0, lines);
  return lines;
}

/** One flow as a Markdown outline: heading, purpose, numbered steps. */
export function flowMarkdown(doc: Doc, flow: Flow): string {
  const lines = [`# ${prose(titleOf(doc, flow))}`];
  outline(doc, flow, lines, 1);
  return `${lines.join('\n')}\n`;
}

/** Every flow in the document, as one outline under a `Flows` heading. */
export function flowsMarkdown(doc: Doc): string {
  const lines = ['# Flows'];
  for (const flow of doc.flows) {
    lines.push('', `## ${prose(titleOf(doc, flow))}`);
    outline(doc, flow, lines, 2);
  }
  return `${lines.join('\n')}\n`;
}

function slug(text: string): string {
  const ascii = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** `stem.slug.md` — browser-safe, no path separators or shell metacharacters. */
export function markdownFileName(flow: Flow, activePath: string | null): string {
  const stem = activePath === null ? 'flows' : (activePath.split('/').pop() ?? 'flows').replace(/\.[^.]*$/, '');
  return `${stem}.${slug(flow.title ?? flow.id ?? '') || 'flow'}.md`;
}
