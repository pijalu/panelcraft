// SPDX-License-Identifier: GPL-3.0-only
// Mermaid exporter (M4-WP5) — PDL → mermaid flowchart TD per FILE-FORMAT §9.
// Declared-lossy (SPEC FR-M4): flows, views/positions, properties, icons,
// waypoints, note anchors, styles beyond fill, meta directives are dropped and
// *reported* via the returned `dropped` list (FR-M5: never silent). Imports
// are flattened: imported objects are inlined under `alias_id` and marked with
// a `%% imported from <path>` comment. The kind→shape inverse of the §8 import
// table makes `system` and `container` both rect — that aliasing is declared
// too. Pure module: the workspace FS enters only via the `resolveImport`
// callback (text → source, or null when the import is missing).
import { parsePDL } from './parser';
import type { Doc, Obj, StyleBlock } from '../model/types';

export interface MermaidExportResult {
  /** Mermaid flowchart text (ends with a newline). */
  text: string;
  /** Features present in the source but not representable (FR-M4, declared). */
  dropped: string[];
}

export interface MermaidExportOptions {
  /** Resolve an import path to its source text; null/absent = not inlined. */
  resolveImport?: (path: string) => string | null;
}

const SHAPE: Record<Obj['kind'], (label: string) => string> = {
  person: (l) => `((${l}))`,
  system: (l) => `[${l}]`,
  container: (l) => `[${l}]`,
  system_ext: (l) => `([${l}])`,
  component: (l) => `(${l})`,
  datastore: (l) => `[(${l})]`,
  queue: (l) => `>${l}]`,
  note: (l) => `{${l}}`,
  // groups never take a shape (subgraph emission); total map keeps typing simple
  group: (l) => `[${l}]`,
};

const escapeLabel = (text: string): string => text.replace(/"/g, '&quot;');

const sanitizeId = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, '_');

const labelOf = (o: Obj): string => escapeLabel(o.name ?? o.id);

const shapeOf = (o: Obj): string => SHAPE[o.kind](labelOf(o));

/** style override → mermaid `style id fill:#…`; other keys are declared drops. */
const emitFills = (doc: Doc, lines: string[]): void => {
  for (const s of doc.styles) {
    if (s.style.fill) lines.push(`  style ${sanitizeId(s.target)} fill:${s.style.fill}`);
  }
  for (const o of doc.objects) {
    if (o.style?.fill && !doc.styles.some((s) => s.target === o.id)) {
      lines.push(`  style ${sanitizeId(o.id)} fill:${o.style.fill}`);
    }
  }
};

const emitTags = (doc: Doc, lines: string[]): void => {
  const seen = new Set<string>();
  for (const o of doc.objects) {
    for (const tag of o.tags ?? []) {
      if (!seen.has(tag)) {
        seen.add(tag);
        // keep the tag verbatim: sanitising made the re-import rename the class
        lines.push(`  classDef ${tag} fill:#ffeeaa,stroke:#333;`);
      }
    }
  }
  for (const o of doc.objects) {
    if ((o.tags?.length ?? 0) > 0) {
      lines.push(`  class ${sanitizeId(o.id)} ${(o.tags ?? []).join(',')};`);
    }
  }
};

/** Emit objects. Groups first: the §8 re-import keeps the first definition of
 * a node, so children must be *created* inside the subgraph block for
 * `contains` to survive the round trip; un-grouped nodes follow. */
const emitObjects = (doc: Doc, lines: string[]): void => {
  emitGroups(doc, lines);
  emitUngrouped(doc, lines);
};

const emitGroups = (doc: Doc, lines: string[]): void => {
  for (const g of doc.objects) {
    if (g.kind !== 'group') continue;
    lines.push(`  subgraph ${sanitizeId(g.id)}[${labelOf(g)}]`);
    for (const cid of g.contains ?? []) {
      const child = doc.objects.find((o) => o.id === cid);
      if (child && child.kind !== 'group') lines.push(`    ${sanitizeId(child.id)}${shapeOf(child)}`);
    }
    lines.push('  end');
  }
};

const emitUngrouped = (doc: Doc, lines: string[]): void => {
  const inGroup = new Set<string>();
  for (const g of doc.objects) {
    if (g.kind === 'group') for (const c of g.contains ?? []) inGroup.add(c);
  }
  for (const o of doc.objects) {
    if (o.kind !== 'group' && !inGroup.has(o.id)) lines.push(`  ${sanitizeId(o.id)}${shapeOf(o)}`);
  }
};

const emitLinks = (doc: Doc, lines: string[]): void => {
  for (const l of doc.links) {
    const parts: string[] = [];
    if (l.type && l.type !== 'uses') parts.push(`${l.type}:`);
    if (l.label) parts.push(l.label);
    const arrow = l.bidir ? '<-->' : '-->';
    lines.push(
      parts.length > 0
        ? `  ${sanitizeId(l.from)} ${arrow}|${escapeLabel(parts.join(' '))}| ${sanitizeId(l.to)}`
        : `  ${sanitizeId(l.from)} ${arrow} ${sanitizeId(l.to)}`,
    );
  }
};

/** Inline imported docs: objects under `alias_id`, marked with a %% comment. */
const emitImports = (doc: Doc, lines: string[], opts: MermaidExportOptions): void => {
  for (const imp of doc.imports) {
    const src = opts.resolveImport?.(imp.path) ?? null;
    if (src === null) {
      lines.push(`  %% import ${imp.alias} (${imp.path}) unresolved — not inlined`);
      continue;
    }
    lines.push(`  %% imported from ${imp.path}`);
    // Imported docs contribute objects only (links/flows/views/imports of the
    // imported file are not part of the importing file's model — §5).
    const { doc: imported } = parsePDL(src);
    for (const o of imported?.objects ?? []) {
      if (o.kind === 'group') continue;
      lines.push(`  ${sanitizeId(`${imp.alias}_${o.id}`)}${shapeOf(o)}`);
    }
  }
};

const styleExtras = (s: StyleBlock): boolean =>
  s.stroke !== undefined || s.text !== undefined || s.icon !== undefined ||
  s.shape !== undefined || s.dashed === true;

const metaDrops = (doc: Doc): string[] => {
  const d: string[] = [];
  if (doc.title) d.push('title');
  if (doc.theme) d.push('theme');
  if (doc.level) d.push('level');
  if (doc.direction && doc.direction !== 'TB') d.push('direction (auto-layout)');
  return d;
};

const linkDrops = (doc: Doc): string[] => {
  const d: string[] = [];
  if (doc.links.some((l) => l.fromAnchor !== undefined || l.toAnchor !== undefined)) {
    d.push('endpoint perimeter anchors');
  }
  if (doc.links.some((l) => l.waypoints?.length)) d.push('waypoints');
  if (doc.links.some((l) => l.allowOverlap === true)) d.push('overlap overrides');
  return d;
};

/** Any icon at all — built-in selection, style override, or a declaration. */
const usesIcons = (doc: Doc): boolean =>
  doc.icons.length > 0 ||
  doc.objects.some((o) => o.icon !== undefined || o.style?.icon !== undefined);

const bodyDrops = (doc: Doc): string[] => {
  const d: string[] = [];
  if (doc.flows.length > 0) d.push('flows');
  if (doc.views.length > 0) d.push('views (positions/layout)');
  if (doc.objects.some((o) => o.description || o.technology)) d.push('descriptions/technology');
  if (doc.objects.some((o) => o.properties?.length)) d.push('properties');
  if (doc.objects.some((o) => o.attributes?.length) || doc.links.some((l) => l.attributes?.length)) {
    d.push('unknown attributes');
  }
  // Icons are a declared drop whether they are built-in or declared in the file:
  // mermaid has no equivalent, and a project icon would otherwise vanish silently.
  if (usesIcons(doc)) d.push('icons');
  if (doc.objects.some((o) => o.z !== undefined)) d.push('object stacking order');
  if (doc.objects.some((o) => o.kind === 'note' && o.attach)) d.push('note anchors (detach)');
  if (doc.objects.some((o) => o.style && styleExtras(o.style)) || doc.styles.some((s) => styleExtras(s.style))) {
    d.push('style beyond fill (stroke/text/shape)');
  }
  d.push(...linkDrops(doc));
  return d;
};

const hasNestedGroup = (doc: Doc): boolean =>
  doc.objects.some(
    (o) => o.kind === 'group' && (o.contains ?? []).some((c) => doc.objects.find((x) => x.id === c)?.kind === 'group'),
  );

const groupDrops = (doc: Doc): string[] => {
  const d: string[] = [];
  if (doc.objects.some((o) => o.kind === 'system')) {
    d.push('system vs container kind distinction (both export as rect)');
  }
  if (hasNestedGroup(doc)) d.push('nested groups (group inside group)');
  const groupIds = new Set(doc.objects.filter((o) => o.kind === 'group').map((o) => o.id));
  if (doc.links.some((l) => groupIds.has(l.from) || groupIds.has(l.to))) {
    d.push('links with group endpoints');
  }
  return d;
};

/**
 * Every string `dropped[]` can contain (F-21). The generated
 * `docs/MERMAID-MATRIX.md` is asserted against this list, so a new drop cannot
 * be introduced without documenting it.
 */
export const EXPORT_DROP_CATALOGUE = [
  'title',
  'theme',
  'level',
  'direction (auto-layout)',
  'flows',
  'flow descriptions',
  'step descriptions',
  'camera overrides',
  'views (positions/layout)',
  'descriptions/technology',
  'properties',
  'unknown attributes',
  'icons',
  'object stacking order',
  'note anchors (detach)',
  'style beyond fill (stroke/text/shape)',
  'waypoints',
  'system vs container kind distinction (both export as rect)',
  'nested groups (group inside group)',
  'links with group endpoints',
] as const;

/** Dynamic drop prefix for unresolved imports (path is appended). */
export const UNRESOLVED_IMPORT_PREFIX = 'import ';

const collectDrops = (doc: Doc, unresolved: string[]): string[] => [
  ...metaDrops(doc),
  ...bodyDrops(doc),
  ...groupDrops(doc),
  ...unresolved,
];

export function docToMermaid(doc: Doc, opts: MermaidExportOptions = {}): MermaidExportResult {
  const lines: string[] = ['flowchart TD'];
  const unresolved: string[] = [];
  for (const imp of doc.imports) {
    if ((opts.resolveImport?.(imp.path) ?? null) === null) {
      unresolved.push(`import ${imp.alias} (${imp.path}) unresolved`);
    }
  }
  emitImports(doc, lines, opts);
  emitObjects(doc, lines);
  emitLinks(doc, lines);
  emitTags(doc, lines);
  emitFills(doc, lines);
  return { text: `${lines.join('\n')}\n`, dropped: collectDrops(doc, unresolved) };
}
