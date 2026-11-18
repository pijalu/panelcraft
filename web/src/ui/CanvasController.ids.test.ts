// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// F-02 regression suite: ids must never be reused. Before the fix the session
// counter started at 0 regardless of the loaded file, so adding an object to a
// file that already had `o1`/`o2` produced a second `o1` — the printer wrote
// two statements with the same id and one entity was lost on reload.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { CanvasController, uniqueId } from './CanvasController';

const SVG_NS = 'http://www.w3.org/2000/svg';

let svg: SVGSVGElement;
let ctrl: CanvasController;

beforeEach(() => {
  svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(svg);
  ctrl = new CanvasController(svg);
});

afterEach(() => {
  ctrl.destroy();
  svg.remove();
});

const ids = (): string[] => ctrl.snapshot.objects.map((o) => o.id);

describe('stable id allocation (F-02)', () => {
  it('loadState re-baselines the counter: o1,o2 → next id is o3', () => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' },
        { id: 'o2', kind: 'system', x: 200, y: 0, w: 160, h: 60, name: 'B' },
      ],
      links: [],
    });
    expect(ctrl.addObject('system')).toBe('o3');
  });

  it('creates 20 sequential adds without a single duplicate', () => {
    ctrl.loadState({
      objects: [{ id: 'o3', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'A' }],
      links: [],
    });
    for (let i = 0; i < 20; i++) ctrl.addObject('container');
    const all = ids();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('o3');
  });

  it('probes past a non-sequential id block', () => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'system', x: 0, y: 0, w: 160, h: 60 },
        { id: 'o2', kind: 'system', x: 0, y: 0, w: 160, h: 60 },
        { id: 'o3', kind: 'system', x: 0, y: 0, w: 160, h: 60 },
        { id: 'api', kind: 'system', x: 0, y: 0, w: 160, h: 60 },
      ],
      links: [],
    });
    expect(ctrl.addObject('system')).toBe('o4');
  });

  it('link ids do not collide with object ids or loaded links', () => {
    ctrl.loadState({
      objects: [
        { id: 'o5', kind: 'system', x: 0, y: 0, w: 160, h: 60 },
        { id: 'o6', kind: 'system', x: 300, y: 0, w: 160, h: 60 },
      ],
      links: [{ id: 'l6', from: 'o5', to: 'o6' }],
    });
    expect(ctrl.addObject('system')).toBe('o7');
  });

  it('uniqueId returns the first free id at or above `from`', () => {
    const taken = new Set(['o1', 'o2', 'o4']);
    expect(uniqueId(taken, 'o', 1)).toBe('o3');
    expect(uniqueId(taken, 'o', 9)).toBe('o9');
    expect(uniqueId(new Set<string>(), 'o', 0)).toBe('o1');
  });
});

// The default name is what the user sees and edits, so it must read as a
// per-kind sequence from 1. It used to be derived from the element id, which is
// one counter shared by every kind and every link — a person added after a
// component was called "Person 2" even though "Person 1" was free.
describe('default name numbering', () => {
  const nameOf = (id: string): string => ctrl.snapshot.objects.find((o) => o.id === id)?.name ?? '';

  it('numbers each kind from 1 independently', () => {
    const component = ctrl.addObject('component');
    const person = ctrl.addObject('person');
    expect(nameOf(component)).toBe('Component 1');
    expect(nameOf(person)).toBe('Person 1');
  });

  it('fills the first free number for the kind, not the highest', () => {
    ctrl.loadState({
      objects: [
        { id: 'o1', kind: 'container', x: 0, y: 0, w: 160, h: 60, name: 'Container 1' },
        { id: 'o2', kind: 'container', x: 0, y: 0, w: 160, h: 60, name: 'Container 3' },
      ],
      links: [],
    });
    expect(nameOf(ctrl.addObject('container'))).toBe('Container 2');
  });

  it('a loaded file with high ids does not push the name number up', () => {
    ctrl.loadState({
      objects: [
        { id: 'o5', kind: 'system', x: 0, y: 0, w: 160, h: 60, name: 'Gateway' },
        { id: 'o6', kind: 'system', x: 300, y: 0, w: 160, h: 60, name: 'Worker' },
      ],
      links: [{ id: 'l6', from: 'o5', to: 'o6' }],
    });
    const id = ctrl.addObject('system');
    expect(id).toBe('o7');
    expect(nameOf(id)).toBe('System 1');
  });

  it('keeps names unique when a renamed element already holds the default name', () => {
    ctrl.loadState({
      objects: [{ id: 'o1', kind: 'queue', x: 0, y: 0, w: 160, h: 60, name: 'Queue 1' }],
      links: [],
    });
    expect(nameOf(ctrl.addObject('queue'))).toBe('Queue 2');
  });
});
