// SPDX-License-Identifier: GPL-3.0-only
// UI layout model (F-10; review §3.1 items 1-3): which panels are open, how
// wide they are, and which properties sections are expanded.
//
// Pure data + pure functions so the whole layout is unit-testable; the hook
// (useUiLayout) owns persistence and the keyboard shortcuts. Layouts are stored
// with the workspace record (StoredWorkspace.settings) so they survive reloads
// and travel with a workspace export — never in the document.

export type PanelId = 'sidebar' | 'palette' | 'code' | 'props';
export type PanelMode = 'open' | 'collapsed';

export const PANELS: readonly PanelId[] = ['sidebar', 'palette', 'code', 'props'];

export interface UiLayout {
  panels: Record<PanelId, PanelMode>;
  widths: Record<PanelId, number>;
  /** F-11: expanded/collapsed state per properties section. */
  sections: Record<string, boolean>;
}

/** Width limits per panel (px). The canvas keeps whatever is left. */
export const WIDTH_LIMITS: Record<PanelId, { min: number; max: number }> = {
  sidebar: { min: 160, max: 420 },
  palette: { min: 120, max: 320 },
  code: { min: 260, max: 720 },
  props: { min: 200, max: 420 },
};

/** Width of a collapsed panel's rail (the affordance never disappears). */
export const RAIL_WIDTH = 36;

/** Below this viewport the code pane starts collapsed (canvas-first layout). */
export const NARROW_VIEWPORT = 1440;

export const DEFAULT_WIDTHS: Record<PanelId, number> = {
  sidebar: 200,
  palette: 168,
  code: 360,
  props: 232,
};

export const DEFAULT_SECTIONS: Record<string, boolean> = {
  identity: true,
  metadata: true,
  style: true,
  advanced: false,
};

/** Default layout for a viewport width (code collapses below 1440 px). */
export function defaultLayout(viewportWidth = Number.POSITIVE_INFINITY): UiLayout {
  return {
    panels: {
      sidebar: 'open',
      palette: 'open',
      code: viewportWidth < NARROW_VIEWPORT ? 'collapsed' : 'open',
      props: 'open',
    },
    widths: { ...DEFAULT_WIDTHS },
    sections: { ...DEFAULT_SECTIONS },
  };
}

/** Clamp one panel width into its allowed range. */
export function clampWidth(panel: PanelId, width: number): number {
  const { min, max } = WIDTH_LIMITS[panel];
  if (!Number.isFinite(width)) return DEFAULT_WIDTHS[panel];
  return Math.round(Math.min(Math.max(width, min), max));
}

/** Toggle one panel open/collapsed, leaving every other panel untouched. */
export function togglePanel(layout: UiLayout, panel: PanelId): UiLayout {
  const next: PanelMode = layout.panels[panel] === 'open' ? 'collapsed' : 'open';
  return { ...layout, panels: { ...layout.panels, [panel]: next } };
}

/** Set one panel width (clamped). */
export function setWidth(layout: UiLayout, panel: PanelId, width: number): UiLayout {
  return { ...layout, widths: { ...layout.widths, [panel]: clampWidth(panel, width) } };
}

/** Toggle a properties section. */
export function toggleSection(layout: UiLayout, section: string): UiLayout {
  const open = layout.sections[section] !== false;
  return { ...layout, sections: { ...layout.sections, [section]: !open } };
}

/** Total width occupied by chrome (open panels + rails for collapsed ones). */
export function chromeWidth(layout: UiLayout): number {
  return PANELS.reduce(
    (sum, panel) =>
      sum + (layout.panels[panel] === 'open' ? layout.widths[panel] : RAIL_WIDTH),
    0,
  );
}

/**
 * Normalise a value read from storage (or an older record): unknown keys are
 * dropped, missing keys fall back to the default for this viewport, and every
 * width is clamped. Never throws — a corrupt layout must not block the app.
 */
export function normaliseLayout(input: unknown, viewportWidth?: number): UiLayout {
  const base = defaultLayout(viewportWidth);
  if (typeof input !== 'object' || input === null) return base;
  const raw = input as { panels?: Record<string, unknown>; widths?: Record<string, unknown>; sections?: unknown };
  return {
    panels: normalisePanels(raw.panels, base.panels),
    widths: normaliseWidths(raw.widths, base.widths),
    sections: normaliseSections(raw.sections, base.sections),
  };
}

function normalisePanels(raw: Record<string, unknown> | undefined, base: UiLayout['panels']): UiLayout['panels'] {
  const panels = { ...base };
  for (const panel of PANELS) {
    const mode = raw?.[panel];
    if (mode === 'open' || mode === 'collapsed') panels[panel] = mode;
  }
  return panels;
}

function normaliseWidths(raw: Record<string, unknown> | undefined, base: UiLayout['widths']): UiLayout['widths'] {
  const widths = { ...base };
  for (const panel of PANELS) {
    const width = raw?.[panel];
    if (typeof width === 'number') widths[panel] = clampWidth(panel, width);
  }
  return widths;
}

function normaliseSections(raw: unknown, base: Record<string, boolean>): Record<string, boolean> {
  if (typeof raw !== 'object' || raw === null) return base;
  const sections = { ...base };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') sections[key] = value;
  }
  return sections;
}

/** CSS custom properties for the shell (one place maps layout → style). */
export function layoutStyle(layout: UiLayout): Record<string, string> {
  return {
    '--pc-sidebar-w': `${layout.widths.sidebar}px`,
    '--pc-palette-w': `${layout.widths.palette}px`,
    '--pc-code-w': `${layout.widths.code}px`,
    '--pc-props-w': `${layout.widths.props}px`,
  };
}
