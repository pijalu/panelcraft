// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderDiagram } from './cliRender';
import './ui/app.css';

const SOURCE = `pcd 1.0
person ada "Ada"
system web "Web"
ada -> web : "calls"
layout saved
position ada (40, 60)
position web (280, 60)
`;

afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

describe('CLI browser renderer (SPEC S6/FR-X)', () => {
  it('renders canonical SVG at the requested width using top-level layout positions', () => {
    const result = renderDiagram(SOURCE, { width: 800, theme: 'light' });
    expect(result.width).toBe(800);
    expect(result.height).toBe(450);
    expect(result.svg).toContain('width="800"');
    expect(result.svg).toContain('height="450"');
    expect(result.svg).toContain('data-id="ada"');
    expect(result.svg).toContain('data-id="web"');
    expect(result.svg).toContain('calls');
    expect(result.svg).toContain('data-cli-render="true"');
    expect(result.svg).not.toContain('<script');
  });

  it('lays out position-free files before fitting the canvas', () => {
    const { svg } = renderDiagram(
      'pcd 1.0\nperson user\ngroup shop {\n  contains api\n}\ncontainer api\nuser -> api : "places order"\n',
      { width: 800, theme: 'dark' },
    );
    const apiPosition = svg.match(/<g[^>]*data-id="api"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/);
    expect(apiPosition).not.toBeNull();
    const group = svg.match(/<g[^>]*data-id="shop"[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/);
    const groupRect = svg.match(/data-id="shop"[^>]*>\s*<rect[^>]*width="([\d.]+)" height="([\d.]+)"/);
    expect(Number(group?.[1])).toBeLessThan(Number(apiPosition?.[1]));
    expect(Number(group?.[2])).toBeLessThan(Number(apiPosition?.[2]));
    expect(Number(groupRect?.[1])).toBeGreaterThan(120);
    expect(Number(groupRect?.[2])).toBeGreaterThan(60);
    expect(svg).toContain('places order');
  });

  it('uses the explicit CLI theme instead of the application root preference', () => {
    const computed = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (element !== document.documentElement) return computed(element, pseudo);
      return {
        getPropertyValue: (name: string) => name === '--pc-bg'
          ? (document.documentElement.dataset.theme === 'dark' ? '#14161a' : '#ffffff')
          : '',
      } as CSSStyleDeclaration;
    });
    document.documentElement.dataset.theme = 'dark';
    const light = renderDiagram(SOURCE, { width: 800, theme: 'light' });
    expect(light.svg).toContain('--pc-bg:#ffffff');
    expect(light.svg).not.toContain('--pc-bg:#14161a');

    document.documentElement.dataset.theme = 'light';
    const dark = renderDiagram(SOURCE, { width: 800, theme: 'dark' });
    expect(dark.svg).toContain('--pc-bg:#14161a');
    expect(document.querySelector('[data-cli-render-root] svg')?.getAttribute('style'))
      .toContain('--pc-bg:#14161a');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('rejects a legacy named view instead of silently rendering another layout', () => {
    expect(() => renderDiagram('pcd 1.0\nview "Old" {\n layout saved\n}\n', {
      width: 800, theme: 'dark',
    })).toThrow(/E117/);
  });

  it('reports parser diagnostics and never returns partial SVG', () => {
    expect(() => renderDiagram('pcd 1.0\nperson broken "B" {\n', {
      width: 800, theme: 'light',
    })).toThrow(/E104/);
  });
});
