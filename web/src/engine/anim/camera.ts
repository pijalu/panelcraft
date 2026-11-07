// SPDX-License-Identifier: GPL-3.0-only
// CameraController (M5-WP3, PLAN §7; SPEC FR-F4/F3): smooth pan/zoom to the
// step actors (fit the union into the view, cameraMs ease), snap variant for
// reduced motion, and exit-restore of the pre-play viewport (FR-F3).
//
// The glide animates `transform` on the world group via the AnimPlayer port;
// the final transform is COMMITTED through `apply` (the controller's
// setWorldTransform) after cameraMs on the injected Clock — cancelled when a
// newer focus supersedes it. Target computation is pure viewport math
// (unionRects + fitRect, engine/render/viewport.ts).
import { fitRect, unionRects, type Rect, type Size, type Transform } from '../render/viewport';
import { MOTION } from './timings';
import type { AnimHandle, AnimPlayer, Clock } from './ports';

const toCss = (t: Transform): string => `translate(${t.x}px, ${t.y}px) scale(${t.k})`;

export interface CameraDeps {
  /** world group (animation target) */
  el: Element;
  /** commit the authoritative viewport transform */
  apply(t: Transform): void;
  view(): Size;
  player: AnimPlayer;
  clock: Clock;
  motion?: typeof MOTION;
  reducedMotion?: boolean;
}

export class CameraController {
  private readonly deps: CameraDeps;
  private readonly motion: typeof MOTION;
  private readonly reduced: boolean;
  private saved: Transform | null = null;
  private glide: AnimHandle | null = null;
  private timer: number | null = null;

  constructor(deps: CameraDeps) {
    this.deps = deps;
    this.motion = deps.motion ?? MOTION;
    this.reduced = deps.reducedMotion ?? false;
  }

  /** Fit-transform for a set of rects (view padding 48px). fitRect already
   * clamps zoom to ZOOM_MIN/MAX. */
  private target(rects: Rect[]): Transform | null {
    const union = unionRects(rects);
    if (union === null) return null;
    return fitRect(union, this.deps.view(), 48);
  }

  /** Glide to the actors; instant when reduced motion. Empty rects = no-op. */
  focus(rects: Rect[], current: Transform): void {
    const to = this.target(rects);
    if (to === null) return;
    if (this.reduced) {
      this.cancelGlide();
      this.deps.apply(to);
      return;
    }
    this.cancelGlide();
    this.glide = this.deps.player.animate(
      this.deps.el,
      [{ transform: toCss(current) }, { transform: toCss(to) }],
      { durationMs: this.motion.cameraMs, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    this.timer = this.deps.clock.delay(() => {
      this.glide = null;
      this.timer = null;
      this.deps.apply(to);
    }, this.motion.cameraMs);
  }

  /** Immediate apply (no animation) — reduced motion / programmatic jumps. */
  snapTo(rects: Rect[], _current: Transform): void {
    const to = this.target(rects);
    if (to === null) return;
    this.cancelGlide();
    this.deps.apply(to);
  }

  /** Remember the pre-play viewport (FR-F3 exit-restore). */
  save(t: Transform): void {
    this.saved = t;
  }

  /** Glide back to the saved viewport; no-op when nothing was saved. */
  restoreSaved(current: Transform): void {
    if (this.saved === null) return;
    const saved = this.saved;
    if (this.reduced) {
      this.cancelGlide();
      this.deps.apply(saved);
      return;
    }
    this.cancelGlide();
    this.glide = this.deps.player.animate(
      this.deps.el,
      [{ transform: toCss(current) }, { transform: toCss(saved) }],
      { durationMs: this.motion.cameraMs, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    this.timer = this.deps.clock.delay(() => {
      this.glide = null;
      this.timer = null;
      this.deps.apply(saved);
    }, this.motion.cameraMs);
  }

  private cancelGlide(): void {
    if (this.glide !== null) this.glide.cancel();
    if (this.timer !== null) this.deps.clock.cancel(this.timer);
    this.glide = null;
    this.timer = null;
  }
}
