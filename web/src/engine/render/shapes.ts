// SPDX-License-Identifier: GPL-3.0-only
// C4 shape set (M2-WP5): glyph specs per object kind. Pure data — no DOM —
// so geometry is unit-testable. Colors/textures come exclusively from CSS
// custom properties (STYLE-GUIDE tokens); glyph specs carry class names only.

import type { Kind } from '../model/types';
import { ICON_BOX, iconGlyphs, isIcon } from './icons';
import { iconDataUri, type IconAsset } from './iconAssets';

export interface ElSpec {
  tag: 'rect' | 'path' | 'circle' | 'text' | 'line' | 'image';
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
  /** Optional stacking override; absent = auto/effective z=0 (CX-03). */
  z?: number;
  /** style-override passthrough (IR style block, FR-C6) */
  dashed?: boolean;
  /** inline icon name (M5-WP7, engine/render/icons.ts) */
  icon?: string;
  /** Project icon payload for that name, when the document declares one (IR v9). */
  iconAsset?: IconAsset;
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

/** UX08-WP07: the one content-box geometry shared by glyphs, labels and auto-fit. */
export const CONTENT_PAD = { top: 6, bottom: 8, x: 8 } as const;
/** Space between the icon band and the label block. */
export const ICON_LABEL_GAP = 8;

export interface ContentBox {
  /** Square icon at the shape's top center (`null` without an icon). */
  icon: { x: number; y: number; size: number } | null;
  /** Label region; the wrapped block is centred in it, horizontally and vertically. */
  label: { left: number; right: number; top: number; bottom: number };
  /** Top of a built-in top band (person glyph, datastore cap). */
  glyphTop: number;
  /** Height of that band (0 when the kind has none). */
  glyphHeight: number;
}

const linesOf = (obj: SceneObject): string[] =>
  obj.labelLines && obj.labelLines.length > 1 ? obj.labelLines : [obj.name ?? obj.id];

/** Icon edge for a shape: never taller than a third of the box. */
export function iconSize(obj: SceneObject): number {
  return Math.max(4, Math.min(ICON_BOX, obj.h / 3));
}

/** Top band occupied by a kind's own glyph (person head/shoulders, datastore cap). */
function glyphBand(obj: SceneObject): { height: number } {
  // A compact person puts the glyph beside the label, not above it.
  if (obj.kind === 'person') {
    return obj.h < 52 ? { height: 0 } : { height: Math.max(10, Math.min(28, obj.h * 0.4)) };
  }
  if (obj.kind === 'datastore') return { height: 2 * datastoreRadius(obj) };
  return { height: 0 };
}

/** Where the icon goes: stacked in a top band, or inline when the box is short. */
function iconPlacement(
  obj: SceneObject,
  iconName: string | undefined,
  inline: boolean,
  size: number,
): ContentBox['icon'] {
  if (iconName === undefined) return null;
  if (inline) return { x: CONTENT_PAD.x, y: (obj.h - size) / 2, size };
  return { x: (obj.w - size) / 2, y: CONTENT_PAD.top, size };
}

/**
 * Height the built-in glyph band may use. It yields to the icon and the label
 * rather than pushing them out of the box (a person keeps its head, a smaller one).
 */
function glyphBandHeight(obj: SceneObject, iconBand: number, text: number): number {
  const room = obj.h - CONTENT_PAD.top - iconBand - text - CONTENT_PAD.bottom - 4;
  return Math.max(0, Math.min(glyphBand(obj).height, room));
}

/** Vertical bands of a content box, in canvas units. */
interface Bands {
  icon: ContentBox['icon'];
  glyphTop: number;
  glyphHeight: number;
  labelTop: number;
  inline: boolean;
}

/** A box too short for a usable stacked glyph band puts the icon beside the label. */
function iconIsInline(obj: SceneObject, glyphHeight: number): boolean {
  if (!obj.icon) return false;
  if (obj.h < 44) return true;
  return glyphBand(obj).height > 0 && glyphHeight < 10;
}

/** Top of the built-in glyph band: below a stacked icon, else under the padding. */
function glyphTopFor(obj: SceneObject, icon: ContentBox['icon'], inline: boolean): number {
  const vertical = obj.kind === 'person' || obj.kind === 'datastore';
  if (!vertical) return CONTENT_PAD.top;
  return icon !== null && !inline ? icon.y + icon.size + 4 : CONTENT_PAD.top + 2;
}

/** First row the label block may use, below whatever band came before it. */
function labelTopFor(icon: ContentBox['icon'], inline: boolean, glyphTop: number, glyphHeight: number): number {
  const stacked = icon !== null && !inline;
  if (glyphHeight > 0) return Math.max(glyphTop + glyphHeight + 4, CONTENT_PAD.top + 6);
  return stacked ? Math.max(icon.y + icon.size + ICON_LABEL_GAP, CONTENT_PAD.top + 6) : CONTENT_PAD.top + 6;
}

/** The icon name only counts when something can draw it — a built-in glyph or a
 * document icon the loader accepted — otherwise nothing is rendered, so nothing
 * may reserve space (an invisible band would push the label off centre). */
const drawableIcon = (obj: SceneObject): string | undefined => {
  if (obj.icon === undefined) return undefined;
  if (obj.iconAsset !== undefined) return obj.icon;
  return isIcon(obj.icon) ? obj.icon : undefined;
};

/** Icon placement plus the bands it leaves below it. */
function verticalBands(obj: SceneObject): Bands {
  const iconName = drawableIcon(obj);
  const size = iconName !== undefined ? iconSize(obj) : 0;
  const text = linesOf(obj).length * LABEL_LINE_HEIGHT;
  const glyphHeight = glyphBandHeight(obj, iconName !== undefined ? size + 4 : 0, text);
  const inline = iconName !== undefined && iconIsInline(obj, glyphHeight);
  const icon = iconPlacement(obj, iconName, inline, size);
  const glyphTop = glyphTopFor(obj, icon, inline);
  return {
    icon,
    glyphTop,
    glyphHeight,
    labelTop: labelTopFor(icon, inline, glyphTop, glyphHeight),
    inline,
  };
}

/**
 * The single content layout: icon band, built-in glyph band and the label
 * region. Rendering, wrapping and auto-fit all read this instead of keeping
 * their own offsets (UX08-WP07).
 */
export function contentBox(obj: SceneObject): ContentBox {
  const bands = verticalBands(obj);
  const ghost = obj.ghost === true;
  const compactPerson = obj.kind === 'person' && obj.h < 52;
  const { icon } = bands;
  const left = compactPerson ? 28 : icon !== null && bands.inline ? icon.x + icon.size + 6 : CONTENT_PAD.x;
  return {
    icon,
    glyphTop: bands.glyphTop,
    glyphHeight: bands.glyphHeight,
    label: {
      left,
      right: obj.w - CONTENT_PAD.x - rightContentReserve(obj.kind, ghost),
      top: bands.labelTop,
      // The imported badge occupies the bottom-right corner; keep clear of it.
      bottom: obj.h - CONTENT_PAD.bottom - (ghost && obj.kind !== 'group' ? 10 : 0),
    },
  };
}

/**
 * Right-side space unavailable to labels, shared by rendering and auto-fit
 * (queue band, note fold, imported badge). The icon no longer lives on the
 * right: it sits in its own top band, so it reserves height, not width.
 */
export function rightContentReserve(kind: Kind, ghost = false): number {
  let reserve = 0;
  if (kind === 'queue' || kind === 'note') reserve += 16;
  if (ghost && kind !== 'group') reserve += GHOST_RESERVE;
  return reserve;
}

/** Height needed by the shared label/glyph geometry before MIN/MAX clamps. */
export function contentHeight(kind: Kind, lineCount: number, hasIcon = false): number {
  const text = lineCount * LABEL_LINE_HEIGHT;
  const icon = hasIcon ? iconSize({ kind, h: 96, x: 0, y: 0, w: 0 } as SceneObject) + ICON_LABEL_GAP : 0;
  if (kind === 'person') return text + 49 + icon; // glyph + gap + bottom padding
  if (kind === 'datastore') return text + 48 + icon; // two ellipses + gaps
  return text + 20 + icon;
}

/**
 * Baseline offset from the top of one 16 px line box. Only half the line box,
 * because the label stylesheet centres the em box on the `y` coordinate
 * (`dominant-baseline: central` in `.pc-label`). One model, one number: adding
 * a font ascent on top of a centred baseline is what pushed labels 4 px low.
 */
export const LABEL_CENTRE = LABEL_LINE_HEIGHT / 2;

/** Centred label inside the content box (UX08-WP07). */
const TEXT_MID = (obj: SceneObject): ElSpec[] => {
  const lines = linesOf(obj);
  const box = contentBox(obj);
  const { label } = box;
  const x = Math.max(label.left + 4, (label.left + label.right) / 2);
  // Centre the *text box*, not the baselines: a two-line block must keep equal
  // air above and below, otherwise it reads bottom-heavy. A block that cannot fit
  // its region (a 32 px-tall datastore with a lid) starts at the region top
  // instead of overflowing upwards into the shape's own glyphs.
  const middle = (label.top + label.bottom) / 2;
  const top = Math.max(middle - (lines.length * LABEL_LINE_HEIGHT) / 2, label.top);
  return lines.map((line, i) => ({
    tag: 'text' as const,
    attrs: { x, y: top + LABEL_CENTRE + i * LABEL_LINE_HEIGHT, class: 'pc-label' },
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

/** Person glyph: head circle + shoulder arc inside the content box's top band. */
function personGlyph(obj: SceneObject): ElSpec[] {
  const compact = obj.h < 52;
  const box = contentBox(obj);
  const headR = compact ? HEAD_R : Math.max(4, Math.min(HEAD_R, box.glyphHeight / 4));
  const headCy = compact
    ? (obj.h - 25) / 2 + HEAD_R
    : box.glyphTop + headR;
  // The shoulder half-circle hangs below the head and must stay inside the band
  // (UX08-WP07): a glyph that grows past its region would eat the label's space.
  const shoulderY = headCy + headR + 2;
  const shoulderR = Math.max(3, Math.min(10, box.glyphTop + box.glyphHeight - shoulderY));
  const reserve = rightContentReserve(obj.kind, obj.ghost === true);
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
        // shoulder arc: half circle of r=shoulderR centered below head. Filled,
        // like the head, so the pair reads as one silhouette; `pc-glyph-outline`
        // here would leave a hairline arc under a solid head.
        d: `M ${cx - shoulderR} ${shoulderY + shoulderR} a ${shoulderR} ${shoulderR} 0 0 1 ${2 * shoulderR} 0`,
        class: 'pc-glyph',
      },
    },
    ...TEXT_MID(obj),
  ];
}

function datastoreRadius(obj: SceneObject): number {
  const labelHeight = linesOf(obj).length * LABEL_LINE_HEIGHT;
  return Math.max(2, Math.min(obj.h * 0.2, 10, (obj.h - labelHeight - 8) / 4));
}

/** Datastore cylinder: elliptical top + body + bottom arc, inside its content band. */
function cylinderGlyph(obj: SceneObject): ElSpec[] {
  const ry = datastoreRadius(obj);
  const top = contentBox(obj).glyphTop;
  // The rim owns the band below the icon: drawing from y=0 would put the cap on
  // top of a top-center icon (UX08-WP07).
  const body = { transform: `translate(0 ${top})` };
  return [
    {
      tag: 'path',
      attrs: {
        d: [
          `M 0 ${ry}`,
          `a ${obj.w / 2} ${ry} 0 0 1 ${obj.w} 0`,
          `V ${obj.h - top - ry}`,
          `a ${obj.w / 2} ${ry} 0 0 1 ${-obj.w} 0`,
          'Z',
        ].join(' '),
        class: 'pc-shape',
        ...body,
      },
    },
    {
      tag: 'path',
      attrs: {
        // top ellipse outline
        d: `M 0 ${ry} a ${obj.w / 2} ${ry} 0 0 1 ${obj.w} 0 a ${obj.w / 2} ${ry} 0 0 1 ${-obj.w} 0`,
        class: 'pc-glyph pc-glyph-outline',
        ...body,
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
        class: 'pc-glyph pc-glyph-outline',
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

/**
 * Identity of the icon an object draws, for the renderer's structural key: the
 * *name* and, for a project icon, the payload it resolves to. Without this an
 * icon change took the move-only patch path and the old glyph stayed on screen.
 */
export const iconStructuralKey = (obj: SceneObject): string =>
  `${obj.icon ?? ''}#${obj.iconAsset?.key ?? ''}`;

/** Keep the icon in the shared top-center band (UX08-WP07). */
function withIcon(obj: SceneObject, glyphs: ElSpec[]): ElSpec[] {
  const box = contentBox(obj);
  if (box.icon === null) return glyphs;
  // A project icon is embedded as a data URI of its sanitized source: local
  // bytes (never a fetch), and the browser draws an SVG served as an image in
  // static mode, where scripts and external references cannot run anyway.
  if (obj.iconAsset !== undefined) {
    const { x, y, size } = box.icon;
    return glyphs.concat([{
      tag: 'image',
      attrs: {
        x, y, width: size, height: size, href: iconDataUri(obj.iconAsset),
        class: 'pc-glyph-icon pc-glyph-project',
        preserveAspectRatio: 'xMidYMid meet',
      },
    }]);
  }
  const specs = iconGlyphs(obj.icon ?? '', box.icon.x, box.icon.y, box.icon.size) as unknown as ElSpec[];
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
