// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Scene renderer tests (M2-WP2): layers, stable ids, diff-patch stats,
// re-render count assertions (WP2 acceptance), selection toggling.
import { describe, it, expect, beforeEach } from 'vitest';
import { SceneRenderer, pointsToPath, structuralKey, type Scene } from './scenegraph';
import type { SceneObject } from './shapes';

const SVG_NS = 'http://www.w3.org/2000/svg';

const obj = (id: string, over: Partial<SceneObject> = {}): SceneObject => ({
  id,
  kind: 'system',
  x: 0,
  y: 0,
  w: 120,
  h: 60,
  name: id,
  ...over,
});

const scene = (objects: SceneObject[], links: Scene['links'] = []): Scene => ({
  objects,
  links,
});

let svg: SVGSVGElement;
let r: SceneRenderer;

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  r = new SceneRenderer(svg);
});

const poly = [{ x: 120, y: 30 }, { x: 200, y: 30 }];

describe('renderer scaffolding', () => {
  it('creates defs + world wrapper + three layers in order', () => {
    const classes = [...svg.children].map((c) => c.getAttribute('class'));
    expect(classes).toEqual([null, 'pc-world']); // defs, world
    const world = svg.querySelector('.pc-world') as SVGGElement;
    const worldChildren = [...world.children].map((c) => c.getAttribute('class'));
    expect(worldChildren).toEqual([
      'pc-grid', // hidden by default
      'pc-layer pc-layer-links',
      'pc-layer pc-layer-objects',
      'pc-layer pc-layer-overlay',
    ]);
  });

  it('world transform applies viewport (translate+scale)', () => {
    const world = svg.querySelector('.pc-world') as SVGGElement;
    r.setWorldTransform({ x: 12, y: -4, k: 1.5 });
    expect(world.getAttribute('transform')).toBe('translate(12 -4) scale(1.5)');
  });

  it('grid toggles visibility (FR-C2)', () => {
    const grid = svg.querySelector('.pc-grid') as SVGRectElement;
    expect(grid.getAttribute('display')).toBe('none');
    r.setGrid(true);
    expect(grid.getAttribute('display')).toBe('');
    expect(svg.querySelector('#pc-grid-pattern')).not.toBeNull();
  });

  it('creates the shared arrowhead marker def', () => {
    const marker = svg.querySelector('marker#pc-marker-arrow');
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute('orient')).toBe('auto-start-reverse');
  });

  it('clears any pre-existing svg content', () => {
    const other = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    other.appendChild(document.createElementNS(SVG_NS, 'g'));
    new SceneRenderer(other);
    expect(other.querySelectorAll('g.pc-layer')).toHaveLength(3);
  });
});

describe('diff-patch (re-render count assertions)', () => {
  it('initial render creates all nodes', () => {
    const stats = r.render(scene([obj('a'), obj('b')]));
    expect(stats).toEqual({ created: 2, updated: 0, removed: 0, reordered: false });
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(2);
  });

  it('identical re-render touches nothing (0 ops)', () => {
    const s = scene([obj('a'), obj('b')]);
    r.render(s);
    const stats = r.render(scene([obj('a'), obj('b')]));
    expect(stats).toEqual({ created: 0, updated: 0, removed: 0, reordered: false });
  });

  it('move-only change updates transform, keeps the same DOM node', () => {
    r.render(scene([obj('a')]));
    const before = r.elementFor('a');
    const stats = r.render(scene([obj('a', { x: 40, y: 24 })]));
    expect(stats).toEqual({ created: 0, updated: 1, removed: 0, reordered: false });
    const after = r.elementFor('a');
    expect(after).toBe(before); // stable identity (drag path)
    expect(after?.getAttribute('transform')).toBe('translate(40 24)');
  });

  it('structural change rebuilds children in the same <g>', () => {
    r.render(scene([obj('a', { kind: 'system' })]));
    const before = r.elementFor('a');
    r.render(scene([obj('a', { kind: 'datastore' })]));
    const after = r.elementFor('a');
    expect(after).toBe(before);
    expect(after?.getAttribute('class')).toContain('pc-kind-datastore');
    expect(after?.querySelector('path')).not.toBeNull(); // cylinder glyph
  });

  it('removes deleted objects', () => {
    r.render(scene([obj('a'), obj('b')]));
    const stats = r.render(scene([obj('a')]));
    expect(stats.removed).toBe(1);
    expect(r.elementFor('b')).toBeUndefined();
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(1);
  });

  it('z-order change re-appends in scene order without recreate', () => {
    r.render(scene([obj('a'), obj('b'), obj('c')]));
    const layer = svg.querySelector('.pc-layer-objects') as SVGGElement;
    const order1 = [...layer.children].map((c) => c.getAttribute('data-id'));
    expect(order1).toEqual(['a', 'b', 'c']);
    const stats = r.render(scene([obj('c'), obj('a'), obj('b')]));
    expect(stats.reordered).toBe(true);
    expect(stats.created).toBe(0);
    const order2 = [...layer.children].map((c) => c.getAttribute('data-id'));
    expect(order2).toEqual(['c', 'a', 'b']);
  });

  it('sorts explicit z while keeping links in their lower layer', () => {
    r.render(scene([
      obj('auto'), obj('front', { z: 2 }), obj('back', { z: -1 }), obj('tied', { z: 2 }),
    ], [{ id: 'L1', points: poly }]));
    const order = [...svg.querySelectorAll('.pc-layer-objects .pc-obj')].map((el) => el.getAttribute('data-id'));
    expect(order).toEqual(['back', 'auto', 'front', 'tied']);
    const layers = [...svg.querySelector('.pc-world')!.children].map((el) => el.getAttribute('class'));
    expect(layers.indexOf('pc-layer pc-layer-links')).toBeLessThan(layers.indexOf('pc-layer pc-layer-objects'));
  });

  it('equal scene after move reports no reorder', () => {
    r.render(scene([obj('a'), obj('b')]));
    const stats = r.render(scene([obj('b', { x: 10 }), obj('a')]));
    expect(stats.reordered).toBe(true); // order changed b,a
    const stats2 = r.render(scene([obj('b', { x: 10 }), obj('a')]));
    expect(stats2.reordered).toBe(false);
    expect(stats2.created + stats2.updated + stats2.removed).toBe(0);
  });
});

describe('links', () => {
  const poly = [
    { x: 120, y: 30 },
    { x: 200, y: 30 },
  ];

  it('creates path with d + arrow marker + optional label', () => {
    r.render(scene([obj('a')], [{ id: 'l1', points: poly, label: 'uses' }]));
    const path = svg.querySelector('.pc-route');
    expect(path?.getAttribute('d')).toBe('M 120 30 L 200 30');
    expect(path?.getAttribute('marker-end')).toBe('url(#pc-marker-arrow)');
    const label = svg.querySelector('.pc-link-label');
    expect(label?.textContent).toBe('uses');
    // label anchored at longest-segment midpoint
    expect(label?.getAttribute('x')).toBe('160');
  });

  it('route change updates d in place (same node)', () => {
    r.render(scene([], [{ id: 'l1', points: poly }]));
    const before = svg.querySelector('g.pc-link');
    const stats = r.render(
      scene([], [{ id: 'l1', points: [{ x: 120, y: 30 }, { x: 200, y: 80 }] }]),
    );
    expect(stats.updated).toBe(1);
    expect(svg.querySelector('g.pc-link')).toBe(before);
    expect(svg.querySelector('.pc-route')?.getAttribute('d')).toBe('M 120 30 L 200 80');
  });

  it('renders curved routes and updates when only the route mode changes', () => {
    r.render(scene([], [{ id: 'l1', points: poly }]));
    const before = svg.querySelector('g.pc-link');
    const stats = r.render(scene([], [{ id: 'l1', points: poly, route: 'curved' }]));
    expect(stats.updated).toBe(1);
    expect(svg.querySelector('g.pc-link')).toBe(before);
    expect(svg.querySelector('.pc-route')?.getAttribute('d')).toContain(' C ');
    expect(svg.querySelector('.pc-route')?.getAttribute('d')).not.toContain(' L ');
  });

  it('adds a label to a label-less link rebuilds the node', () => {
    r.render(scene([], [{ id: 'l1', points: poly }]));
    expect(svg.querySelector('.pc-link-label')).toBeNull();
    const stats = r.render(scene([], [{ id: 'l1', points: poly, label: 'x' }]));
    expect(stats.updated).toBe(1);
    expect(svg.querySelector('.pc-link-label')?.textContent).toBe('x');
  });

  it('dashed flag toggles class without rebuild', () => {
    r.render(scene([], [{ id: 'l1', points: poly }]));
    const before = svg.querySelector('g.pc-link');
    r.render(scene([], [{ id: 'l1', points: poly, dashed: true }]));
    expect(svg.querySelector('g.pc-link')).toBe(before);
    expect(before?.classList.contains('pc-dashed')).toBe(true);
    r.render(scene([], [{ id: 'l1', points: poly }]));
    expect(before?.classList.contains('pc-dashed')).toBe(false);
  });

  it('removes deleted links', () => {
    r.render(scene([], [{ id: 'l1', points: poly }]));
    const stats = r.render(scene([]));
    expect(stats.removed).toBe(1);
    expect(svg.querySelectorAll('g.pc-link')).toHaveLength(0);
  });
});

describe('selection (FR-C4 visual)', () => {
  it('setSelection toggles pc-selected only on listed ids (links too)', () => {
    r.render(scene([obj('a'), obj('b')], [{ id: 'l1', points: poly }]));
    r.setSelection(['a'], ['l1']);
    expect(r.elementFor('a')?.classList.contains('pc-selected')).toBe(true);
    expect(r.elementFor('b')?.classList.contains('pc-selected')).toBe(false);
    expect(svg.querySelector('g.pc-link')?.classList.contains('pc-link-selected')).toBe(true);
    r.setSelection([], []);
    expect(r.elementFor('a')?.classList.contains('pc-selected')).toBe(false);
    expect(svg.querySelector('g.pc-link')?.classList.contains('pc-link-selected')).toBe(false);
  });

  it('selection survives structural rebuilds', () => {
    r.render(scene([obj('a')]));
    r.setSelection(['a']);
    r.render(scene([obj('a', { kind: 'note' })]));
    // structural rebuild preserves the <g> and selection state must persist
    expect(r.elementFor('a')?.classList.contains('pc-selected')).toBe(true);
  });

  it('setFade toggles pc-faded on objects + links and survives re-renders (M6 FR-V1)', () => {
    r.render(scene([obj('a'), obj('b')], [{ id: 'l1', points: poly }]));
    r.setFade(['a'], ['l1']);
    expect(r.elementFor('a')?.classList.contains('pc-faded')).toBe(true);
    expect(r.elementFor('b')?.classList.contains('pc-faded')).toBe(false);
    expect(svg.querySelector('g.pc-link')?.classList.contains('pc-faded')).toBe(true);
    // fade state survives a patch pass (rebuild resets class attributes)
    r.render(scene([obj('a', { name: 'renamed' }), obj('b')], [{ id: 'l1', points: poly }]));
    expect(r.elementFor('a')?.classList.contains('pc-faded')).toBe(true);
    // clearing works
    r.setFade([], []);
    expect(r.elementFor('a')?.classList.contains('pc-faded')).toBe(false);
    // new elements created while faded get the class applied on render
    r.setFade(['new'], []);
    r.render(scene([obj('a'), obj('new')]));
    expect(r.elementFor('new')?.classList.contains('pc-faded')).toBe(true);
  });
});

describe('pointsToPath + structuralKey', () => {
  it('pointsToPath renders M/L commands', () => {
    expect(pointsToPath([])).toBe('');
    expect(pointsToPath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('M 1 2 L 3 4');
  });

  it('structuralKey ignores position, includes kind/size/name/dashed', () => {
    const base = obj('a');
    expect(structuralKey(base)).toBe(structuralKey(obj('a', { x: 9, y: 9 })));
    expect(structuralKey(base)).not.toBe(structuralKey(obj('a', { w: 121 })));
    expect(structuralKey(base)).not.toBe(structuralKey(obj('a', { name: 'z' })));
    expect(structuralKey(base)).not.toBe(structuralKey(obj('a', { dashed: true })));
  });
});
