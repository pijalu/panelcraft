// SPDX-License-Identifier: GPL-3.0-only
// Versioned, browser-local workspace layout. Panel arrangement is UI settings,
// never diagram data. Pure functions keep migration and recovery testable.

export type PanelId = 'sidebar' | 'flows' | 'palette' | 'code' | 'props';
export type PanelMode = 'open' | 'collapsed' | 'closed';
export type DockId = 'left' | 'right' | 'bottom' | 'float';

export interface FloatingBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PANELS: readonly PanelId[] = ['sidebar', 'flows', 'palette', 'code', 'props'];
export const DOCKS: readonly DockId[] = ['left', 'right', 'bottom', 'float'];

export interface UiLayout {
  version: 2;
  panels: Record<PanelId, PanelMode>;
  docks: Record<PanelId, DockId>;
  /** Stable ordering inside each dock. */
  order: Record<PanelId, number>;
  widths: Record<PanelId, number>;
  heights: Record<PanelId, number>;
  floating: Partial<Record<PanelId, FloatingBounds>>;
  /** F-11: expanded/collapsed state per properties section. */
  sections: Record<string, boolean>;
}

export const WIDTH_LIMITS: Record<PanelId, { min: number; max: number }> = {
  sidebar: { min: 160, max: 420 },
  flows: { min: 200, max: 420 },
  palette: { min: 120, max: 320 },
  code: { min: 260, max: 720 },
  props: { min: 200, max: 420 },
};

export const RAIL_WIDTH = 36;
export const NARROW_VIEWPORT = 1440;
export const MIN_FLOAT_WIDTH = 280;
export const MAX_FLOAT_WIDTH = 420;
export const MIN_PANEL_HEIGHT = 160;
export const MAX_PANEL_HEIGHT = 560;

export const DEFAULT_WIDTHS: Record<PanelId, number> = {
  sidebar: 200,
  flows: 260,
  palette: 168,
  code: 360,
  props: 232,
};

export const DEFAULT_HEIGHTS: Record<PanelId, number> = {
  sidebar: 220,
  flows: 280,
  palette: 240,
  code: 260,
  props: 280,
};

export const DEFAULT_SECTIONS: Record<string, boolean> = {
  identity: true,
  metadata: true,
  style: true,
  advanced: false,
};

const DEFAULT_DOCKS: Record<PanelId, DockId> = {
  sidebar: 'left',
  flows: 'left',
  palette: 'left',
  code: 'right',
  props: 'right',
};

/** Canvas-first defaults: Shapes is open; every other secondary panel is a rail. */
export function defaultLayout(_viewportWidth = Number.POSITIVE_INFINITY): UiLayout {
  return {
    version: 2,
    panels: { sidebar: 'collapsed', flows: 'closed', palette: 'open', code: 'collapsed', props: 'collapsed' },
    docks: { ...DEFAULT_DOCKS },
    order: { sidebar: 0, flows: 1, palette: 2, code: 0, props: 1 },
    widths: { ...DEFAULT_WIDTHS },
    heights: { ...DEFAULT_HEIGHTS },
    floating: {},
    sections: { ...DEFAULT_SECTIONS },
  };
}

export function clampWidth(panel: PanelId, width: number): number {
  const { min, max } = WIDTH_LIMITS[panel];
  if (!Number.isFinite(width)) return DEFAULT_WIDTHS[panel];
  return Math.round(Math.min(Math.max(width, min), max));
}

export function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return 220;
  return Math.round(Math.min(Math.max(height, MIN_PANEL_HEIGHT), MAX_PANEL_HEIGHT));
}

/** Collapse/open; closed panels reopen through the same accessible command. */
export function togglePanel(layout: UiLayout, panel: PanelId): UiLayout {
  const next: PanelMode = layout.panels[panel] === 'open' ? 'collapsed' : 'open';
  return { ...layout, panels: { ...layout.panels, [panel]: next } };
}

export function closePanel(layout: UiLayout, panel: PanelId): UiLayout {
  return { ...layout, panels: { ...layout.panels, [panel]: 'closed' } };
}

export function openPanel(layout: UiLayout, panel: PanelId): UiLayout {
  return { ...layout, panels: { ...layout.panels, [panel]: 'open' } };
}

/** Move a panel to a dock, opening it and placing it last in that dock. */
export function movePanel(layout: UiLayout, panel: PanelId, dock: DockId): UiLayout {
  const order = Math.max(
    -1,
    ...PANELS.filter((id) => id !== panel && layout.docks[id] === dock).map((id) => layout.order[id]),
  );
  const next = openPanel(
    {
      ...layout,
      docks: { ...layout.docks, [panel]: dock },
      order: { ...layout.order, [panel]: order + 1 },
    },
    panel,
  );
  if (dock !== 'float' || next.floating[panel]) return next;
  return {
    ...next,
    floating: {
      ...next.floating,
      [panel]: {
        x: 80,
        y: 80,
        width: clampFloatWidth(next.widths[panel]),
        height: clampHeight(next.heights[panel]),
      },
    },
  };
}

export function setWidth(layout: UiLayout, panel: PanelId, width: number): UiLayout {
  return { ...layout, widths: { ...layout.widths, [panel]: clampWidth(panel, width) } };
}

export function setPanelHeight(layout: UiLayout, panel: PanelId, height: number): UiLayout {
  return { ...layout, heights: { ...layout.heights, [panel]: clampHeight(height) } };
}

function clampFloatWidth(width: number): number {
  if (!Number.isFinite(width)) return 360;
  return Math.round(Math.min(Math.max(width, MIN_FLOAT_WIDTH), MAX_FLOAT_WIDTH));
}

function clampFloatBounds(
  bounds: FloatingBounds,
  viewportWidth: number,
  viewportHeight: number,
): FloatingBounds {
  const width = Math.min(clampFloatWidth(bounds.width), Math.max(1, viewportWidth));
  const height = Math.min(clampHeight(bounds.height), Math.max(1, viewportHeight));
  const x = Number.isFinite(bounds.x) ? bounds.x : 0;
  const y = Number.isFinite(bounds.y) ? bounds.y : 0;
  return {
    x: Math.round(Math.min(Math.max(x, 0), Math.max(0, viewportWidth - width))),
    y: Math.round(Math.min(Math.max(y, 0), Math.max(0, viewportHeight - height))),
    width,
    height,
  };
}

export function setFloatingBounds(
  layout: UiLayout,
  panel: PanelId,
  bounds: FloatingBounds,
  viewportWidth = 1440,
  viewportHeight = 900,
): UiLayout {
  return {
    ...layout,
    floating: {
      ...layout.floating,
      [panel]: clampFloatBounds(bounds, viewportWidth, viewportHeight),
    },
  };
}

const MIN_CANVAS_WIDTH = 320;

function fitHorizontalDocks(layout: UiLayout, viewportWidth: number): UiLayout {
  // Implausible metrics (zero-width capture frames, detached windows) say
  // nothing about the user's screen; fitting them would collapse everything.
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return layout;
  let next = layout;
  for (const panel of [...PANELS].reverse()) {
    if (chromeWidth(next) + MIN_CANVAS_WIDTH <= viewportWidth) break;
    const horizontal = next.docks[panel] === 'left' || next.docks[panel] === 'right';
    if (horizontal && next.panels[panel] === 'open') next = togglePanel(next, panel);
  }
  return next;
}
/** Keep every floating panel reachable after viewport changes or corrupt storage. */
export function recoverLayout(
  layout: UiLayout,
  viewportWidth: number,
  viewportHeight: number,
): UiLayout {
  let next = layout;
  for (const panel of PANELS) {
    const bounds = layout.floating[panel];
    if (layout.docks[panel] === 'float' && bounds) {
      next = setFloatingBounds(next, panel, bounds, viewportWidth, viewportHeight);
    }
  }
  return fitHorizontalDocks(next, viewportWidth);
}

export function resetLayout(_layout: UiLayout, viewportWidth?: number): UiLayout {
  return defaultLayout(viewportWidth);
}

export function toggleSection(layout: UiLayout, section: string): UiLayout {
  const open = layout.sections[section] !== false;
  return { ...layout, sections: { ...layout.sections, [section]: !open } };
}

/** WP02: first expanded side panel — the one a narrow viewport shows as a drawer. */
export function drawerPanel(layout: UiLayout): PanelId | null {
  for (const panel of PANELS) {
    const dock = layout.docks[panel];
    if ((dock === 'left' || dock === 'right') && layout.panels[panel] === 'open') return panel;
  }
  return null;
}

/** Closed/floating/bottom panels consume no horizontal canvas chrome. */
export function chromeWidth(layout: UiLayout): number {
  return PANELS.reduce((sum, panel) => {
    if (layout.panels[panel] === 'closed' || ['bottom', 'float'].includes(layout.docks[panel])) return sum;
    return sum + (layout.panels[panel] === 'open' ? layout.widths[panel] : RAIL_WIDTH);
  }, 0);
}

interface RawLayout {
  panels?: Record<string, unknown>;
  widths?: Record<string, unknown>;
  heights?: Record<string, unknown>;
  sections?: unknown;
  docks?: Record<string, unknown>;
  order?: Record<string, unknown>;
  floating?: Record<string, unknown>;
}

/** Migrate v1 settings and normalise corrupt values without throwing. */
export function normaliseLayout(input: unknown, viewportWidth?: number): UiLayout {
  const base = defaultLayout(viewportWidth);
  if (typeof input !== 'object' || input === null) return base;
  const raw = input as RawLayout;
  const widths = normaliseWidths(raw.widths, base.widths);
  const heights = normaliseHeights(raw.heights, base.heights);
  return {
    ...base,
    panels: normalisePanels(raw.panels, base.panels),
    widths,
    heights,
    docks: normaliseDocks(raw.docks, base.docks),
    order: normaliseOrder(raw.order, base.order),
    floating: normaliseFloating(raw.floating, widths, heights),
    sections: normaliseSections(raw.sections, base.sections),
  };
}

function normalisePanels(raw: RawLayout['panels'], base: UiLayout['panels']): UiLayout['panels'] {
  const panels = { ...base };
  for (const panel of PANELS) {
    const mode = raw?.[panel];
    if (mode === 'open' || mode === 'collapsed' || mode === 'closed') panels[panel] = mode;
  }
  return panels;
}

function normaliseWidths(raw: RawLayout['widths'], base: UiLayout['widths']): UiLayout['widths'] {
  const widths = { ...base };
  for (const panel of PANELS) {
    const width = raw?.[panel];
    if (typeof width === 'number') widths[panel] = clampWidth(panel, width);
  }
  return widths;
}

function normaliseHeights(raw: RawLayout['heights'], base: UiLayout['heights']): UiLayout['heights'] {
  const heights = { ...base };
  for (const panel of PANELS) {
    const height = raw?.[panel];
    if (typeof height === 'number') heights[panel] = clampHeight(height);
  }
  return heights;
}

function normaliseDocks(raw: RawLayout['docks'], base: UiLayout['docks']): UiLayout['docks'] {
  const docks = { ...base };
  for (const panel of PANELS) {
    const dock = raw?.[panel];
    if (DOCKS.includes(dock as DockId)) docks[panel] = dock as DockId;
  }
  return docks;
}

function normaliseOrder(raw: RawLayout['order'], base: UiLayout['order']): UiLayout['order'] {
  const order = { ...base };
  for (const panel of PANELS) {
    const rank = raw?.[panel];
    if (typeof rank === 'number' && Number.isFinite(rank)) order[panel] = Math.round(rank);
  }
  return order;
}

function rawBounds(raw: unknown, width: number, height: number): FloatingBounds {
  const value = raw as Record<string, unknown>;
  return {
    x: typeof value.x === 'number' ? value.x : 0,
    y: typeof value.y === 'number' ? value.y : 0,
    width: typeof value.width === 'number' ? value.width : width,
    height: typeof value.height === 'number' ? value.height : height,
  };
}

function normaliseFloating(
  raw: RawLayout['floating'],
  widths: UiLayout['widths'],
  heights: UiLayout['heights'],
): UiLayout['floating'] {
  const floating: UiLayout['floating'] = {};
  for (const panel of PANELS) {
    const bounds = raw?.[panel];
    if (typeof bounds !== 'object' || bounds === null) continue;
    floating[panel] = clampFloatBounds(
      rawBounds(bounds, widths[panel], heights[panel]),
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
  }
  return floating;
}

function normaliseSections(raw: unknown, base: Record<string, boolean>): Record<string, boolean> {
  if (typeof raw !== 'object' || raw === null) return base;
  const sections = { ...base };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') sections[key] = value;
  }
  return sections;
}

export function layoutStyle(layout: UiLayout): Record<string, string> {
  return {
    '--pc-sidebar-w': `${layout.widths.sidebar}px`,
    '--pc-flows-w': `${layout.widths.flows}px`,
    '--pc-palette-w': `${layout.widths.palette}px`,
    '--pc-code-w': `${layout.widths.code}px`,
    '--pc-props-w': `${layout.widths.props}px`,
  };
}
