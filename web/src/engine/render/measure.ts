// SPDX-License-Identifier: GPL-3.0-only
// Text measurement port (F-13; review §3.4 "fit-to-name").
//
// The canvas needs to know how wide a label is before it can size a box. The
// engine is DOM-free by design, so measurement arrives through a port: the
// browser injects an offscreen-canvas implementation, tests inject a
// deterministic stub (jsdom has no layout, and a real font metric would make
// goldens machine-dependent).

import type { Kind } from '../model/types';
import { isIcon } from './icons';
import { contentHeight, rightContentReserve } from './shapes';

/** Only a drawable icon reserves height (an unknown name renders nothing). */
const hasDrawableIcon = (icon: string | undefined): boolean =>
  icon !== undefined && isIcon(icon);

export interface TextMetrics2D {
  w: number;
  h: number;
}

/** Measure one line of text in CSS pixels. */
export interface TextMeasurer {
  measure(text: string): TextMetrics2D;
}

export const FONT = {
  /** Label font shorthand — keep in sync with `.pc-label` (`--pc-text-sm`). */
  label: '12px system-ui, sans-serif',
  /** Fallback shorthand for engines that reject the generic `system-ui`. */
  fallback: '12px sans-serif',
  lineHeight: 16,
} as const;

/** Slack multiplier: glyph rasterisation varies by platform/font fallback. */
const SLACK = 1.06;

export const PADDING = { x: 12, y: 10 } as const;
export const MIN_BOX = { w: 48, h: 32 } as const;
export const MAX_BOX = { w: 360, h: 200 } as const;
/** Longest line before the label wraps (single break, two lines max). */
export const WRAP_AT = 180;

/** Deterministic stub: 7 px per character, fixed line height (tests, SSR). */
export const stubMeasurer: TextMeasurer = {
  measure(text: string) {
    return { w: text.length * 7, h: FONT.lineHeight };
  },
};

/**
 * Offscreen-canvas measurer (browser). Falls back to the stub when a 2D
 * context is unavailable (jsdom, privacy modes, test doubles).
 */
export function canvasMeasurer(font: string = FONT.label): TextMeasurer {
  const ctx = openContext(font);
  if (!ctx) return stubMeasurer;
  const c = ctx;
  return {
    measure(text: string) {
      const m = c.measureText(text);
      const w = m.width * SLACK; // never under-measure: overflow is the defect
      const h = ((m.actualBoundingBoxAscent ?? 0) + (m.actualBoundingBoxDescent ?? 0)) || FONT.lineHeight;
      return { w, h };
    },
  };
}

/**
 * Offscreen 2D context with the label font applied. `ctx.font = …` silently
 * keeps the previous font when the shorthand is not understood (e.g. a generic
 * family the engine cannot resolve), which would under-measure every label —
 * so the assignment is verified and a portable family is tried as a fallback.
 */
function openContext(font: string): CanvasRenderingContext2D | null {
  try {
    if (typeof document === 'undefined') return null;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    for (const candidate of [font, FONT.fallback]) {
      ctx.font = candidate;
      if (ctx.font.includes('12px') && ctx.font !== '10px sans-serif') return ctx;
    }
    return null;
  } catch {
    return null;
  }
}

/** Split a label into at most two lines at a word boundary near `WRAP_AT`. */
export function wrapLabel(
  text: string,
  measure: TextMeasurer,
  maxWidth = WRAP_AT,
  maxLines = 2,
): string[] {
  if (measure.measure(text).w <= maxWidth) return [text];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 2) return [text];
  const lines: string[] = [];
  let current = words[0] ?? '';
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (measure.measure(candidate).w <= maxWidth || current === '') current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  // Auto-fit keeps two lines by folding the tail. Explicit narrow shapes may
  // request unlimited lines so every word fits instead of overflowing the box.
  if (lines.length > maxLines && maxLines > 1) {
    return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
  }
  return lines;
}

export interface AutoSizeInput {
  /** Label the box must fit (falls back to the id). */
  text: string;
  kind: Kind;
  /** Optional inline icon reserves the same right-side region as the renderer. */
  icon?: string;
}

/**
 * Box that fits `text` with padding, clamped to MIN/MAX (F-13 fit-to-name).
 * A wrapped two-line label grows in height instead of width.
 */
export function autoSize(
  input: AutoSizeInput,
  measure: TextMeasurer = stubMeasurer,
): { w: number; h: number; lines: string[] } {
  const lines = wrapLabel(input.text, measure);
  const widest = Math.max(...lines.map((l) => measure.measure(l).w));
  const reserve = rightContentReserve(input.kind);
  const w = clamp(Math.round(widest + 2 * PADDING.x + reserve), MIN_BOX.w, MAX_BOX.w);
  // UX08-WP07: the icon has its own top band, so it grows the box's height.
  const h = clamp(contentHeight(input.kind, lines.length, hasDrawableIcon(input.icon)), MIN_BOX.h, MAX_BOX.h);
  return { w, h, lines };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
