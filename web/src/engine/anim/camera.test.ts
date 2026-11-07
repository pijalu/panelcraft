// SPDX-License-Identifier: GPL-3.0-only
// M5-WP3 unit tests — CameraController (fit-step target computation, glide,
// exit-restore). Fake player + fake clock: no real timers (handover protocol c).
import { describe, expect, it } from 'vitest';
import { CameraController } from './camera';
import { MOTION } from './timings';
import type { AnimHandle, AnimPlayer } from './ports';
import type { Clock } from './ports';
import type { Transform } from '../render/viewport';
import { applyRect, unionRects } from '../render/viewport';

interface CamCall {
  kf: Record<string, string | number>[];
  durationMs: number;
}

const mkDeps = (view: { w: number; h: number } = { w: 800, h: 600 }) => {
  const calls: CamCall[] = [];
  let cancelled = 0;
  const player: AnimPlayer = {
    animate: (_el, kf, opts): AnimHandle => {
      calls.push({ kf: [...kf], durationMs: opts.durationMs });
      return { cancel: () => cancelled++ };
    },
  };
  const timers = new Map<number, { fn: () => void; at: number }>();
  const cancelledT = new Set<number>();
  let now = 0;
  const clock: Clock = {
    now: () => now,
    delay: (fn, ms) => {
      const token = timers.size + 1;
      timers.set(token, { fn, at: now + ms });
      return token;
    },
    cancel: (token) => {
      cancelledT.add(token);
      timers.delete(token);
    },
  };
  const tick = (ms: number): void => {
    now += ms;
    for (const t of [...timers.values()]) if (t.at <= now) t.fn();
  };
  const applied: Transform[] = [];
  const apply = (t: Transform): void => {
    applied.push(t);
  };
  const current = (): Transform => applied.at(-1) ?? { x: 0, y: 0, k: 1 };
  const el = {} as Element;
  const cam = new CameraController({ el, apply, view: () => view, player, clock });
  return { cam, calls, applied, tick, cancelled: () => cancelled, current };
};

const R_A = { x: 0, y: 0, w: 120, h: 80 };
const R_B = { x: 200, y: 0, w: 120, h: 80 };

describe('CameraController (M5-WP3)', () => {
  it('glides to the fit-transform of the actor union after the camera duration', () => {
    const fx = mkDeps();
    fx.cam.focus([R_A, R_B], { x: 0, y: 0, k: 1 });
    fx.tick(MOTION.cameraMs);
    // the fitted union must sit inside the padded view (48px padding)
    const u = unionRects([R_A, R_B]);
    const sr = applyRect(fx.current(), u as NonNullable<typeof u>);
    expect(sr.x).toBeGreaterThanOrEqual(47.9);
    expect(sr.x + sr.w).toBeLessThanOrEqual(800.1);
    expect(sr.y).toBeGreaterThanOrEqual(47.9);
    expect(sr.y + sr.h).toBeLessThanOrEqual(600.1);
  });

  it('animation runs exactly cameraMs with from→to keyframes', () => {
    const fx = mkDeps();
    fx.cam.focus([R_A], { x: 0, y: 0, k: 1 });
    expect(fx.calls.length).toBe(1);
    expect(fx.calls[0]?.durationMs).toBe(MOTION.cameraMs);
    expect(fx.calls[0]?.kf.length).toBe(2);
    expect(fx.calls[0]?.kf[0]?.transform).toContain('scale(1)');
  });

  it('empty actor list is a no-op', () => {
    const fx = mkDeps();
    fx.cam.focus([], { x: 0, y: 0, k: 1 });
    expect(fx.calls.length).toBe(0);
    expect(fx.applied.length).toBe(0);
  });

  it('a new focus cancels the in-flight glide (no stacked timers)', () => {
    const fx = mkDeps();
    fx.cam.focus([R_A], { x: 0, y: 0, k: 1 });
    fx.cam.focus([R_B], { x: 0, y: 0, k: 1 });
    expect(fx.cancelled()).toBe(1);
    fx.tick(MOTION.cameraMs);
    // exactly one commit: the LAST target (first timer cancelled)
    expect(fx.applied.length).toBe(1);
  });

  it('snapTo applies the target immediately (reduced-motion path)', () => {
    const fx = mkDeps();
    fx.cam.snapTo([R_A], { x: 0, y: 0, k: 1 });
    expect(fx.calls.length).toBe(0);
    expect(fx.applied.length).toBe(1);
    const u = unionRects([R_A]);
    const sr = applyRect(fx.current(), u as NonNullable<typeof u>);
    expect(sr.x).toBeGreaterThanOrEqual(47.9);
    expect(sr.y + sr.h).toBeLessThanOrEqual(600.1);
  });

  it('save + restoreSaved returns to the pre-play viewport', () => {
    const fx = mkDeps();
    const prePlay = { x: -40, y: -12, k: 1.25 };
    fx.cam.save(prePlay);
    fx.cam.focus([R_A, R_B], { x: 0, y: 0, k: 1 });
    fx.tick(MOTION.cameraMs);
    fx.cam.restoreSaved({ x: 0, y: 0, k: 1 });
    fx.tick(MOTION.cameraMs);
    expect(fx.current()).toEqual(prePlay);
  });

  it('restoreSaved without save is a no-op', () => {
    const fx = mkDeps();
    fx.cam.restoreSaved({ x: 5, y: 5, k: 2 });
    expect(fx.applied.length).toBe(0);
  });
});
