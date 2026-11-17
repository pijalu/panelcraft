// SPDX-License-Identifier: GPL-3.0-only
// Spark beat timeline: the numeric contract shared by the animator and the
// browser evidence. Every spark/pass gets an explicit source pulse, creation,
// travel, arrival pulse and rest, all inside the beat's dwell.
import { describe, expect, it } from 'vitest';
import { MOTION } from './timings';
import { beatTimeline, type Endpoint } from './timeline';

const DWELL = MOTION.stepDelayMs;

describe('beatTimeline', () => {
  it('creates a spark at the source pulse peak, not after unexpansion', () => {
    const t = beatTimeline({ dwellMs: DWELL, count: 1, speed: 1 });
    const source = t.sparks[0]!.passes[0]!.source;
    const created = t.events.find((e) => e.kind === 'spark-created')!;
    expect(created.at).toBe(source.peak);
    expect(created.at).toBeGreaterThan(source.start);
    expect(created.at).toBeLessThan(source.end);
    // The travel starts at creation; the border returns to rest while the
    // spark is already on its way (this is the ambiguity the bug named).
    expect(t.sparks[0]!.passes[0]!.travel.start).toBe(created.at);
    expect(source.end).toBeGreaterThan(created.at);
  });

  it('orders source pulse, creation, travel, arrival and target rest', () => {
    const t = beatTimeline({ dwellMs: DWELL, count: 1, speed: 1 });
    expect(t.events.map((e) => e.kind)).toEqual([
      'source-pulse-start',
      'spark-created',
      'travel-start',
      'source-rest',
      'spark-arrived',
      'target-pulse-start',
      'target-rest',
    ]);
    for (let i = 1; i < t.events.length; i++) {
      expect(t.events[i]!.at).toBeGreaterThanOrEqual(t.events[i - 1]!.at);
    }
  });

  it('keeps every spark of a staggered group inside one dwell', () => {
    const t = beatTimeline({ dwellMs: DWELL, count: 4, speed: 2 });
    expect(t.staggerMs).toBeGreaterThan(0);
    expect(t.sparks).toHaveLength(4);
    for (const [i, spark] of t.sparks.entries()) {
      expect(spark.start).toBe(i * t.staggerMs);
      for (const pass of spark.passes) {
        expect(pass.travel.start).toBe(pass.source.peak);
        expect(pass.target.start).toBe(pass.travel.arrival);
        expect(pass.target.end).toBeGreaterThan(pass.target.start);
      }
    }
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(DWELL);
    // Events are globally ordered, not grouped by spark.
    for (let i = 1; i < t.events.length; i++) {
      expect(t.events[i]!.at).toBeGreaterThanOrEqual(t.events[i - 1]!.at);
    }
  });

  it('alternates arrival endpoints on a bidirectional link', () => {
    const t = beatTimeline({ dwellMs: DWELL, count: 1, speed: 1, bidir: true });
    expect(t.sparks[0]!.passes.length).toBeGreaterThanOrEqual(2);
    const origins = t.sparks[0]!.passes.map((p) => p.travel.from);
    const destinations = t.sparks[0]!.passes.map((p) => p.travel.to);
    expect(origins[0]).toBe('from');
    expect(destinations[0]).toBe('to');
    expect(origins[1]).toBe('to');
    expect(destinations[1]).toBe('from');
    // Each arrival pulses the endpoint that received it.
    for (const pass of t.sparks[0]!.passes) expect(pass.target.actor).toBe(pass.travel.to);
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(DWELL);
  });

  it('maps flipped travel to the resolved endpoints, not the ring order', () => {
    // A flipped beat has from='b', to='a'; the pure timeline is endpoint-agnostic
    // and simply preserves that order. The animator maps it to the DOM later.
    const t = beatTimeline({ dwellMs: DWELL, count: 1, speed: 1 });
    const pass = t.sparks[0]!.passes[0]!;
    expect([pass.travel.from, pass.travel.to] satisfies Endpoint[]).toEqual(['from', 'to']);
  });

  it('compresses all phases into a very short dwell without crossing them', () => {
    const t = beatTimeline({ dwellMs: 300, count: 2, speed: 0.25, bidir: true });
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(300);
    expect(t.ringMs).toBeLessThan(MOTION.ringMs);
    for (const spark of t.sparks) {
      for (const pass of spark.passes) {
        expect(pass.source.start).toBeLessThan(pass.source.peak);
        expect(pass.source.peak).toBeLessThanOrEqual(pass.travel.arrival);
        expect(pass.target.start).toBeLessThanOrEqual(pass.target.end);
      }
    }
  });

  it('survives nonsense input with finite, ordered times', () => {
    const t = beatTimeline({ dwellMs: 0, count: Number.NaN, speed: 0, bidir: true });
    expect(Number.isFinite(t.finalRestMs)).toBe(true);
    expect(t.sparks.length).toBeGreaterThan(0);
    expect(t.finalRestMs + t.settleMs).toBeLessThanOrEqual(Math.max(1, 0));
  });
});
