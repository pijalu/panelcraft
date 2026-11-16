// SPDX-License-Identifier: GPL-3.0-only
// Document icon operations (IR v9, FILE-FORMAT §3.1): add, rename and remove a
// declaration so that references never dangle silently.
//
// All three are pure Doc → Doc transitions. The caller decides how the result is
// written (the editor commits it as one undoable document change), so a rename
// touching twelve objects lands as a single history step, and a removal that
// would strand references is refused unless the caller asks to clear them.

import { ICON_MEDIA_TYPES, decodeIconSvg, isCanonicalBase64, svgIssues } from '../format/iconSvg';
import { isBuiltinIcon } from './icons';
import type { Doc, IconDecl, Obj, StyleStmt } from './types';

/** PDL identifier + reserved-handle rules for a project icon handle. */
export const ICON_HANDLE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/** Where one icon handle is referenced inside a document. */
export interface IconUsage {
  /** Objects whose `icon name` points at the handle. */
  objects: string[];
  /** Objects carrying `style { icon name }`. */
  styleObjects: string[];
  /** Top-level `style <target> { icon name }` statements. */
  styles: string[];
}

export interface IconDocResult {
  doc: Doc;
  /** References rewritten (rename) or cleared (remove). */
  refs: number;
}

export type RemoveResult =
  | { ok: true; doc: Doc; refs: number }
  | { ok: false; usages: IconUsage; refs: number };

/** References to `id` in the document, in document order. */
export function iconUsages(doc: Doc, id: string): IconUsage {
  const objects: string[] = [];
  const styleObjects: string[] = [];
  const styles: string[] = [];
  for (const o of doc.objects) {
    if (o.icon === id) objects.push(o.id);
    if (o.style?.icon === id) styleObjects.push(o.id);
  }
  for (const st of doc.styles) {
    if (st.style.icon === id) styles.push(st.target);
  }
  return { objects, styleObjects, styles };
}

/** Total reference count of an icon handle. */
export const iconUsageCount = (usages: IconUsage): number =>
  usages.objects.length + usages.styleObjects.length + usages.styles.length;

/** Handles already taken: built-ins plus the document's own declarations. */
export function takenHandles(doc: Doc, ignore?: string): Set<string> {
  const taken = new Set<string>();
  for (const ic of doc.icons) if (ic.id !== ignore) taken.add(ic.id);
  return taken;
}

/** Why `handle` cannot be used for a project icon, or `null` when it can. */
export function handleProblem(doc: Doc, handle: string, ignore?: string): string | null {
  if (!ICON_HANDLE.test(handle)) {
    return 'use letters, digits, dashes or underscores, starting with a letter (max 64)';
  }
  // The built-in namespace is reserved (validation P207): shadowing one would
  // make the same `icon name` mean different things in different files.
  if (isBuiltinIcon(handle)) return 'that handle belongs to a built-in icon';
  if (takenHandles(doc, ignore).has(handle)) return 'that handle is already declared in this file';
  return null;
}

/** Why a declaration cannot be stored, or `null` when it is acceptable. */
export function declarationProblem(decl: IconDecl): string | null {
  if (!ICON_MEDIA_TYPES.includes(decl.mediaType)) return `unsupported media type "${decl.mediaType}"`;
  if (!isCanonicalBase64(decl.data)) return 'payload is not canonical Base64';
  const svg = decodeIconSvg(decl.data);
  if (svg === null) return 'payload is not valid UTF-8 text';
  const issues = svgIssues(svg);
  if (issues.length > 0) return `unsafe or unsupported SVG content: ${issues.join(', ')}`;
  return svg.trim() === '' ? 'payload is empty' : null;
}

/** Append a declaration (validated handle + payload). Throws on a bad input. */
export function addIcon(doc: Doc, decl: IconDecl): Doc {
  const handleProblem_ = handleProblem(doc, decl.id);
  if (handleProblem_ !== null) throw new Error(handleProblem_);
  const payloadProblem = declarationProblem(decl);
  if (payloadProblem !== null) throw new Error(payloadProblem);
  return { ...doc, icons: [...doc.icons, decl] };
}

/** Replace the declaration with the same handle (keep its position and comments). */
export function replaceIcon(doc: Doc, decl: IconDecl): Doc {
  const payloadProblem = declarationProblem(decl);
  if (payloadProblem !== null) throw new Error(payloadProblem);
  const at = doc.icons.findIndex((ic) => ic.id === decl.id);
  if (at < 0) throw new Error(`no icon "${decl.id}" in this file`);
  const icons = [...doc.icons];
  icons[at] = { ...decl, pos: icons[at]!.pos };
  return { ...doc, icons };
}

/** Object with its icon references rewritten. */
function withRenamedIcon(o: Obj, from: string, to: string): Obj {
  if (o.icon !== from && o.style?.icon !== from) return o;
  return {
    ...o,
    ...(o.icon === from ? { icon: to } : {}),
    ...(o.style?.icon === from ? { style: { ...o.style, icon: to } } : {}),
  };
}

const withRenamedStyle = (st: StyleStmt, from: string, to: string): StyleStmt =>
  st.style.icon === from ? { ...st, style: { ...st.style, icon: to } } : st;

/**
 * Rename a handle and every reference to it in one transition (atomic: either
 * the declaration and all references move, or nothing does).
 */
export function renameIcon(doc: Doc, from: string, to: string): IconDocResult {
  const at = doc.icons.findIndex((ic) => ic.id === from);
  if (at < 0) throw new Error(`no icon "${from}" in this file`);
  if (from === to) return { doc, refs: 0 };
  const problem = handleProblem(doc, to, from);
  if (problem !== null) throw new Error(problem);
  const icons = [...doc.icons];
  icons[at] = { ...icons[at]!, id: to };
  const usages = iconUsages(doc, from);
  return {
    doc: {
      ...doc,
      icons,
      objects: doc.objects.map((o) => withRenamedIcon(o, from, to)),
      styles: doc.styles.map((st) => withRenamedStyle(st, from, to)),
    },
    refs: iconUsageCount(usages),
  };
}

/** Drop the `icon` reference from every place it appears. */
function withoutIconRefs(doc: Doc, id: string): Doc {
  const objects = doc.objects.map((o) => {
    if (o.icon !== id && o.style?.icon !== id) return o;
    const next: Obj = { ...o };
    delete next.icon;
    if (o.style?.icon === id) {
      const style = { ...o.style };
      delete style.icon;
      if (Object.keys(style).length === 0) delete next.style;
      else next.style = style;
    }
    return next;
  });
  const styles = doc.styles.map((st) => {
    if (st.style.icon !== id) return st;
    const style = { ...st.style };
    delete style.icon;
    return { ...st, style };
  });
  return { ...doc, objects, styles };
}

/**
 * Remove a declaration. With references present the removal is refused unless
 * `clearRefs` is set, so a delete cannot leave silent broken icons behind: the
 * editor shows the usage count and asks.
 */
export function removeIcon(doc: Doc, id: string, clearRefs = false): RemoveResult {
  const at = doc.icons.findIndex((ic) => ic.id === id);
  if (at < 0) return { ok: true, doc, refs: 0 };
  const usages = iconUsages(doc, id);
  const refs = iconUsageCount(usages);
  if (refs > 0 && !clearRefs) return { ok: false, usages, refs };
  const stripped = refs > 0 ? withoutIconRefs(doc, id) : doc;
  return { ok: true, doc: { ...stripped, icons: stripped.icons.filter((ic) => ic.id !== id) }, refs };
}

/** Every project icon with its reference count (management list). */
export function iconInventory(doc: Doc): { decl: IconDecl; refs: number }[] {
  return doc.icons.map((decl) => ({ decl, refs: iconUsageCount(iconUsages(doc, decl.id)) }));
}
