// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderDiagram } from './cliRender';

const SOURCE = `pcd 1.0
person ada "Ada"
system web "Web"
ada -> web : "calls"
view "Default" {
  layout saved
  position ada (1000, 1000)
  position web (1000, 1000)
}
view "Detail" {
  layout saved
  position ada (40, 60)
  position web (280, 60)
}
`;

afterEach(() => {
  document.body.textContent = '';
});

describe('CLI browser renderer (SPEC S6/FR-X)', () => {
  it('renders canonical SVG at the requested width and selected view', () => {
    const result = renderDiagram(SOURCE, { width: 800, theme: 'light', view: 'Detail' });
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

  it('lays out position-free C4 views before fitting the canvas', () => {
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

  it('rejects an unknown view instead of silently rendering another one', () => {
    expect(() => renderDiagram(SOURCE, { width: 800, theme: 'dark', view: 'Missing' })).toThrow(
      'view "Missing" not found',
    );
  });

  it('reports parser diagnostics and never returns partial SVG', () => {
    expect(() => renderDiagram('pcd 1.0\nperson broken "B" {\n', {
      width: 800,
      theme: 'light',
    })).toThrow(/E104/);
  });
});
