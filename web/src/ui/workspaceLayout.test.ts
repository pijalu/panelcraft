// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
  closePanel,
  defaultLayout,
  movePanel,
  normaliseLayout,
  openPanel,
  recoverLayout,
  resetLayout,
  setFloatingBounds,
  setPanelHeight,
  togglePanel,
} from './uiLayout';

describe('UX-02 workspace layout', () => {
  it('starts canvas-first with only Shapes open', () => {
    const layout = defaultLayout(1600);
    expect(layout.version).toBe(2);
    expect(layout.panels).toEqual({
      sidebar: 'collapsed',
      flows: 'closed',
      palette: 'open',
      code: 'collapsed',
      props: 'collapsed',
    });
  });

  it('distinguishes collapse, close, and accessible reopening', () => {
    const start = defaultLayout(1600);
    const collapsed = togglePanel(start, 'palette');
    expect(collapsed.panels.palette).toBe('collapsed');
    const closed = closePanel(collapsed, 'palette');
    expect(closed.panels.palette).toBe('closed');
    expect(openPanel(closed, 'palette').panels.palette).toBe('open');
  });

  it('moves each panel to every dock and opens it without losing its size', () => {
    let layout = defaultLayout(1600);
    for (const panel of ['sidebar', 'flows', 'palette', 'code', 'props'] as const) {
      for (const dock of ['left', 'right', 'bottom', 'float'] as const) {
        layout = movePanel(layout, panel, dock);
        expect(layout.docks[panel]).toBe(dock);
        expect(layout.panels[panel]).toBe('open');
        expect(layout.widths[panel]).toBeGreaterThan(0);
      }
    }
  });

  it('clamps floating bounds to the viewport and recovers off-screen panels', () => {
    const start = movePanel(defaultLayout(1440), 'code', 'float');
    const moved = setFloatingBounds(start, 'code', { x: 1200, y: 800, width: 900, height: 700 });
    expect(moved.floating.code).toEqual({ x: 1020, y: 340, width: 420, height: 560 });
    const offscreen = setFloatingBounds(start, 'code', { x: 40, y: 40, width: 360, height: 300 });
    const recovered = recoverLayout(
      { ...offscreen, floating: { code: { x: -500, y: 900, width: 360, height: 300 } } },
      1024,
      768,
    );
    expect(recovered.floating.code).toEqual({ x: 0, y: 468, width: 360, height: 300 });
  });

  it('supports resizable bottom docks and deterministic reset', () => {
    const start = movePanel(defaultLayout(1440), 'sidebar', 'bottom');
    const resized = setPanelHeight(start, 'sidebar', 9999);
    expect(resized.heights.sidebar).toBe(560);
    expect(resetLayout(resized, 1440)).toEqual(defaultLayout(1440));
  });

    it('collapses horizontal docks as needed to keep a narrow canvas reachable', () => {
      let layout = defaultLayout(1600);
      for (const panel of ['sidebar', 'flows', 'palette', 'code', 'props'] as const) {
        layout = openPanel(layout, panel);
      }
      const recovered = recoverLayout(layout, 520, 640);
      expect(Object.values(recovered.panels)).toEqual([
        'collapsed', 'collapsed', 'collapsed', 'collapsed', 'collapsed',
      ]);
      expect(recovered.docks).toEqual(layout.docks);
    });
  it('keeps Files independent from an initially closed Flow Steps panel', () => {
    const start = defaultLayout(1600);
    expect(start.panels.sidebar).toBe('collapsed');
    expect(start.panels.flows).toBe('closed');

    const both = openPanel(openPanel(start, 'sidebar'), 'flows');
    expect(both.panels.sidebar).toBe('open');
    expect(both.panels.flows).toBe('open');
    expect(closePanel(both, 'sidebar').panels.flows).toBe('open');
    expect(normaliseLayout({ panels: { sidebar: 'open' } }, 1600).panels.flows).toBe('closed');
  });

  it('migrates old settings and safely normalises corrupt docking data', () => {
    const old = {
      panels: { sidebar: 'open', palette: 'open', code: 'open', props: 'open' },
      widths: { sidebar: 240, palette: 168, code: 360, props: 232 },
      sections: { identity: false },
    };
    const migrated = normaliseLayout(old, 1600);
    expect(migrated.version).toBe(2);
    expect(migrated.panels.sidebar).toBe('open');
    expect(migrated.docks.sidebar).toBe('left');
    expect(migrated.sections.identity).toBe(false);

    const corrupt = normaliseLayout(
      {
        version: 2,
        panels: { code: 'closed' },
        docks: { code: 'somewhere', props: 'bottom' },
        floating: { props: { x: Number.NaN, y: -20, width: -1, height: 200 } },
        heights: { props: -100 },
      },
      1600,
    );
    expect(corrupt.docks.code).toBe('right');
    expect(corrupt.docks.props).toBe('bottom');
    expect(corrupt.panels.code).toBe('closed');
    expect(corrupt.heights.props).toBe(160);
  });
});
