// SPDX-License-Identifier: GPL-3.0-only
// M3-WP4: per-file import/export (FR-W3/W4).
// - import: .pcd passthrough; .mmd/.mermaid/.txt via the M1 mermaid import
//   converter (target files are always .pcd in the workspace).
// - export: .pcd (canonical re-print), .mmd (engine/format/mermaidExport —
//   full FILE-FORMAT §9 exporter with declared drops, M4-WP5), .svg
//   (renderer serialize + sanitize, N6), .png (OffscreenCanvas).
// Browser-only adapters (download anchors, file pickers) live in ui/ — this
// module stays DOM-safe except where an SVGElement is passed in.
import { readFile, type FsNode } from './fs';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import { fromMermaid, M } from '../engine/format/mermaid';
import { docToMermaid, type MermaidExportResult as MermaidExport } from '../engine/format/mermaidExport';

export { docToMermaid } from '../engine/format/mermaidExport';

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

/**
 * PDL → mermaid flowchart TD (FILE-FORMAT §9, M4-WP5): kind→shape inverse,
 * tag→classDef, fill→style, imports flattened with %% marks, declared feature
 * drop. Imports resolve inside this workspace; a missing import is reported
 * (P200 semantics), never silently skipped.
 */
export function exportMmd(root: FsNode, path: string): MermaidExport {
  const result = parsePDL(readFile(root, path));
  if (!result.doc) {
    const first = result.diagnostics[0];
    throw new Error(`cannot export invalid .pcd (${path}): ${first?.message ?? 'parse error'}`);
  }
  return docToMermaid(result.doc, {
    resolveImport: (p) => {
      try {
        return readFile(root, p);
      } catch {
        return null; // missing import (P200) — exporter declares it
      }
    },
  });
}

/* ---- SVG/PNG export ---- */

/** Serialize the live canvas SVG and strip unsafe content (SPEC N6). */
export function exportSvg(svg: SVGSVGElement): string {
  const text = new XMLSerializer().serializeToString(svg);
  return sanitizeSvg(text);
}

const UNSAFE_TAG = /<\s*(script|foreignObject|iframe)\b[\s\S]*?<\/\s*\1\s*>/gi;
const UNSAFE_ATTR = /\s(on[a-z]+|srcdoc|(?:[a-z]+:)?href\s*=\s*["']?\s*javascript:)[^ >/]*/gi;
const ACTIVE_TAG = /^(script|foreignobject|iframe)$/;

/**
 * Remove scripts/foreignObject/iframes and script-URL/event attributes from
 * SVG text (SPEC N6). DOM-based: parse → prune → re-serialize, so output is
 * always well-formed and hostile text inside escaped attribute values can
 * never corrupt quoting (a pure-regex strip could eat the closing quote and
 * turn inert text back into markup — found by the M7 fuzz suite). The regex
 * pass remains only as a last resort for non-well-formed input, where the
 * document could not ship anyway.
 */
export function sanitizeSvg(svgText: string): string {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  const broken =
    !root ||
    root.tagName.toLowerCase() !== 'svg' ||
    root.getElementsByTagName('parsererror').length > 0;
  if (broken) {
    return svgText.replace(UNSAFE_TAG, '').replace(UNSAFE_ATTR, '');
  }
  pruneActive(root);
  return new XMLSerializer().serializeToString(root);
}

/** Walk the tree: drop active elements, strip event/script-URL attributes. */
function pruneActive(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (ACTIVE_TAG.test(child.tagName.toLowerCase())) {
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase().replace(/\s+/g, '');
      const dangerous =
        name.startsWith('on') ||
        ((name === 'href' || name.endsWith(':href') || name === 'srcdoc') && value.includes('javascript:'));
      if (dangerous) child.removeAttribute(attr.name);
    }
    pruneActive(child);
  }
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
