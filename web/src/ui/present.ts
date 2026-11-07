// SPDX-License-Identifier: GPL-3.0-only
// Presentation-mode model (F-16; review §3.5 item 11): the key/gesture map for
// present mode, kept pure so it is testable without a browser. The shell only
// translates a key into one of these actions — the runner owns playback.

export type PresentAction = 'next' | 'back' | 'toggle' | 'restart' | 'exit';

/** True while a flow is playing/paused/ended (i.e. presenting is active). */
export function isPresenting(status: 'idle' | 'playing' | 'paused' | 'ended'): boolean {
  return status !== 'idle';
}

/**
 * Key → presentation action. Bare keys only (no modifiers): a modified key is a
 * browser/platform shortcut and must not be swallowed by the presentation.
 */
const KEY_ACTIONS: Record<string, PresentAction> = {
  ' ': 'next',
  Spacebar: 'next',
  ArrowRight: 'next',
  PageDown: 'next',
  ArrowLeft: 'back',
  PageUp: 'back',
  p: 'toggle',
  P: 'toggle',
  r: 'restart',
  R: 'restart',
  Escape: 'exit',
};

export function presentAction(key: string, mod = false): PresentAction | null {
  if (mod) return null;
  return KEY_ACTIONS[key] ?? null;
}

/** Progress dots for the dock: one entry per step, current marked. */
export function progressDots(index: number, total: number): Array<{ step: number; current: boolean }> {
  const n = Math.max(0, Math.min(total, 64)); // cap the dot row, never unbounded
  return Array.from({ length: n }, (_, i) => ({ step: i + 1, current: i + 1 === index }));
}

/** Reduced-motion preference (present mode still plays, just without animation). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
