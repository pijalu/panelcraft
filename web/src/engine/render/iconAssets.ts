// SPDX-License-Identifier: GPL-3.0-only
// Project-icon resolution for the renderer (IR v9, FILE-FORMAT §3.1).
//
// A document carries its own icons as Base64 SVG payloads. Rendering one means
// (a) decoding it, (b) re-checking the allowlist before drawing, and (c) handing
// the renderer something it can embed without a network request: a `data:` URI
// of the *sanitized source*. Steps (b)/(c) are deliberately independent of the
// ingest path — a file written by another tool never passes through our editor,
// so a payload that fails the check renders as nothing plus a diagnostic rather
// than as active content.

import type { Doc, IconDecl } from '../model/types';
import { decodeIconSvg, svgIssues } from '../format/iconSvg';

/** One usable project icon: canonical Base64 plus its decoded SVG source. */
export interface IconAsset {
  /** Canonical Base64 payload (embedded as `data:image/svg+xml;base64,…`). */
  data: string;
  /** Decoded SVG source (already allowlist-checked). */
  text: string;
  /**
   * Cheap content identity (FNV-1a of the payload). The renderer's structural
   * key needs to notice a *replaced* payload, and hashing 64 KiB per object per
   * frame would be waste: it is computed once, here.
   */
  key: string;
}

/** FNV-1a over the payload, as an 8-character hex string. */
function contentKey(data: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Handle → usable asset; unusable declarations are absent. */
export type IconAssets = ReadonlyMap<string, IconAsset>;

/** Same handles and same payloads — used to skip no-op controller updates. */
export function sameIconAssets(a: IconAssets, b: IconAssets): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [handle, asset] of a) {
    if (b.get(handle)?.key !== asset.key) return false;
  }
  return true;
}

/** `data:` URI for an asset — local bytes, never a network fetch. */
export const iconDataUri = (asset: IconAsset): string =>
  `data:image/svg+xml;base64,${asset.data}`;

/**
 * First unsafe/undecodable reason for a declaration, or `null` when it is
 * drawable. Used by the editor to explain why an icon shows as blank.
 */
export function iconProblem(decl: IconDecl): string | null {
  const text = decodeIconSvg(decl.data);
  if (text === null) return 'payload is not valid UTF-8';
  const issues = svgIssues(text);
  return issues.length > 0 ? `unsafe or unsupported SVG content: ${issues.join(', ')}` : null;
}

/** Usable icons of a document, keyed by handle (first declaration wins). */
export function iconAssetsOf(doc: Doc): IconAssets {
  const assets = new Map<string, IconAsset>();
  for (const decl of doc.icons) {
    if (assets.has(decl.id)) continue;
    const text = decodeIconSvg(decl.data);
    if (text === null || svgIssues(text).length > 0) continue;
    assets.set(decl.id, { data: decl.data, text, key: contentKey(decl.data) });
  }
  return assets;
}

/** Asset for an `icon name` reference, or `undefined` for built-in/unknown names. */
export const assetFor = (
  name: string | undefined,
  assets: IconAssets | undefined,
): IconAsset | undefined => (name === undefined || assets === undefined ? undefined : assets.get(name));
