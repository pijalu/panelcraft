// SPDX-License-Identifier: GPL-3.0-only
// F-10 shell layout model: defaults, toggles, width clamps, storage
// normalisation and the CSS bridge. Pure functions — no DOM.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WIDTHS, NARROW_VIEWPORT, RAIL_WIDTH, chromeWidth, clampWidth, defaultLayout,
  drawerPanel, layoutStyle, normaliseLayout, openPanel, setWidth, togglePanel, toggleSection, type UiLayout,
} from './uiLayout';

describe('defaultLayout (F-10)', () => {
  it('opens editable Code beside the canvas and keeps secondary panels as rails', () => {
    const l = defaultLayout(1600);
    expect(Object.values(l.panels)).toEqual(['collapsed', 'collapsed', 'collapsed', 'open', 'collapsed']);
    expect(l.widths).toEqual(DEFAULT_WIDTHS);
  });

  it('uses the visible-Code default at every viewport before responsive recovery', () => {
    expect(defaultLayout(NARROW_VIEWPORT - 1).panels.code).toBe('open');
    expect(defaultLayout(NARROW_VIEWPORT).panels.code).toBe('open');
  });
});

describe('togglePanel', () => {
  it('flips only the target panel', () => {
    const start = openPanel(openPanel(defaultLayout(1600), 'sidebar'), 'palette');
    const l = togglePanel(start, 'sidebar');
    expect(l.panels.sidebar).toBe('collapsed');
    expect(l.panels.palette).toBe('open');
    expect(l.panels.code).toBe('open');
    expect(l.panels.props).toBe('collapsed');
  });

  it('is its own inverse', () => {
    const once = togglePanel(openPanel(defaultLayout(1600), 'props'), 'props');
    expect(togglePanel(once, 'props').panels.props).toBe('open');
  });
});

describe('setWidth / clampWidth', () => {
  it('clamps to the panel limits', () => {
    expect(clampWidth('sidebar', 10)).toBe(160);
    expect(clampWidth('sidebar', 9999)).toBe(420);
    expect(clampWidth('code', 500)).toBe(500);
  });

  it('falls back to the default for a non-finite width', () => {
    expect(clampWidth('code', Number.NaN)).toBe(DEFAULT_WIDTHS.code);
  });

  it('writes the clamped width and leaves others alone', () => {
    const l = setWidth(defaultLayout(1600), 'props', 1000);
    expect(l.widths.props).toBe(420);
    expect(l.widths.sidebar).toBe(DEFAULT_WIDTHS.sidebar);
  });
});

describe('toggleSection (F-11 state)', () => {
  it('flips a section and defaults unknown ones to open', () => {
    const l = defaultLayout(1600);
    expect(l.sections.advanced).toBe(false);
    expect(toggleSection(l, 'identity').sections.identity).toBe(false);
    expect(toggleSection(l, 'brand-new').sections['brand-new']).toBe(false);
  });
});

describe('chromeWidth', () => {
  it('sums open widths plus rails for collapsed panels', () => {
    const open = (['sidebar', 'flows', 'palette', 'code', 'props'] as const).reduce(
      (layout, panel) => openPanel(layout, panel),
      defaultLayout(1600),
    );
    const total = DEFAULT_WIDTHS.sidebar + DEFAULT_WIDTHS.flows + DEFAULT_WIDTHS.palette
      + DEFAULT_WIDTHS.code + DEFAULT_WIDTHS.props;
    expect(chromeWidth(open)).toBe(total);
    const collapsed = togglePanel(open, 'props');
    expect(chromeWidth(collapsed)).toBe(total - DEFAULT_WIDTHS.props + RAIL_WIDTH);
  });
});

describe('normaliseLayout', () => {
  it('returns defaults for junk', () => {
    expect(normaliseLayout(null, 1600)).toEqual(defaultLayout(1600));
    expect(normaliseLayout('nope', 1600)).toEqual(defaultLayout(1600));
    expect(normaliseLayout({}, 1600)).toEqual(defaultLayout(1600));
    expect(normaliseLayout({}, 1600).panels.code).toBe('open');
  });

  it('preserves explicit single-pane choices instead of applying the new default', () => {
    for (const mode of ['collapsed', 'closed'] as const) {
      expect(normaliseLayout({ panels: { code: mode } }, 1600).panels.code).toBe(mode);
    }
  });

  it('keeps valid values, drops invalid ones and clamps widths', () => {
    const l = normaliseLayout(
      {
        panels: { sidebar: 'collapsed', palette: 'sideways', code: 'open' },
        widths: { sidebar: 5, code: 480, props: 'wide' },
        sections: { identity: false, metadata: 'yes' },
      },
      1600,
    );
    expect(l.panels.sidebar).toBe('collapsed');
    expect(l.panels.palette).toBe('collapsed'); // invalid mode → default
    expect(l.widths.sidebar).toBe(160); // clamped
    expect(l.widths.code).toBe(480);
    expect(l.widths.props).toBe(DEFAULT_WIDTHS.props);
    expect(l.sections.identity).toBe(false);
    expect(l.sections.metadata).toBe(true); // non-boolean dropped
  });

  it('survives a round-trip through JSON', () => {
    const l: UiLayout = togglePanel(setWidth(defaultLayout(1600), 'sidebar', 300), 'code');
    expect(normaliseLayout(JSON.parse(JSON.stringify(l)), 1600)).toEqual(l);
  });
});

describe('drawerPanel (UX08-WP02)', () => {
  // Code is open by default; these cases are about which of several open
  // panels wins, so start from the default with Code collapsed again.
  const noCode = togglePanel(defaultLayout(1600), 'code');

  it('picks the first expanded side-docked panel', () => {
    expect(drawerPanel(defaultLayout(1600))).toBe('code');
    const palette = openPanel(noCode, 'palette');
    expect(drawerPanel(palette)).toBe('palette');
    const onlyProps = openPanel(togglePanel(palette, 'palette'), 'props');
    expect(drawerPanel(onlyProps)).toBe('props');
  });

  it('ignores collapsed, closed, floating and bottom panels', () => {
    const collapsed = togglePanel(openPanel(noCode, 'palette'), 'palette');
    expect(collapsed.panels.palette).toBe('collapsed');
    expect(drawerPanel(collapsed)).toBeNull();
    expect(drawerPanel({ ...collapsed, docks: { ...collapsed.docks, palette: 'bottom' } })).toBeNull();
    expect(drawerPanel({ ...collapsed, docks: { ...collapsed.docks, palette: 'float' } })).toBeNull();
  });
});

describe('layoutStyle', () => {
  it('maps widths to the shell CSS variables', () => {
    const style = layoutStyle(setWidth(defaultLayout(1600), 'code', 400));
    expect(style['--pc-code-w']).toBe('400px');
    expect(style['--pc-sidebar-w']).toBe(`${DEFAULT_WIDTHS.sidebar}px`);
  });
});
