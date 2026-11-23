// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13 unit tests — the presentation launcher's catalog: every flow with
// its title, one-line purpose, step count and estimated wall-clock length.
import { describe, expect, it } from 'vitest';
import { parsePDL } from '../../engine/format/parser';
import { MOTION } from '../../engine/anim/timings';
import { flowCatalog, formatDuration } from './flowCatalog';

const DOC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Order walkthrough" as order {
  description "How an order reaches the shop"
  intro "start"
  a -> b : "order"
  conclusion "done"
}

flow "Slow refunds" as refund {
  intro "start" delay 1000
  process b
}
`;

const doc = (): NonNullable<ReturnType<typeof parsePDL>['doc']> => {
  const { doc: d } = parsePDL(DOC);
  if (d === null) throw new Error('fixture does not parse');
  return d;
};

describe('flow catalog (UX08-WP13)', () => {
  it('lists the live default and each custom flow with its own metadata', () => {
    const entries = flowCatalog(doc());
    expect(entries.map((e) => e.title)).toEqual(['Default flow', 'Order walkthrough', 'Slow refunds']);
    expect(entries[0]).toMatchObject({ key: 'default', steps: 1, derived: true });
    expect(entries[1]).toMatchObject({
      key: 'order',
      description: 'How an order reaches the shop',
      steps: 3,
    });
    // dwell + camera transit per beat, exactly what buildPlan reports
    expect(entries[1]?.estimatedMs).toBe(3 * MOTION.stepDelayMs + 3 * MOTION.cameraMs);
    expect(entries[2]?.estimatedMs).toBe(1000 + MOTION.stepDelayMs + 2 * MOTION.cameraMs);
    expect(entries[2]?.description).toBeUndefined();
  });

  it('always offers Default for a valid blank document', () => {
    const { doc: blank } = parsePDL('pcd 1.0\n');
    expect(flowCatalog(blank)).toMatchObject([
      { key: 'default', title: 'Default flow', steps: 0, derived: true },
    ]);
  });

  it('offers an element-backed default without connections', () => {
    const { doc: bare } = parsePDL('pcd 1.0\nperson a "Ada"\n');
    expect(flowCatalog(bare)).toMatchObject([
      { key: 'default', title: 'Default flow', steps: 1, derived: true },
    ]);
  });

  it('lists the derived default flow for a link-only file (item 10)', () => {
    const { doc: linked } = parsePDL(`pcd 1.0

person customer "Customer"
system shop "Shop"

customer -> shop : "buys"
`);
    const entries = flowCatalog(linked);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: 'default', title: 'Default flow', steps: 1, derived: true });
    // Only the virtual entry is marked derived; custom flows keep their identity.
    expect(flowCatalog(doc()).slice(1).every((entry) => entry.derived === undefined)).toBe(true);
  });
});

describe('formatDuration (UX08-WP13)', () => {
  it('renders seconds under a minute and minutes above', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(8200)).toBe('8 s');
    expect(formatDuration(60_000)).toBe('1 min');
    expect(formatDuration(95_000)).toBe('1 min 35 s');
  });
});
