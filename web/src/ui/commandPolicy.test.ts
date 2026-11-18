// SPDX-License-Identifier: GPL-3.0-only
// Shared selection policy for route/layout reset (bugs.md, ADR 0007). Pure so
// the canvas context menu and the hamburger menu adapters compute identical
// enablement from one selection model.
import { describe, expect, it } from 'vitest';
import { routeResetTarget } from './commandPolicy';

describe('route reset selection policy', () => {
  it('no selection → reset all routes', () => {
    expect(routeResetTarget({ objects: [], links: [] })).toEqual({ kind: 'all' });
  });

  it('exactly one selected connection → reset that route', () => {
    expect(routeResetTarget({ objects: [], links: ['L1'] })).toEqual({ kind: 'one', linkId: 'L1' });
  });

  it('object, mixed or multiple-link selections disable route reset', () => {
    expect(routeResetTarget({ objects: ['a'], links: [] }).kind).toBe('off');
    expect(routeResetTarget({ objects: ['a'], links: ['L1'] }).kind).toBe('off');
    expect(routeResetTarget({ objects: [], links: ['L1', 'L2'] }).kind).toBe('off');
  });
});
