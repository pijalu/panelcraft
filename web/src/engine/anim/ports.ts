// SPDX-License-Identifier: GPL-3.0-only
// Injectable timing/animation ports (M5-WP2, PLAN §7): Clock for timers and
// AnimPlayer for element animations. Production wires systemClock + waapiPlayer
// (WAAPI); tests inject fakes — deterministic, no real timers in CI
// (handover protocol c). Shape mirrors what the app actually uses: no
// speculative surface.
export interface Clock {
  now(): number;
  /** One-shot timer; returns a token usable with cancel(). */
  delay(fn: () => void, ms: number): number;
  cancel(token: number): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  delay: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  cancel: (token) => clearTimeout(token),
};

export type Keyframe = Record<string, string | number>;

export interface AnimOpts {
  durationMs: number;
  /** CSS easing; 'linear' for progress-like motion (STYLE-GUIDE Motion). */
  easing?: string;
  /** Start offset (F-17 sequential-glow staggers parallel actors). */
  delayMs?: number;
}

export interface AnimHandle {
  cancel(): void;
}

export interface AnimPlayer {
  animate(el: Element, keyframes: Keyframe[], opts: AnimOpts): AnimHandle;
}

/** WAAPI-backed player (browsers). jsdom has no Element.animate — guarded,
 * degraded to a no-op handle so component smoke renders stay silent. */
export const waapiPlayer: AnimPlayer = {
  animate: (el, keyframes, opts) => {
    const a = (
      el as Element & {
        animate?: (
          kf: Keyframe[],
          o: { duration: number; easing: string; fill: 'none'; delay?: number },
        ) => { cancel(): void };
      }
    ).animate;
    if (typeof a !== 'function') return { cancel: () => {} };
    const anim = a.call(
      el,
      keyframes,
      {
        duration: opts.durationMs,
        easing: opts.easing ?? 'linear',
        fill: 'none',
        delay: opts.delayMs ?? 0,
      },
    );
    return anim === undefined ? { cancel: () => {} } : { cancel: () => anim.cancel() };
  },
};
