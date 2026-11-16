// SPDX-License-Identifier: GPL-3.0-only
// Theme motion config (M5-WP7, FR-F3/F4): single source of truth for every
// playback/motion timing in the app. CSS mirrors these values in app.css as
// `--pc-dur-*` custom properties — change both together (see app.css Motion).
// Nothing above 300 ms here except flow-playback timings (SPEC FR-F3/F4),
// which are stories, not chrome transitions (STYLE-GUIDE Motion section).
export const MOTION = {
  /** hover/press (STYLE-GUIDE --pc-dur-fast) */
  fastMs: 150,
  /** panel transitions (--pc-dur-med) */
  medMs: 200,
  /** dialog/theme cross-fade (--pc-dur-slow) */
  slowMs: 300,
  /** FR-F4 smooth camera pan/zoom per step (300 ms ease) */
  cameraMs: 300,
  /** FR-F4 edge token travel per msg beat */
  tokenMs: 900,
  /** FR-F4 emphasis ring pulse */
  ringMs: 450,
  /** FR-F3 per-step auto delay (default 2.5 s, configurable per plan) */
  stepDelayMs: 2500,
  /** FR-F4 non-participants dimmed to 25% opacity */
  dimOpacity: 0.25,
} as const;

export type MotionConfig = typeof MOTION;

/**
 * Beat-lifetime contract for connector travel (item 9). A one-way spark used to
 * run its own 900 ms and then vanish, leaving the rest of a 2.5 s beat empty —
 * the animation looked cut short and the arrival was invisible.
 *
 * The window is the beat itself minus a visible arrival margin, and every spark
 * is placed so that ALL of them finish inside it; the token then holds at the
 * endpoint (filled forwards) until the step changes. Nothing is stretched
 * blindly: the natural travel time stays the ceiling and the stagger spreads
 * inside what is left.
 */

/** Time reserved at the end of a beat for a visible arrival. */
export const ARRIVAL_MS = 500;
/** Shortest travel worth animating (a very short step still shows the direction). */
export const MIN_TRAVEL_MS = 250;
/** Never stretch a spark past this multiple of its natural duration. */
export const MAX_STRETCH = 2;

/** Where the travel elements of a beat sit on its timeline. */
export interface TravelTiming {
  /** How long one spark takes to reach its endpoint. */
  durationMs: number;
  /** Start offset between consecutive sparks (0 with a single spark). */
  staggerMs: number;
  /** Time the last spark rests at its endpoint before the step changes. */
  settleMs: number;
}

/**
 * Place `count` sparks inside the beat's dwell time.
 *
 * With several sparks the travel is shortened so the stagger fits: the whole
 * group must have arrived by the end of the window, not just the first spark.
 */
export function travelTiming(
  dwellMs: number,
  speed: number,
  count: number,
  motion: Pick<MotionConfig, 'tokenMs'> = MOTION,
  arrivalMs = ARRIVAL_MS,
): TravelTiming {
  const window = Math.max(MIN_TRAVEL_MS, dwellMs - arrivalMs);
  const natural = motion.tokenMs / (Number.isFinite(speed) && speed > 0 ? speed : 1);
  const stretched = Math.min(window, natural * MAX_STRETCH);
  // Several sparks need room to be distinguishable, so they share 70 % of the
  // window and stagger across the rest.
  const room = count > 1 ? window * 0.7 : window;
  const durationMs = Math.round(Math.max(MIN_TRAVEL_MS, Math.min(room, stretched)));
  const staggerMs = count > 1 ? Math.round((window - durationMs) / (count - 1)) : 0;
  const settleMs = Math.max(0, window - durationMs - staggerMs * (count - 1));
  return { durationMs, staggerMs, settleMs };
}
