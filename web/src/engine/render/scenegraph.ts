// SPDX-License-Identifier: GPL-3.0-only
// Scene graph → SVG renderer (M2-WP2): layers (links/objects/overlay),
// diff-patch updates, stable id→DOM map. DOM writes go through this module
// only; the canvas controller holds scene state and calls render() per frame.
//
// Diff contract (perf, N1):
// - unchanged object (same kind/w/h/name/dashed) → touch nothing
// - move-only change (x/y) → update the group's transform attribute (drag path)
// - structural change → rebuild the group's children in place (same <g> node:
//   stable identity for hit-testing, rebuild cost bounded by glyph size)
// - links: path d + label repositioned in place
// - removals/order changes → remove nodes / re-append in z order

import { shapeGlyphs, type ElSpec, type SceneObject } from './shapes';
import { labelPoint, type Polyline } from './router';
import { GRID_SIZE } from './snap';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SceneLink {
  id: string;
  points: Polyline;
  label?: string;
  dashed?: boolean;
}

export interface Scene {
  objects: SceneObject[];
  links: SceneLink[];
}

export interface PatchStats {
  created: number;
  updated: number;
  removed: number;
  reordered: boolean;
}

interface ObjEntry {
  el: SVGGElement;
  obj: SceneObject;
}

interface LinkEntry {
  el: SVGGElement;
  path: SVGPathElement;
  label: SVGTextElement | null;
  link: SceneLink;
}

export function structuralKey(o: SceneObject): string {
  return [o.kind, o.w, o.h, o.name ?? '', o.dashed ? 1 : 0].join('|');
}

function structuralKeyLink(l: SceneLink): string {
  return l.label === undefined ? 'nolabel' : 'label';
}

function polylineKey(points: Polyline): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

export class SceneRenderer {
  private svg: SVGSVGElement;
  private objectsLayer: SVGGElement;
  private linksLayer: SVGGElement;
  private overlayLayer: SVGGElement;
  /** World wrapper — carries the viewport transform (canvas ⇄ screen). */
  private worldEl: SVGGElement;
  private gridRect: SVGRectElement;
  private objEntries = new Map<string, ObjEntry>();
  private linkEntries = new Map<string, LinkEntry>();
  /** Object id order as of last render — detects z-order changes. */
  private lastOrder = '';
  /** Selection survives rebuilds: reapplied after each patch. */
  private selectedIds = new Set<string>();
  private selectedLinkIds = new Set<string>();

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.svg.textContent = '';
    this.svg.appendChild(this.makeDefs());
    this.worldEl = this.el('g') as SVGGElement;
    this.worldEl.setAttribute('class', 'pc-world');
    this.svg.appendChild(this.worldEl);
    this.gridRect = this.makeGrid();
    this.linksLayer = this.makeLayer('pc-layer-links');
    this.objectsLayer = this.makeLayer('pc-layer-objects');
    this.overlayLayer = this.makeLayer('pc-layer-overlay');
  }

  /** Overlay layer (guides, rubber band, halos) — painted by the controller. */
  get overlay(): SVGGElement {
    return this.overlayLayer;
  }

  /** Apply the viewport transform to the world wrapper (WP1 wiring). */
  setWorldTransform(t: { x: number; y: number; k: number }): void {
    this.worldEl.setAttribute('transform', `translate(${t.x} ${t.y}) scale(${t.k})`);
  }

  /** Grid toggle (FR-C2). The grid lives in world space, so it pans/zooms. */
  setGrid(on: boolean): void {
    this.gridRect.setAttribute('display', on ? '' : 'none');
  }

  private makeGrid(): SVGRectElement {
    const defs = this.svg.querySelector('defs') as SVGDefsElement;
    const pattern = this.el('pattern') as SVGPatternElement;
    pattern.setAttribute('id', 'pc-grid-pattern');
    pattern.setAttribute('width', String(GRID_SIZE));
    pattern.setAttribute('height', String(GRID_SIZE));
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const dot = this.el('circle') as SVGCircleElement;
    dot.setAttribute('cx', '0.5');
    dot.setAttribute('cy', '0.5');
    dot.setAttribute('r', '0.5');
    dot.setAttribute('class', 'pc-grid-dot');
    pattern.appendChild(dot);
    defs.appendChild(pattern);
    const rect = this.el('rect') as SVGRectElement;
    rect.setAttribute('class', 'pc-grid');
    rect.setAttribute('x', '-100000');
    rect.setAttribute('y', '-100000');
    rect.setAttribute('width', '200000');
    rect.setAttribute('height', '200000');
    rect.setAttribute('fill', 'url(#pc-grid-pattern)');
    rect.setAttribute('display', 'none');
    this.worldEl.appendChild(rect);
    return rect;
  }

  private makeLayer(name: string): SVGGElement {
    const g = this.el('g') as SVGGElement;
    g.setAttribute('class', `pc-layer ${name}`);
    this.worldEl.appendChild(g);
    return g;
  }

  private makeDefs(): SVGDefsElement {
    const defs = this.el('defs') as SVGDefsElement;
    const marker = this.el('marker') as SVGMarkerElement;
    marker.setAttribute('id', 'pc-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');
    const path = this.el('path') as SVGPathElement;
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('class', 'pc-arrow');
    marker.appendChild(path);
    defs.appendChild(marker);
    return defs;
  }

  private el(tag: string): Element {
    return document.createElementNS(SVG_NS, tag);
  }

  private applySpec(el: Element, spec: ElSpec): Element {
    const node = this.el(spec.tag);
    for (const [k, v] of Object.entries(spec.attrs)) node.setAttribute(k, String(v));
    if (spec.text !== undefined) node.textContent = spec.text;
    el.appendChild(node);
    return node;
  }

  private buildObject(obj: SceneObject): SVGGElement {
    const g = this.el('g') as SVGGElement;
    g.setAttribute('class', `pc-obj pc-kind-${obj.kind}`);
    g.setAttribute('data-id', obj.id);
    for (const spec of shapeGlyphs(obj)) this.applySpec(g, spec);
    return g;
  }

  private positionObject(g: SVGGElement, obj: SceneObject): void {
    g.setAttribute('transform', `translate(${obj.x} ${obj.y})`);
  }

  private buildLink(link: SceneLink): LinkEntry {
    const g = this.el('g') as SVGGElement;
    g.setAttribute('class', 'pc-link');
    g.setAttribute('data-id', link.id);
    const path = this.el('path') as SVGPathElement;
    path.setAttribute('class', 'pc-route');
    path.setAttribute('marker-end', 'url(#pc-arrow)');
    g.appendChild(path);
    let label: SVGTextElement | null = null;
    if (link.label) {
      label = this.el('text') as SVGTextElement;
      label.setAttribute('class', 'pc-link-label');
      label.textContent = link.label;
      g.appendChild(label);
    }
    this.linksLayer.appendChild(g);
    const entry: LinkEntry = { el: g, path, label, link };
    this.updateLink(entry, link);
    return entry;
  }

  private updateLink(entry: LinkEntry, link: SceneLink): void {
    entry.link = link;
    entry.el.classList.toggle('pc-dashed', link.dashed === true);
    entry.path.setAttribute('d', pointsToPath(link.points));
    if (entry.label) {
      const mid = labelPoint(link.points);
      entry.label.setAttribute('x', String(mid.x));
      entry.label.setAttribute('y', String(mid.y));
    }
  }

  /**
   * Diff-patch the scene. Returns operation counts for perf/test assertions.
   */
  render(scene: Scene): PatchStats {
    const stats: PatchStats = { created: 0, updated: 0, removed: 0, reordered: false };
    this.patchObjects(scene.objects, stats);
    this.patchLinks(scene.links, stats);
    this.applyFade(); // rebuilds reset classes — fade state must survive patches
    return stats;
  }

  /** Create node for a new object (render pass). */
  private createObject(obj: SceneObject, stats: PatchStats): void {
    const g = this.buildObject(obj);
    this.positionObject(g, obj);
    this.objectsLayer.appendChild(g);
    this.objEntries.set(obj.id, { el: g, obj });
    stats.created++;
  }

  /** Rebuild children of an existing <g> (structural change, same node). */
  private rebuildObject(prev: ObjEntry, obj: SceneObject, stats: PatchStats): void {
    const g = prev.el;
    g.textContent = '';
    g.setAttribute('class', `pc-obj pc-kind-${obj.kind}`);
    for (const spec of shapeGlyphs(obj)) this.applySpec(g, spec);
    this.positionObject(g, obj);
    this.objEntries.set(obj.id, { el: g, obj });
    stats.updated++;
  }

  /** Move-only update: transform attr swap (drag fast path). */
  private moveObject(prev: ObjEntry, obj: SceneObject, stats: PatchStats): void {
    const prevKey = `translate(${prev.obj.x} ${prev.obj.y})`;
    if (prevKey === `translate(${obj.x} ${obj.y})`) return;
    this.positionObject(prev.el, obj);
    this.objEntries.set(obj.id, { el: prev.el, obj });
    stats.updated++;
  }

  private patchObjects(objects: SceneObject[], stats: PatchStats): void {
    const nextIds = new Set(objects.map((o) => o.id));
    for (const [id, entry] of this.objEntries) {
      if (!nextIds.has(id)) {
        entry.el.remove();
        this.objEntries.delete(id);
        stats.removed++;
      }
    }
    const nextOrder = objects.map((o) => o.id).join('\u0000');
    const prevOrder = this.lastOrder;
    for (const obj of objects) {
      const prev = this.objEntries.get(obj.id);
      if (!prev) this.createObject(obj, stats);
      else if (structuralKey(prev.obj) !== structuralKey(obj)) this.rebuildObject(prev, obj, stats);
      else this.moveObject(prev, obj, stats);
    }
    if (prevOrder !== '' && nextOrder !== prevOrder) {
      for (const obj of objects) {
        const entry = this.objEntries.get(obj.id);
        if (entry) this.objectsLayer.appendChild(entry.el);
      }
      stats.reordered = true;
    }
    this.lastOrder = nextOrder;
    // structural rebuilds reset the class attribute → reapply selection state
    if (stats.updated > 0 || stats.created > 0) this.applySelection();
  }

  private patchLinks(links: SceneLink[], stats: PatchStats): void {
    const nextIds = new Set(links.map((l) => l.id));
    for (const [id, entry] of this.linkEntries) {
      if (!nextIds.has(id)) {
        entry.el.remove();
        this.linkEntries.delete(id);
        stats.removed++;
      }
    }
    for (const link of links) {
      const prev = this.linkEntries.get(link.id);
      if (!prev) {
        this.linkEntries.set(link.id, this.buildLink(link));
        stats.created++;
        continue;
      }
      if (structuralKeyLink(prev.link) !== structuralKeyLink(link)) {
        // label presence/dashed changed → rebuild node
        prev.el.remove();
        this.linkEntries.set(link.id, this.buildLink(link));
        stats.updated++;
        continue;
      }
      if (
        polylineKey(prev.link.points) !== polylineKey(link.points) ||
        prev.link.dashed !== link.dashed
      ) {
        this.updateLink(prev, link);
        stats.updated++;
      }
    }
  }

  /** Toggle selection classes by object/link id (FR-C4 visual). */
  setSelection(ids: string[], linkIds: string[] = []): void {
    this.selectedIds = new Set(ids);
    this.selectedLinkIds = new Set(linkIds);
    this.applySelection();
  }

  // ---- M6 fade (FR-V1): render-layer opacity via the pc-faded class --------

  private fadedObjects = new Set<string>();
  private fadedLinks = new Set<string>();

  /**
   * Set faded ids and apply classes. Called by the controller; re-applied on
   * every render() so structural rebuilds (which reset the class attribute)
   * cannot lose the fade state.
   */
  setFade(objects: Iterable<string>, links: Iterable<string>): void {
    this.fadedObjects = new Set(objects);
    this.fadedLinks = new Set(links);
    this.applyFade();
  }

  private applyFade(): void {
    for (const [id, entry] of this.objEntries) {
      entry.el.classList.toggle('pc-faded', this.fadedObjects.has(id));
    }
    for (const [id, entry] of this.linkEntries) {
      entry.el.classList.toggle('pc-faded', this.fadedLinks.has(id));
    }
  }

  private applySelection(): void {
    for (const [id, entry] of this.objEntries) {
      entry.el.classList.toggle('pc-selected', this.selectedIds.has(id));
    }
    for (const [id, entry] of this.linkEntries) {
      entry.el.classList.toggle('pc-link-selected', this.selectedLinkIds.has(id));
    }
  }

  /** Stable DOM node for an object id (hit-testing/identity, tests). */
  elementFor(id: string): SVGGElement | undefined {
    return this.objEntries.get(id)?.el;
  }
}

/** Polyline → SVG path d string. */
export function pointsToPath(points: Polyline): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
}
