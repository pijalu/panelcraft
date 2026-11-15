// SPDX-License-Identifier: GPL-3.0-only
// CameraController (M5-WP3, PLAN §7; SPEC FR-F4/F3; UX08-WP13): smooth pan/zoom
// to the step's resolved camera intent — `auto`/`overview` fit the supplied
// participant rects, `focus` centres a named canvas point at a zoom, `hold`
// leaves the view alone — plus a snap variant for reduced motion and
// exit-restore of the pre-play viewport (FR-F3).
//
// The glide animates `transform` on the world group via the AnimPlayer port;
// the final transform is COMMITTED through `apply` (the controller's
// setWorldTransform) after the intent's duration on the injected Clock —
// cancelled when a newer focus supersedes it. Target computation is pure
// viewport math (unionRects + fitRect + clampZoom, engine/render/viewport.ts).
import {
  clampZoom,
  fitRect,
  unionRects,
  type Rect,
  type Size,
  type Transform,
} from '../render/viewport';
import { MOTION } from './timings';
import type { AnimHandle, AnimPlayer, Clock } from './ports';

/** Camera intent for one step — the plan resolves it (engine/flows/plan.ts).
 * `auto`/`overview` fit the supplied rects; `focus` centres (x, y) at `zoom`;
 * `hold` is a no-op. */
export interface CameraIntent {
  mode: 'auto' | 'hold' | 'focus' | 'overview';
  x?: number;
  y?: number;
  zoom?: number;
  durationMs?: number;
}

/** Default intent: fit the participants (pre-WP13 behaviour). */
const AUTO: CameraIntent = { mode: 'auto' };

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

  /** Viewport transform that frames the intent (null = nothing to do). */
  private intentTarget(intent: CameraIntent, rects: Rect[], current: Transform): Transform | null {
    if (intent.mode === 'auto' || intent.mode === 'overview') return this.target(rects);
    // focus: centre the named canvas point, keeping the zoom unless one is given
    const view = this.deps.view();
    const k = clampZoom(intent.zoom ?? current.k);
    const x = intent.x ?? 0;
    const y = intent.y ?? 0;
    return { x: view.w / 2 - x * k, y: view.h / 2 - y * k, k };
  }

  /** Glide to the intent's target; instant when reduced motion, the duration is
   * 0, or the intent holds. Empty rects for auto/overview = no-op. */
  focus(rects: Rect[], current: Transform, intent: CameraIntent = AUTO): void {
    if (intent.mode === 'hold') return;
    const to = this.intentTarget(intent, rects, current);
    if (to === null) return;
    const durationMs = intent.durationMs ?? this.motion.cameraMs;
    if (this.reduced || durationMs <= 0) {
      this.cancelGlide();
      this.deps.apply(to);
      return;
    }
    this.cancelGlide();
    this.glide = this.deps.player.animate(
      this.deps.el,
      [{ transform: toCss(current) }, { transform: toCss(to) }],
      { durationMs, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    this.timer = this.deps.clock.delay(() => {
      this.glide = null;
      this.timer = null;
      this.deps.apply(to);
    }, durationMs);
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
