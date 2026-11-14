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
  /** Pre-wrapped label lines; auto-fit uses two, explicit narrow shapes may use more. */
  labelLines?: string[];
  /** Style overrides from the property panel (F-11). */
  style?: { fill?: string; stroke?: string; text?: string };
  /** F-20: an imported object rendered read-only (dashed + badge). */
  ghost?: boolean;
}

export const SHAPE_RADIUS = 8;
/** Person head radius + fold size for notes (shape-language constants). */
export const HEAD_R = 6;
export const NOTE_FOLD = 12;
export const LABEL_LINE_HEIGHT = 16;
export const ICON_RESERVE = ICON_BOX + 6;
export const GHOST_RESERVE = 52;

const linesOf = (obj: SceneObject): string[] =>
  obj.labelLines && obj.labelLines.length > 1 ? obj.labelLines : [obj.name ?? obj.id];

/** Right-side space unavailable to labels, shared by rendering and auto-fit. */
export function rightContentReserve(kind: Kind, icon?: string, ghost = false): number {
  let reserve = icon ? ICON_RESERVE : 0;
  if (kind === 'queue' || kind === 'note') reserve += 16;
  if (ghost && kind !== 'group') reserve += GHOST_RESERVE;
  return reserve;
}

/** Height needed by the shared label/glyph geometry before MIN/MAX clamps. */
export function contentHeight(kind: Kind, lineCount: number): number {
  const text = lineCount * LABEL_LINE_HEIGHT;
  if (kind === 'person') return text + 49; // glyph + gap + bottom padding
  if (kind === 'datastore') return text + 48; // two ellipses + gaps
  return text + 20;
}

/** Centred label inside the region left after built-in and optional adornments. */
const TEXT_MID = (obj: SceneObject): ElSpec[] => {
  const lines = linesOf(obj);
  const reserve = rightContentReserve(obj.kind, obj.icon, obj.ghost === true);
  const compactPerson = obj.kind === 'person' && obj.h < 52;
  const left = compactPerson ? 28 : 0;
  const x = Math.max(left + 4, left + (obj.w - left - reserve) / 2);
  const middle = obj.kind === 'person' && !compactPerson
    ? obj.h - 8 - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2
    : obj.h / 2;
  const firstY = middle - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;
  return lines.map((line, i) => ({
    tag: 'text' as const,
    attrs: { x, y: firstY + i * LABEL_LINE_HEIGHT, class: 'pc-label' },
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
  const compact = obj.h < 52;
  const naturalHeadCy = compact ? HEAD_R : Math.min(obj.h * 0.32, 18);
  const firstLabelY = Number(TEXT_MID(obj)[0]?.attrs.y ?? obj.h / 2);
  const verticalScale = (firstLabelY - 12) / (naturalHeadCy + 19);
  const scale = Math.max(0.1, Math.min(1, compact ? (obj.h - 8) / 25 : verticalScale));
  const headCy = compact ? (obj.h - 25 * scale) / 2 + HEAD_R * scale : naturalHeadCy * scale;
  const headR = HEAD_R * scale;
  const shoulderY = headCy + headR + 3 * scale;
  const shoulderR = 10 * scale;
  const reserve = rightContentReserve(obj.kind, obj.icon, obj.ghost === true);
  const cx = compact ? 14 : Math.max(8, (obj.w - reserve) / 2);
  // body first — SVG paints in document order, so glyph details must come
  // after the fill rect or they are painted over (vision review r1 defect D2)
  return [
    bodyRect(obj),
    {
      tag: 'circle',
      attrs: { cx, cy: headCy, r: headR, class: 'pc-glyph' },
    },
    {
      tag: 'path',
      attrs: {
        // shoulder arc: half circle of r=10 centered below head
        d: `M ${cx - shoulderR} ${shoulderY + shoulderR} a ${shoulderR} ${shoulderR} 0 0 1 ${2 * shoulderR} 0`,
        class: 'pc-glyph',
        fill: 'none',
      },
    },
    ...TEXT_MID(obj),
  ];
}

function datastoreRadius(obj: SceneObject): number {
  const labelHeight = linesOf(obj).length * LABEL_LINE_HEIGHT;
  return Math.max(2, Math.min(obj.h * 0.2, 10, (obj.h - labelHeight - 8) / 4));
}

/** Datastore cylinder: elliptical top + body + bottom arc. */
function cylinderGlyph(obj: SceneObject): ElSpec[] {
  const ry = datastoreRadius(obj);
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

const noteFold = (obj: SceneObject): number => Math.min(NOTE_FOLD, obj.w / 3, obj.h / 3);

/** Note: rect with folded top-right corner. */
function noteGlyph(obj: SceneObject): ElSpec[] {
  const f = noteFold(obj);
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
  // F-20: imported objects carry a read-only badge
  if (obj.ghost === true) glyphs.push(ghostBadge(obj));
  return glyphs;
}

/** Small "imported" badge in the shape's bottom-right corner (F-20). */
function ghostBadge(obj: SceneObject): ElSpec {
  return {
    tag: 'text',
    attrs: { x: obj.w - 6, y: obj.h - 6, class: 'pc-label pc-ghost-badge', 'text-anchor': 'end' },
    text: 'imported',
  };
}

/** Keep icons in a kind-specific region that does not cover built-in glyphs. */
function withIcon(obj: SceneObject, glyphs: ElSpec[]): ElSpec[] {
  if (!obj.icon) return glyphs;
  let size = ICON_BOX;
  let y = 6;
  if (obj.kind === 'datastore') {
    const ry = datastoreRadius(obj);
    size = Math.max(4, Math.min(16, obj.h - 4 * ry - 8));
    y = 2 * ry + 4;
  } else if (obj.kind === 'note') {
    const fold = noteFold(obj);
    size = Math.max(4, Math.min(ICON_BOX, obj.h - fold - 12));
    y = fold + 6;
  }
  const x = obj.w - size - 6;
  const specs = iconGlyphs(obj.icon, x, y, size) as unknown as ElSpec[];
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
        ...linesOf(obj).map((line, i) => ({
          tag: 'text' as const,
          attrs: { x: 8, y: 16 + i * 14, class: 'pc-label pc-label-title' },
          text: line,
        })),
      ];
    default:
      // system / system_ext / container / component: rounded rect
      return [bodyRect(obj), ...TEXT_MID(obj)];
  }
}
