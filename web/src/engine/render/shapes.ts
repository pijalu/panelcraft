// SPDX-License-Identifier: GPL-3.0-only
// C4 shape set (M2-WP5): glyph specs per object kind. Pure data — no DOM —
// so geometry is unit-testable. Colors/textures come exclusively from CSS
// custom properties (STYLE-GUIDE tokens); glyph specs carry class names only.

import type { Kind } from '../model/types';
import { ICON_BOX, iconGlyphs } from './icons';

export interface ElSpec {
  tag: 'rect' | 'path' | 'circle' | 'text' | 'line';
  attrs: Record<string, number | string>;
  text?: string;
}

export interface SceneObject {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
  /** style-override passthrough (IR style block, FR-C6) */
  dashed?: boolean;
  /** inline icon name (M5-WP7, engine/render/icons.ts) */
  icon?: string;
  /** Pre-wrapped label lines (F-13 fit-to-name; max 2), computed by the caller. */
  labelLines?: string[];
  /** Style overrides from the property panel (F-11). */
  style?: { fill?: string; stroke?: string; text?: string };
}

export const SHAPE_RADIUS = 8;
/** Person head radius + fold size for notes (shape-language constants). */
export const HEAD_R = 6;
export const NOTE_FOLD = 12;

/** Centred label; a wrapped name renders as two stacked lines (F-13). */
const TEXT_MID = (obj: SceneObject): ElSpec[] => {
  const lines = obj.labelLines && obj.labelLines.length > 1
    ? obj.labelLines
    : [obj.name ?? obj.id];
  const lineHeight = 16;
  const firstY = obj.h / 2 - ((lines.length - 1) * lineHeight) / 2;
  return lines.map((line, i) => ({
    tag: 'text' as const,
    attrs: { x: obj.w / 2, y: firstY + i * lineHeight, class: 'pc-label' },
    text: line,
  }));
};

/** Rectangular body with rounded corners (system/container/component/queue base). */
function bodyRect(obj: SceneObject, rx = SHAPE_RADIUS): ElSpec {
  return {
    tag: 'rect',
    attrs: { x: 0, y: 0, width: obj.w, height: obj.h, rx, class: 'pc-shape' },
  };
}

/** Person glyph: head circle + shoulder arc above the body rect. */
function personGlyph(obj: SceneObject): ElSpec[] {
  const headCy = Math.min(obj.h * 0.32, 18);
  const shoulderY = headCy + HEAD_R + 3;
  const cx = obj.w / 2;
  // body first — SVG paints in document order, so glyph details must come
  // after the fill rect or they are painted over (vision review r1 defect D2)
  return [
    bodyRect(obj),
    {
      tag: 'circle',
      attrs: { cx, cy: headCy, r: HEAD_R, class: 'pc-glyph' },
    },
    {
      tag: 'path',
      attrs: {
        // shoulder arc: half circle of r=10 centered below head
        d: `M ${cx - 10} ${shoulderY + 10} a 10 10 0 0 1 20 0`,
        class: 'pc-glyph',
        fill: 'none',
      },
    },
    ...TEXT_MID(obj),
  ];
}

/** Datastore cylinder: elliptical top + body + bottom arc. */
function cylinderGlyph(obj: SceneObject): ElSpec[] {
  const ry = Math.min(obj.h * 0.2, 10);
  return [
    {
      tag: 'path',
      attrs: {
        d: [
          `M 0 ${ry}`,
          `a ${obj.w / 2} ${ry} 0 0 1 ${obj.w} 0`,
          `V ${obj.h - ry}`,
          `a ${obj.w / 2} ${ry} 0 0 1 ${-obj.w} 0`,
          'Z',
        ].join(' '),
        class: 'pc-shape',
      },
    },
    {
      tag: 'path',
      attrs: {
        // top ellipse outline
        d: `M 0 ${ry} a ${obj.w / 2} ${ry} 0 0 1 ${obj.w} 0 a ${obj.w / 2} ${ry} 0 0 1 ${-obj.w} 0`,
        class: 'pc-glyph',
        fill: 'none',
      },
    },
    ...TEXT_MID(obj),
  ];
}

/** Queue: body rect + consumption arrow band on the right edge. */
function queueGlyph(obj: SceneObject): ElSpec[] {
  const band = 12;
  const y1 = obj.h / 2 - 6;
  const y2 = obj.h / 2 + 6;
  return [
    bodyRect(obj),
    {
      tag: 'path',
      attrs: {
        d: `M ${obj.w - band} ${y1} H ${obj.w - 4} L ${obj.w - band} ${y2} Z`,
        class: 'pc-glyph',
      },
    },
    {
      tag: 'line',
      attrs: { x1: obj.w - band, y1, x2: obj.w - band, y2, class: 'pc-glyph' },
    },
    ...TEXT_MID(obj),
  ];
}

/** Note: rect with folded top-right corner. */
function noteGlyph(obj: SceneObject): ElSpec[] {
  const f = Math.min(NOTE_FOLD, obj.w / 3, obj.h / 3);
  return [
    {
      tag: 'path',
      attrs: {
        d: `M 0 0 H ${obj.w - f} L ${obj.w} ${f} V ${obj.h} H 0 Z`,
        class: 'pc-shape',
        rx: 0,
      },
    },
    {
      tag: 'path',
      attrs: {
        d: `M ${obj.w - f} 0 V ${f} H ${obj.w}`,
        class: 'pc-glyph',
        fill: 'none',
      },
    },
    ...TEXT_MID(obj),
  ];
}

/**
 * Glyph specs per kind. system_ext renders like system but its group carries
 * the kind class — theming (dashed border for external) lives in CSS.
 */
export function shapeGlyphs(obj: SceneObject): ElSpec[] {
  const glyphs = withIcon(obj, baseGlyphs(obj));
  return glyphs;
}

/** Anchor the inline icon at the shape's top-right inset (M5-WP7). */
function withIcon(obj: SceneObject, glyphs: ElSpec[]): ElSpec[] {
  if (obj.icon === undefined) return glyphs;
  const x = obj.w - ICON_BOX - 6;
  const specs = iconGlyphs(obj.icon, x, 6) as unknown as ElSpec[];
  return glyphs.concat(specs);
}

function baseGlyphs(obj: SceneObject): ElSpec[] {
  switch (obj.kind) {
    case 'person':
      return personGlyph(obj);
    case 'datastore':
      return cylinderGlyph(obj);
    case 'queue':
      return queueGlyph(obj);
    case 'note':
      return noteGlyph(obj);
    case 'group':
      // boundary: dashed rect, label pinned top-left inside the border
      return [
        {
          tag: 'rect',
          attrs: {
            x: 0,
            y: 0,
            width: obj.w,
            height: obj.h,
            rx: SHAPE_RADIUS,
            class: 'pc-shape pc-shape-boundary',
          },
        },
        {
          tag: 'text',
          attrs: { x: 8, y: 16, class: 'pc-label pc-label-title' },
          text: obj.name ?? obj.id,
        },
      ];
    default:
      // system / system_ext / container / component: rounded rect
      return [bodyRect(obj), ...TEXT_MID(obj)];
  }
}
