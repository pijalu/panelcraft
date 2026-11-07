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
