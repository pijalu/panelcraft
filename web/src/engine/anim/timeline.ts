// SPDX-License-Identifier: GPL-3.0-only
// Numeric beat timeline for connector sparks (bug: spark and border effects
// need one beat timeline). Pure: no DOM, no timers, no WAAPI. The animator uses
// the same numbers the browser evidence samples, so "source pulse -> creation ->
// travel -> arrival -> target pulse -> rest" is one contract rather than five
// independent animations racing each other.
//
// Creation happens at the SOURCE PULSE PEAK, not after the border returns:
// the spark is born inside the expanded border, and that border unexpands while
// the spark is already travelling. Every pass repeats the pattern at its own
// origin; a bidirectional link alternates the resolved `from`/`to` endpoints.
import { ARRIVAL_MS, MAX_STRETCH, MIN_TRAVEL_MS, MOTION, type MotionConfig } from './timings';

export type Endpoint = 'from' | 'to';

export type EventKind =
  | 'source-pulse-start'
  | 'spark-created'
  | 'travel-start'
  | 'source-rest'
  | 'spark-arrived'
  | 'target-pulse-start'
  | 'target-rest';

export interface PulseTimes {
  actor: Endpoint;
  start: number;
  peak: number;
  end: number;
}

export interface TravelTimes {
  from: Endpoint;
  to: Endpoint;
  start: number;
  arrival: number;
}

export interface SparkPass {
  index: number;
  source: PulseTimes;
  travel: TravelTimes;
  target: PulseTimes;
}

export interface SparkTimes {
  index: number;
  start: number;
  passes: SparkPass[];
  finalTo: Endpoint;
}

export interface TimelineEvent {
  at: number;
  kind: EventKind;
  spark: number;
  pass: number;
  actor: Endpoint;
}

export interface BeatTimeline {
  dwellMs: number;
  ringMs: number;
  travelMs: number;
  staggerMs: number;
  settleMs: number;
  sparks: SparkTimes[];
  finalRestMs: number;
  events: TimelineEvent[];
}

export interface TimelineInput {
  dwellMs: number;
  count?: number;
  speed?: number;
  bidir?: boolean;
  motion?: Pick<MotionConfig, 'ringMs' | 'tokenMs'>;
}

export const clampCount = (n: number | undefined): number =>
  n === undefined || !Number.isFinite(n) ? 1 : Math.min(8, Math.max(1, Math.round(n)));

export const clampSpeed = (n: number | undefined): number =>
  n === undefined || !Number.isFinite(n) ? 1 : Math.min(4, Math.max(0.25, n));

const RING_DWELL_FRACTION = 0.25;
const SETTLE_FRACTION = 0.02;
const STAGGER_FRACTION = 0.15;
const MAX_PASSES = 8;

const EVENT_PRIORITY: Record<EventKind, number> = {
  'source-pulse-start': 0,
  'spark-created': 1,
  'travel-start': 2,
  'source-rest': 3,
  'spark-arrived': 4,
  'target-pulse-start': 5,
  'target-rest': 6,
};

const other = (e: Endpoint): Endpoint => (e === 'from' ? 'to' : 'from');

/** Compute the whole beat timeline. Motion is compressed only when dwell is. */
export function beatTimeline(input: TimelineInput): BeatTimeline {
  const motion = input.motion ?? MOTION;
  const dwellMs = Math.max(1, Number.isFinite(input.dwellMs) ? input.dwellMs : MOTION.stepDelayMs);
  const count = clampCount(input.count);
  const speed = clampSpeed(input.speed);
  const settleMs = Math.min(
    Math.max(0, ARRIVAL_MS - motion.ringMs),
    Math.floor(dwellMs * SETTLE_FRACTION),
  );
  const available = Math.max(1, dwellMs - settleMs);
  const ringMs = Math.max(0.1, Math.min(motion.ringMs, available * RING_DWELL_FRACTION));
  const peak = ringMs / 2;
  const minTravel = Math.min(MIN_TRAVEL_MS, Math.max(0.1, available / 4));
  const passCost = peak + ringMs + minTravel;
  const passes = input.bidir === true
    ? Math.min(MAX_PASSES, Math.max(1, Math.floor(available / passCost)))
    : 1;
  const staggerBudget = count > 1 ? available * STAGGER_FRACTION : 0;
  const chainRoom = (available - staggerBudget) / passes;
  const travelBudget = Math.max(0.1, chainRoom - peak - ringMs);
  const natural = motion.tokenMs / speed;
  const travelMs = Math.max(0.1, Math.min(travelBudget, natural * MAX_STRETCH));
  const staggerMs = count > 1
    ? Math.max(0, Math.min(Math.floor(staggerBudget / (count - 1)), Math.floor(travelMs / 2)))
    : 0;
  const chain = peak + travelMs + ringMs;

  const sparks: SparkTimes[] = [];
  const events: TimelineEvent[] = [];
  for (let s = 0; s < count; s++) {
    const start = s * staggerMs;
    const sparkPasses: SparkPass[] = [];
    let origin: Endpoint = 'from';
    for (let p = 0; p < passes; p++) {
      const destination = other(origin);
      const passStart = start + p * chain;
      const source: PulseTimes = {
        actor: origin,
        start: passStart,
        peak: passStart + peak,
        end: passStart + ringMs,
      };
      const travel: TravelTimes = {
        from: origin,
        to: destination,
        start: source.peak,
        arrival: source.peak + travelMs,
      };
      const target: PulseTimes = {
        actor: destination,
        start: travel.arrival,
        peak: travel.arrival + peak,
        end: travel.arrival + ringMs,
      };
      sparkPasses.push({ index: p, source, travel, target });
      const push = (kind: EventKind, at: number, actor: Endpoint): void => {
        events.push({ at, kind, spark: s, pass: p, actor });
      };
      push('source-pulse-start', source.start, origin);
      push('spark-created', source.peak, origin);
      push('travel-start', travel.start, origin);
      push('source-rest', source.end, origin);
      push('spark-arrived', travel.arrival, destination);
      push('target-pulse-start', target.start, destination);
      push('target-rest', target.end, destination);
      origin = destination;
    }
    sparks.push({ index: s, start, passes: sparkPasses, finalTo: sparkPasses.at(-1)!.travel.to });
  }

  events.sort((a, b) =>
    a.at - b.at ||
    EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind] ||
    a.spark - b.spark ||
    a.pass - b.pass,
  );
  const finalRestMs = Math.max(...sparks.map((s) => s.passes.at(-1)!.target.end));
  return { dwellMs, ringMs, travelMs, staggerMs, settleMs, sparks, finalRestMs, events };
}
