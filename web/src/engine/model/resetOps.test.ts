// SPDX-License-Identifier: GPL-3.0-only
// Regression tests for the pure route/layout reset operations (bugs.md, ADR 0007).
// Route reset must never touch object positions; layout reset clears positions
// and writes the deterministic auto-layout in one document operation.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../format/parser';
import { printDoc } from '../format/printer';
import { resetAllRoutes, resetDiagramLayout, resetLinkRouteDoc } from './resetOps';

const SRC = `pcd 1.0
person a "A"
person b "B"
person c "C"
a -> b as L1 {
  waypoint (10, 20)
  anchor from 0.25
}
b -> c as L2 {
  waypoint (30, 40)
}
layout auto LR
position a (5, 6)
position b (7, 8)
`;

const posOf = (doc: ReturnType<typeof parsePDL>['doc']) =>
  Object.fromEntries((doc?.layout?.positions ?? []).map((p) => [p.id, { x: p.x, y: p.y }]));

const routeOf = (doc: ReturnType<typeof parsePDL>['doc'], id: string) =>
  doc?.links.find((l) => l.id === id);

describe('reset routes never changes positions', () => {
  it('Reset all routes clears every waypoint and anchor but keeps positions', () => {
    const doc = parsePDL(SRC).doc!;
    const before = posOf(doc);
    const after = resetAllRoutes(doc);
    expect(routeOf(after, 'L1')?.waypoints).toBeUndefined();
    expect(routeOf(after, 'L1')?.fromAnchor).toBeUndefined();
    expect(routeOf(after, 'L2')?.waypoints).toBeUndefined();
    expect(posOf(after)).toEqual(before);
    // input not mutated
    expect(routeOf(doc, 'L1')?.waypoints).toEqual([[10, 20]]);
  });

  it('Reset one route affects only that link', () => {
    const doc = parsePDL(SRC).doc!;
    const after = resetLinkRouteDoc(doc, 'L1');
    expect(routeOf(after, 'L1')?.waypoints).toBeUndefined();
    expect(routeOf(after, 'L2')?.waypoints).toEqual([[30, 40]]);
    expect(posOf(after)).toEqual(posOf(doc));
  });
});

describe('reset diagram layout', () => {
  it('clears saved positions then persists the deterministic computed layout', () => {
    const doc = parsePDL(SRC).doc!;
    const after = resetDiagramLayout(doc, {
      a: { x: 100, y: 200 }, b: { x: 300, y: 400 }, c: { x: 500, y: 600 },
    });
    expect(posOf(after)).toEqual({
      a: { x: 100, y: 200 }, b: { x: 300, y: 400 }, c: { x: 500, y: 600 },
    });
    // one undoable document op: the doc round-trips with the new positions only
    const reparsed = parsePDL(printDoc(after)).doc!;
    expect(posOf(reparsed)).toEqual(posOf(after));
    expect(posOf(doc).a).toEqual({ x: 5, y: 6 });
  });

  it('ignores unknown ids and is deterministic for the same input', () => {
    const doc = parsePDL(SRC).doc!;
    const positions = { b: { x: 9, y: 9 }, ghost: { x: 1, y: 1 } };
    expect(posOf(resetDiagramLayout(doc, positions))).toEqual(posOf(resetDiagramLayout(doc, positions)));
    expect(posOf(resetDiagramLayout(doc, positions))).not.toHaveProperty('ghost');
  });
});
