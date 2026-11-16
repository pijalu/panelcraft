// SPDX-License-Identifier: GPL-3.0-only
// Beat-lifetime contract (item 9): a beat's connectors must finish inside the
// beat, with a visible arrival, and several sparks must share that window
// instead of overrunning it.
import { describe, expect, it } from 'vitest';
import { ARRIVAL_MS, MAX_STRETCH, MIN_TRAVEL_MS, MOTION, travelTiming } from './timings';

const DWELL = MOTION.stepDelayMs;

describe('travelTiming', () => {
  it('places a single spark inside the beat with a visible arrival', () => {
    const t = travelTiming(DWELL, 1, 1);
    expect(t.staggerMs).toBe(0);
    expect(t.durationMs + ARRIVAL_MS).toBeLessThanOrEqual(DWELL);
    // The old behaviour was 900 ms of motion followed by 1.6 s of nothing.
    expect(t.durationMs).toBeGreaterThan(MOTION.tokenMs);
  });

  it('never stretches a spark past the natural duration ceiling', () => {
    const t = travelTiming(10_000, 1, 1);
    expect(t.durationMs).toBe(MOTION.tokenMs * MAX_STRETCH);
  });

  it('lets a faster spark arrive sooner and hold at the endpoint', () => {
    const fast = travelTiming(DWELL, 4, 1);
    const slow = travelTiming(DWELL, 1, 1);
    expect(fast.durationMs).toBeLessThan(slow.durationMs);
    expect(fast.durationMs + ARRIVAL_MS).toBeLessThanOrEqual(DWELL);
  });

  it('staggeres several sparks so the last one still arrives in time', () => {
    const t = travelTiming(DWELL, 1, 4);
    expect(t.staggerMs).toBeGreaterThan(0);
    const lastArrival = t.staggerMs * 3 + t.durationMs;
    expect(lastArrival).toBeLessThanOrEqual(DWELL - ARRIVAL_MS + 1);
    expect(t.settleMs).toBeGreaterThanOrEqual(0);
  });

  it('keeps a very short beat animatable instead of collapsing to zero', () => {
    const t = travelTiming(300, 1, 2);
    expect(t.durationMs).toBe(MIN_TRAVEL_MS);
    expect(t.staggerMs).toBeGreaterThanOrEqual(0);
  });

  it('survives a nonsense speed instead of dividing by zero', () => {
    const t = travelTiming(DWELL, 0, 1);
    expect(Number.isFinite(t.durationMs)).toBe(true);
    expect(t.durationMs).toBeGreaterThan(0);
  });
});
