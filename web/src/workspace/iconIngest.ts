// SPDX-License-Identifier: GPL-3.0-only
// Icon ingest sanitizer (IR v9, FILE-FORMAT §3.1) — the removal half of the
// policy; engine/format/iconSvg.ts is the *check* half.
//
// Importing an SVG means parsing markup we did not write, so this runs the
// allowlist as a real reconstruction: parse, drop everything not named, then
// re-serialize from the surviving nodes. That is stronger than filtering text
// (hostile content inside an attribute value can never be re-read as markup when
// the serializer writes the quotes), and the result is re-checked afterwards —
// if anything still looks unsafe, nothing is stored at all.

import {
  ICON_ALLOWED_ATTRS,
  ICON_ALLOWED_ELEMENTS,
  ICON_MAX_BYTES,
  decodeIconBase64,
  decodeIconSvg,
  encodeIconSvg,
  isCanonicalBase64,
  svgIssues,
} from '../engine/format/iconSvg';

/** Why an ingest attempt produced nothing, or `null` on success. */
export type IngestError = string | null;

export interface IngestResult {
  /** Canonical Base64 of the sanitized SVG, or `null` when refused. */
  data: string | null;
  /** Sanitized SVG source (for previews), or `null`. */
  svg: string | null;
  /** Structured reason when `data` is null (UI shows it verbatim). */
  error: IngestError;
}

const fail = (error: string): IngestResult => ({ data: null, svg: null, error });

const SVG_NS = 'http://www.w3.org/2000/svg';

const isAllowedAttr = (name: string): boolean => {
  const bare = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  return (
    ICON_ALLOWED_ATTRS.includes(name) ||
    ICON_ALLOWED_ATTRS.includes(bare) ||
    name === 'role' ||
    name.startsWith('aria-') ||
    name.startsWith('data-') ||
    name.startsWith('xmlns')
  );
};

/** Attributes that must never survive, whatever the allowlist says. */
const isUnsafeAttr = (name: string, value: string): boolean => {
  if (/^on/i.test(name)) return true;
  const v = value.trim().toLowerCase();
  if (v.includes('javascript:') || v.includes('vbscript:') || v.includes('@import')) return true;
  if (v.includes('url(') || v.includes('expression(')) return true;
  const bare = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
  // links may only point inside the same document
  return (bare === 'href' || bare === 'src') && !v.startsWith('#');
};

/** Remove every disallowed node/attribute below `node`, in place. */
function prune(node: Element): void {
  for (const child of [...node.children]) {
    if (!ICON_ALLOWED_ELEMENTS.includes(child.localName)) {
      child.remove();
      continue;
    }
    prune(child);
  }
  for (const attr of [...node.attributes]) {
    if (!isAllowedAttr(attr.name) || isUnsafeAttr(attr.name, attr.value)) {
      node.removeAttribute(attr.name);
    }
  }
}

/** Give a payload a scale-independent box so it never renders at intrinsic size. */
function ensureViewBox(root: Element): void {
  if (root.getAttribute('viewBox') !== null) return;
  const w = Number.parseFloat(root.getAttribute('width') ?? '');
  const h = Number.parseFloat(root.getAttribute('height') ?? '');
  const box = w > 0 && h > 0 ? `0 0 ${w} ${h}` : '0 0 24 24';
  root.setAttribute('viewBox', box);
}

/** Sanitize SVG markup (already-parsed text) into storable canonical Base64. */
export function ingestSvgText(text: string): IngestResult {
  if (text.trim() === '') return fail('the file is empty');
  if (new TextEncoder().encode(text).length > ICON_MAX_BYTES) {
    return fail(`the icon is larger than ${ICON_MAX_BYTES / 1024} KiB`);
  }
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  const broken =
    !root ||
    root.localName !== 'svg' ||
    parsed.getElementsByTagName('parsererror').length > 0;
  if (broken) return fail('that is not well-formed SVG');
  prune(root);
  ensureViewBox(root);
  root.setAttribute('xmlns', SVG_NS);
  // Drop a pixel size: the canvas sets the size, so a stale width/height would
  // only fight it. The viewBox carries the geometry.
  root.removeAttribute('width');
  root.removeAttribute('height');
  const svg = new XMLSerializer().serializeToString(root);
  const issues = svgIssues(svg);
  if (issues.length > 0) return fail(`the icon still contains unsafe content: ${issues.join(', ')}`);
  return { data: encodeIconSvg(svg), svg, error: null };
}

/**
 * Accept what a user actually pastes: SVG markup, or a `data:` URI, or a bare
 * Base64 payload. Everything ends in the same allowlist reconstruction.
 */
export function ingestIconInput(input: string): IngestResult {
  const raw = input.trim();
  if (raw === '') return fail('paste SVG markup, a data: URI or Base64 data');
  if (raw.startsWith('<')) return ingestSvgText(raw);
  const dataUri = /^data:image\/svg\+xml(;base64)?,(.*)$/is.exec(raw);
  if (dataUri) {
    const payload = dataUri[1] === ';base64'
      ? decodeIconSvg(dataUri[2] ?? '')
      : decodeURIComponent(dataUri[2] ?? '');
    if (payload === null) return fail('the data: URI payload is not valid Base64 SVG');
    return ingestSvgText(payload);
  }
  if (!isCanonicalBase64(raw)) return fail('that is neither SVG markup nor canonical Base64');
  const decoded = decodeIconSvg(raw);
  if (decoded === null) return fail('the Base64 payload is not valid UTF-8 text');
  return ingestSvgText(decoded);
}

/** Sanitize an already-decoded payload (re-export for tests and previews). */
export const ingestSvgBase64 = (data: string): IngestResult => {
  const svg = decodeIconSvg(data);
  if (svg === null) return fail('the payload is not valid Base64 UTF-8');
  return ingestSvgText(svg);
};

/** Keep the byte helper honest for callers that only have Base64. */
export const decodeCanonical = decodeIconBase64;
