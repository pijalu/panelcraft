// SPDX-License-Identifier: GPL-3.0-only
// M3-WP4: per-file import/export (FR-W3/W4).
// - import: .pcd passthrough; .mmd/.mermaid/.txt via the M1 mermaid import
//   converter (target files are always .pcd in the workspace).
// - export: .pcd (canonical re-print), .mmd (flowchart exporter — the full
//   kind→shape inverse map + goldens land with M4-WP5), .svg (renderer
//   serialize + sanitize, N6), .png (OffscreenCanvas).
// Browser-only adapters (download anchors, file pickers) live in ui/ — this
// module stays DOM-safe except where an SVGElement is passed in.
import { readFile, type FsNode } from './fs';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import { fromMermaid, M } from '../engine/format/mermaid';
import type { Doc, Obj, Link } from '../engine/model/types';

export const PCARD_IMPORT_EXTS = ['.pcd', '.mmd', '.mermaid', '.txt'] as const;
export const EXPORT_EXTS = ['.pcd', '.mmd', '.svg', '.png'] as const;

/** Workspace path for an imported file: mermaid sources become `.pcd`. */
export function targetPathForImport(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pcd')) return name;
  return name.replace(/\.(mmd|mermaid|txt)$/i, '.pcd');
}

export interface ImportedFile {
  path: string;
  content: string;
  /** Non-fatal converter diagnostics (M100 ignored / M200 unsupported). */
  diagnostics: string[];
}

/** Convert imported text to workspace (.pcd) content. Throws on fatal errors. */
export function importText(name: string, text: string): ImportedFile {
  const lower = name.toLowerCase();
  const path = targetPathForImport(name);
  if (lower.endsWith('.pcd')) {
    assertParses(text, name);
    return { path, content: text, diagnostics: [] };
  }
  if (lower.endsWith('.mmd') || lower.endsWith('.mermaid') || lower.endsWith('.txt')) {
    const result = fromMermaid(text);
    const diagnostics = result.diagnostics.map((d) => `${d.code}: ${d.message}`);
    if (!result.doc) {
      throw new Error(`mermaid import failed for ${name}: ${diagnostics.join('; ') || 'no output'}`);
    }
    return { path, content: printDoc(result.doc), diagnostics };
  }
  throw new Error(`unsupported import type: ${name}`);
}

function assertParses(text: string, name: string): void {
  const result = parsePDL(text);
  const fatal = result.diagnostics?.filter((d) => d.severity === 'error') ?? [];
  if (fatal.length > 0) {
    throw new Error(`invalid .pcd (${name}): ${fatal[0]?.message ?? 'parse error'}`);
  }
}

/** Export as canonical .pcd (printer round-trip normalizes legacy text). */
export function exportPcd(root: FsNode, path: string): string {
  const source = readFile(root, path);
  const result = parsePDL(source);
  if (!result.doc) {
    const first = result.diagnostics[0];
    throw new Error(`cannot export invalid .pcd (${path}): ${first?.message ?? 'parse error'}`);
  }
  return printDoc(result.doc);
}

export interface MermaidExport {
  text: string;
  /** Features present in the source but dropped, per FILE-FORMAT §9 / FR-M4. */
  dropped: string[];
}

/**
 * PDL → mermaid flowchart TD (FILE-FORMAT §9). M3 ships the structural
 * exporter (objects/links/subgraphs/classDef); the complete kind→shape
 * inverse table + corpus goldens + re-import property test arrive M4-WP5.
 */
export function exportMmd(root: FsNode, path: string): MermaidExport {
  const result = parsePDL(readFile(root, path));
  if (!result.doc) {
    const first = result.diagnostics[0];
    throw new Error(`cannot export invalid .pcd (${path}): ${first?.message ?? 'parse error'}`);
  }
  return docToMermaid(result.doc);
}

function emitObjects(doc: Doc, lines: string[]): void {
  const idOf = sanitizeMermaidId;
  const groups = doc.objects.filter((o) => o.kind === 'group');
  const plain = doc.objects.filter((o) => o.kind !== 'group');
  for (const o of plain) lines.push(`  ${idOf(o.id)}[${mermaidLabel(o)}]`);
  for (const g of groups) {
    lines.push(`  subgraph ${idOf(g.id)}[${mermaidLabel(g)}]`);
    const children = (g.contains ?? [])
      .map((c) => doc.objects.find((o) => o.id === c))
      .filter((o): o is Obj => o !== undefined && o.kind !== 'group');
    for (const child of children) lines.push(`    ${idOf(child.id)}[${mermaidLabel(child)}]`);
    lines.push('  end');
  }
}

function emitLinks(doc: Doc, lines: string[]): void {
  const idOf = sanitizeMermaidId;
  for (const l of doc.links) {
    const labelParts: string[] = [];
    if (l.type && l.type !== 'uses') labelParts.push(`${l.type}:`);
    if (l.label) labelParts.push(l.label);
    const arrow = l.bidir ? '<-->' : '-->';
    lines.push(
      labelParts.length > 0
        ? `  ${idOf(l.from)} ${arrow}|${labelParts.join(' ')}| ${idOf(l.to)}`
        : `  ${idOf(l.from)} ${arrow} ${idOf(l.to)}`,
    );
  }
}

function emitTags(doc: Doc, lines: string[]): void {
  const idOf = sanitizeMermaidId;
  const seenTags = new Set<string>();
  for (const o of doc.objects) {
    if ((o.tags?.length ?? 0) === 0) continue;
    for (const tag of o.tags ?? []) {
      if (!seenTags.has(tag)) {
        seenTags.add(tag);
        lines.push(`  classDef ${idOf(tag)} fill:#ffeeaa,stroke:#333;`);
      }
    }
    lines.push(`  class ${idOf(o.id)} ${(o.tags ?? []).map(idOf).join(',')};`);
  }
}

function collectDrops(doc: Doc): string[] {
  const dropped: string[] = [];
  if (doc.imports.length > 0) dropped.push('imports (source text not inlined)');
  if (doc.flows.length > 0) dropped.push('flows');
  if (doc.views.length > 0) dropped.push('views');
  if (doc.objects.some((o) => o.properties?.length)) dropped.push('properties');
  if (doc.objects.some((o) => o.icon)) dropped.push('icons');
  if (doc.links.some((l) => l.waypoints?.length)) dropped.push('waypoints');
  return dropped;
}

export function docToMermaid(doc: Doc): MermaidExport {
  const lines: string[] = ['flowchart TD'];
  emitObjects(doc, lines);
  emitLinks(doc, lines);
  emitTags(doc, lines);
  return { text: `${lines.join('\n')}\n`, dropped: collectDrops(doc) };
}

function mermaidLabel(o: Obj): string {
  const text = o.name ?? o.id;
  return text.replace(/"/g, '&quot;');
}

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_');
}

/* ---- SVG/PNG export ---- */

/** Serialize the live canvas SVG and strip unsafe content (SPEC N6). */
export function exportSvg(svg: SVGSVGElement): string {
  const text = new XMLSerializer().serializeToString(svg);
  return sanitizeSvg(text);
}

const UNSAFE_TAG = /<\s*(script|foreignObject)\b[\s\S]*?<\/\s*\1\s*>/gi;
const UNSAFE_ATTR = /\s(on[a-z]+|srcdoc|href\s*=\s*["']?\s*javascript:)[^ >]*/gi;

/** Remove scripts/foreignObject and script-URL/event attributes from SVG text. */
export function sanitizeSvg(svgText: string): string {
  return svgText.replace(UNSAFE_TAG, '').replace(UNSAFE_ATTR, '');
}

export interface PngExport {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Rasterize an SVG element to PNG via OffscreenCanvas (FR-W4). Requires
 * `createImageBitmap` + `OffscreenCanvas` (all evergreen browsers; jsdom
 * tests stub them or exercise the guard).
 */
export async function exportPng(svg: SVGSVGElement, scale = 2): Promise<PngExport> {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.OffscreenCanvas !== 'function' || typeof g.createImageBitmap !== 'function') {
    throw new Error('png export requires OffscreenCanvas + createImageBitmap');
  }
  const width = svg.width.baseVal.value || 800;
  const height = svg.height.baseVal.value || 600;
  const text = exportSvg(svg);
  const svgBlob = new Blob([text], { type: 'image/svg+xml' });
  const bitmap = await createImageBitmap(svgBlob);
  const canvas = new OffscreenCanvas(Math.ceil(width * scale), Math.ceil(height * scale)) as OffscreenCanvas;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { blob, width: canvas.width, height: canvas.height };
}

/* ---- shared bits ---- */

export const MERMAID_DIAG = M;
export type { Link };
