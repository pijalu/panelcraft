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
  /** FLOW-02: repeat count; `Infinity` keeps bidirectional sparks ping-ponging. */
  iterations?: number;
  /** Keep the last keyframe applied — a token must stay at its endpoint. */
  fill?: 'none' | 'forwards';
}

export interface AnimHandle {
  cancel(): void;
}

export interface AnimPlayer {
  animate(el: Element, keyframes: Keyframe[], opts: AnimOpts): AnimHandle;
  /** Freeze every running animation (transport pause must not keep moving). */
  pauseAll?(): void;
  /** Continue what pauseAll froze. */
  resumeAll?(): void;
  /** Jump every running animation to its end state (a parked step). */
  finishAll?(): void;
  /** Drop every running animation (step change, restart, exit, file change). */
  cancelAll?(): void;
}

/** WAAPI-backed player (browsers). jsdom has no Element.animate — guarded,
 * degraded to a no-op handle so component smoke renders stay silent. */
export const waapiPlayer: AnimPlayer = (() => {
  const live = new Set<{ cancel(): void; pause?(): void; play?(): void }>();
  return {
    animate: (el, keyframes, opts) => {
      const a = (
        el as Element & {
          animate?: (
            kf: Keyframe[],
            o: {
              duration: number;
              easing: string;
              fill: 'none' | 'forwards';
              delay?: number;
              iterations?: number;
            },
          ) => { cancel(): void; finished?: Promise<unknown> };
        }
      ).animate;
      if (typeof a !== 'function') return { cancel: () => {} };
      const anim = a.call(el, keyframes, {
        duration: opts.durationMs,
        easing: opts.easing ?? 'linear',
        fill: opts.fill ?? 'none',
        delay: opts.delayMs ?? 0,
        iterations: opts.iterations ?? 1,
      });
      if (anim === undefined) return { cancel: () => {} };
      live.add(anim);
      // Finished (or cancelled) animations leave the set: nothing accumulates
      // across a long presentation.
      void anim.finished?.then?.(() => live.delete(anim), () => live.delete(anim));
      return {
        cancel: () => {
          live.delete(anim);
          anim.cancel();
        },
      };
    },
    pauseAll: () => {
      for (const a of live) a.pause?.();
    },
    resumeAll: () => {
      for (const a of live) a.play?.();
    },
    finishAll: () => {
      for (const a of live) {
        // A repainting (infinite) spark has no end to jump to; freezing it is
        // the honest settled state. A finished one would throw.
        const iterations = (a as { effect?: { getComputedTiming(): { iterations?: number } } }).effect
          ?.getComputedTiming().iterations;
        if (iterations === Infinity) a.pause?.();
        else (a as { finish?(): void }).finish?.();
      }
    },
    cancelAll: () => {
      for (const a of live) a.cancel();
      live.clear();
    },
  };
})();
