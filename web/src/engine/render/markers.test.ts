// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// F-12 marker/line model in the renderer: one marker def per head shape, the
// right marker ends up on each link, line texture and width are applied, and
// the link type drives the colour hint.

import { describe, expect, it, beforeEach } from 'vitest';
import { SceneRenderer, MARKER_SHAPES, type SceneLink } from './scenegraph';

const SVG_NS = 'http://www.w3.org/2000/svg';
let svg: SVGSVGElement;
let renderer: SceneRenderer;

const link = (over: Partial<SceneLink> = {}): SceneLink => ({
  id: 'L1',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  ...over,
});

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  document.body.appendChild(svg);
  renderer = new SceneRenderer(svg);
});

describe('markers (F-12)', () => {
  it('defines one marker per head shape', () => {
    for (const shape of MARKER_SHAPES) {
      if (shape === 'none') continue;
      expect(svg.querySelector(`marker#pc-marker-${shape}`), shape).not.toBeNull();
    }
  });

  it('defaults to an arrow head and no tail', () => {
    renderer.render({ objects: [], links: [link()] });
    const path = svg.querySelector('.pc-route')!;
    expect(path.getAttribute('marker-end')).toBe('url(#pc-marker-arrow)');
    expect(path.getAttribute('marker-start')).toBe('none');
  });

  it('selects the marker per link (diamond head, circle tail)', () => {
    renderer.render({ objects: [], links: [link({ head: 'diamond', tail: 'circle' })] });
    const path = svg.querySelector('.pc-route')!;
    expect(path.getAttribute('marker-end')).toBe('url(#pc-marker-diamond)');
    expect(path.getAttribute('marker-start')).toBe('url(#pc-marker-circle)');
  });

  it('applies the line texture and stroke width', () => {
    renderer.render({ objects: [], links: [link({ line: 'dotted', width: 3 })] });
    const g = svg.querySelector('.pc-link')!;
    expect(g.classList.contains('pc-dotted')).toBe(true);
    expect(g.classList.contains('pc-dashed')).toBe(false);
    expect(svg.querySelector('.pc-route')!.getAttribute('stroke-width')).toBe('3');
  });

  it('marks the link type for the colour hint', () => {
    renderer.render({ objects: [], links: [link({ type: 'requests' })] });
    expect(svg.querySelector('.pc-link')!.getAttribute('data-link-type')).toBe('requests');
  });

  it('re-renders when only the marker model changes', () => {
    renderer.render({ objects: [], links: [link()] });
    renderer.render({ objects: [], links: [link({ head: 'square' })] });
    expect(svg.querySelector('.pc-route')!.getAttribute('marker-end')).toBe('url(#pc-marker-square)');
    expect(svg.querySelectorAll('.pc-route')).toHaveLength(1);
  });
});
