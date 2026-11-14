// SPDX-License-Identifier: GPL-3.0-only
// CX-04: inline SVG previews + option lists for the connector style pickers.
// Previews are 48×20 so a row of them fits the properties panel; they use
// `currentColor` so the panel theme drives their contrast.
import type { VisualOption } from './VisualPicker';
import { s } from './strings';

const VIEW = { width: 48, height: 20 } as const;

function Preview(props: { children: unknown; label: string }) {
  return (
    <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} width={VIEW.width} height={VIEW.height} focusable="false">
      <title>{props.label}</title>
      {props.children as never}
    </svg>
  );
}

const ROUTE_PATHS: Record<string, string> = {
  orthogonal: 'M 3 16 L 18 16 L 18 4 L 45 4',
  straight: 'M 3 16 L 45 4',
  curved: 'M 3 16 C 16 16 30 4 45 4',
};

export const ROUTE_OPTIONS: VisualOption[] = [
  { value: 'orthogonal', label: s('Orthogonal'), preview: <Preview label={s('Orthogonal')}><path d={ROUTE_PATHS['orthogonal']} fill="none" stroke="currentColor" stroke-width="2" /></Preview> },
  { value: 'straight', label: s('Straight'), preview: <Preview label={s('Straight')}><path d={ROUTE_PATHS['straight']} fill="none" stroke="currentColor" stroke-width="2" /></Preview> },
  { value: 'curved', label: s('Curved'), preview: <Preview label={s('Curved')}><path d={ROUTE_PATHS['curved']} fill="none" stroke="currentColor" stroke-width="2" /></Preview> },
];

const LINE_DASH: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '6 3',
  dotted: '1 3',
};

export const LINE_OPTIONS: VisualOption[] = [
  { value: 'solid', label: s('Solid'), preview: <Preview label={s('Solid')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="2" /></Preview> },
  { value: 'dashed', label: s('Dashed'), preview: <Preview label={s('Dashed')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray={LINE_DASH['dashed']} /></Preview> },
  { value: 'dotted', label: s('Dotted'), preview: <Preview label={s('Dotted')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray={LINE_DASH['dotted']} /></Preview> },
];

/** Common widths; any other value stays editable in the numeric field. */
export const WIDTH_OPTIONS: VisualOption[] = [
  { value: '1', label: s('Thin'), preview: <Preview label={s('Thin')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="1" /></Preview> },
  { value: '1.5', label: s('Normal'), preview: <Preview label={s('Normal')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="1.5" /></Preview> },
  { value: '2', label: s('Bold'), preview: <Preview label={s('Bold')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="2" /></Preview> },
  { value: '3', label: s('Heavy'), preview: <Preview label={s('Heavy')}><line x1="3" y1="10" x2="45" y2="10" stroke="currentColor" stroke-width="3" /></Preview> },
];

/** Marker glyph drawn at the right end of a short line. */
function MarkerGlyph(props: { marker: string }) {
  const m = props.marker;
  return (
    <g stroke="currentColor" fill="currentColor">
      <line x1="3" y1="10" x2={m === 'none' ? 45 : 34} y2="10" stroke-width="2" />
      {m === 'arrow' && <polygon points="34,5 45,10 34,15" />}
      {m === 'open' && <polyline points="34,5 45,10 34,15" fill="none" stroke-width="2" />}
      {m === 'diamond' && <polygon points="34,10 39,5 44,10 39,15" />}
      {m === 'circle' && <circle cx="39" cy="10" r="5" />}
      {m === 'square' && <rect x="34" y="5" width="10" height="10" />}
    </g>
  );
}

const MARKERS = [
  { value: 'arrow', label: s('Arrow') },
  { value: 'open', label: s('Open arrow') },
  { value: 'diamond', label: s('Diamond') },
  { value: 'circle', label: s('Circle') },
  { value: 'square', label: s('Square') },
  { value: 'none', label: s('None') },
] as const;

export const MARKER_OPTIONS: VisualOption[] = MARKERS.map((m) => ({
  value: m.value,
  label: m.label,
  preview: (
    <Preview label={m.label}>
      <MarkerGlyph marker={m.value} />
    </Preview>
  ),
}));
