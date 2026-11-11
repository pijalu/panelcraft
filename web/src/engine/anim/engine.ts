// SPDX-License-Identifier: GPL-3.0-only
// FlowAnimator (M5-WP2, PLAN §7; SPEC FR-F4/F5): executes one playback beat
// against the rendered scene. Visuals only — dim sets, token travel, trailing
// dash, emphasis rings, step badges; reduced-motion applies end states
// instantly (STYLE-GUIDE Motion). Timing/animation come from injected ports
// (ports.ts); geometry from a PathGeometry port so tests serve polylines.
//
// Layering: the anim layer lives INSIDE .pc-world so tokens/rings/badges pan
// and zoom with the camera (world coordinates). Dim/emphasis are classes on
// the scene elements themselves (.pc-dim / .pc-emph) — CSS owns the opacity
// transition (app.css), reduced-motion kills it via media query.
import type { Beat, BeatLink } from '../flows/plan';
import { MOTION } from './timings';
import type { AnimPlayer, Keyframe } from './ports';

export interface PathGeometry {
  length(path: Element): number;
  pointAt(path: Element, dist: number): { x: number; y: number };
}

/** DOM geometry via SVGGeometryElement (production). */
export const domGeometry: PathGeometry = {
  length: (path) => (path as SVGGeometryElement).getTotalLength(),
  pointAt: (path, dist) => {
    const p = (path as SVGGeometryElement).getPointAtLength(dist);
    return { x: p.x, y: p.y };
  },
};

export interface BeatCtx {
  /** World-space rect of a scene object (camera + ring placement). */
  rectOf(id: string): { x: number; y: number; w: number; h: number } | null;
}

export interface AnimatorDeps {
  player: AnimPlayer;
  geometry?: PathGeometry;
  motion?: typeof MOTION;
  /** FR-F5: prefer-reduced-motion → jump to end states, no movement. */
  reducedMotion?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOKEN_R = 6;
const TRAIL_FRAC = 0.18;
const SAMPLES = 24;

const mkEl = (tag: string, cls: string): SVGGElement => {
  const e = document.createElementNS(SVG_NS, tag) as unknown as SVGGElement;
  e.setAttribute('class', cls);
  return e;
};

import { resolveIllustration, type IllustrationId } from './illustrations';

export class FlowAnimator {
  private readonly svg: SVGSVGElement;
  private readonly player: AnimPlayer;
  private readonly geometry: PathGeometry;
  private readonly motion: typeof MOTION;
  private readonly reduced: boolean;
  private dimmed: Element[] = [];
  private emphasized: Element[] = [];
  /** Immediately previous participants stay readable as narrative context. */
  private previous = new Set<string>();
  /** F-17: flow-level illustration choice (null = auto per beat kind). */
  private illustration: IllustrationId | null = null;

  constructor(svg: SVGSVGElement, deps: AnimatorDeps) {
    this.svg = svg;
    this.player = deps.player;
    this.geometry = deps.geometry ?? domGeometry;
    this.motion = deps.motion ?? MOTION;
    this.reduced = deps.reducedMotion ?? false;
  }

  /** F-17: pick the illustration style for this flow (null = auto). */
  setIllustration(id: IllustrationId | null): void {
    this.illustration = id;
  }

  /** Prep the anim layer (world child). Called lazily; idempotent. Queried
   * (not cached) so a scene wipe (loadState re-render) self-heals. */
  private ensureLayer(): SVGGElement {
    const existing = this.svg.querySelector('.pc-anim-layer');
    if (existing !== null) return existing as SVGGElement;
    const layer = mkEl('g', 'pc-anim-layer');
    const world = this.svg.querySelector('.pc-world');
    (world ?? this.svg).appendChild(layer);
    return layer;
  }

  private findEl(id: string): Element | null {
    return this.svg.querySelector(`[data-id="${id}"]`);
  }

  /** Links of the beat including all par-lane sub-beats (concurrent travel). */
  private allLinks(beat: Beat): BeatLink[] {
    return [...beat.links, ...(beat.lanes ?? []).flat().flatMap((b) => b.links)];
  }

  private allActors(beat: Beat): string[] {
    return [...beat.actors, ...(beat.lanes ?? []).flat().flatMap((b) => b.actors)];
  }

  /** Play a beat: clears the previous one, applies dim/emphasis/visuals. */
  play(beat: Beat, ctx: BeatCtx): void {
    this.clearVisuals();
    for (const id of beat.dim) {
      const el = this.findEl(id);
      if (el !== null) {
        el.classList.add(this.previous.has(id) ? 'pc-dim-history' : 'pc-dim');
        this.dimmed.push(el);
      }
    }
    this.previous = new Set([
      ...this.allActors(beat),
      ...this.allLinks(beat).map((link) => link.linkId),
    ]);
    this.badge(beat, ctx);
    if (this.reduced) {
      // FR-F5: jump to end states — persistent emphasis, no movement
      for (const id of this.allActors(beat)) {
        const el = this.findEl(id);
        if (el !== null) {
          el.classList.add('pc-emph');
          this.emphasized.push(el);
        }
      }
      return;
    }
    const illu = resolveIllustration(this.illustration, beat.kind, this.allLinks(beat).length);
    if (illu === 'sequential-glow') this.rings(this.allActors(beat), ctx, 90);
    else this.rings(this.allActors(beat), ctx);
    this.applyIllustration(illu, beat, ctx);
  }

  /** F-17: draw the chosen illustration for this beat. */
  private applyIllustration(illu: IllustrationId, beat: Beat, ctx: BeatCtx): void {
    switch (illu) {
      case 'travel-token':
        for (const link of this.allLinks(beat)) this.travel(link, true);
        return;
      case 'trail-fade':
        for (const link of this.allLinks(beat)) this.travel(link, false);
        return;
      case 'sequential-glow':
        // the staggered glow is additive: the lane links still travel (FR-F4)
        for (const link of this.allLinks(beat)) this.travel(link, true);
        return;
      case 'packet-burst': {
        const first = this.allActors(beat)[0];
        if (first !== undefined) this.burst(first, ctx);
        return;
      }
      case 'compare-split': {
        const actors = this.allActors(beat);
        if (actors.length >= 2) this.split(actors[0]!, actors[1]!, ctx);
        return;
      }
      default:
        return; // pulse / sequential-glow: the rings already carry the beat
    }
  }

  /** F-17 packet-burst: six dots leave the actor's box and fade out. */
  private burst(id: string, ctx: BeatCtx): void {
    const r = ctx.rectOf(id);
    if (r === null) return;
    const layer = this.ensureLayer();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const dot = mkEl('circle', 'pc-burst');
      dot.setAttribute('r', '3');
      layer.appendChild(dot);
      this.player.animate(
        dot,
        [
          { transform: `translate(${cx}px, ${cy}px)`, opacity: 1 },
          {
            transform: `translate(${cx + Math.cos(angle) * 34}px, ${cy + Math.sin(angle) * 34}px)`,
            opacity: 0,
          },
        ],
        { durationMs: this.motion.ringMs, easing: 'ease-out' },
      );
    }
  }

  /** F-17 compare-split: a divider between the two alternatives. */
  private split(a: string, b: string, ctx: BeatCtx): void {
    const ra = ctx.rectOf(a);
    const rb = ctx.rectOf(b);
    if (ra === null || rb === null) return;
    const x = (ra.x + ra.w / 2 + rb.x + rb.w / 2) / 2;
    const top = Math.min(ra.y, rb.y) - 16;
    const bottom = Math.max(ra.y + ra.h, rb.y + rb.h) + 16;
    const line = mkEl('line', 'pc-split');
    line.setAttribute('x1', String(x));
    line.setAttribute('y1', String(top));
    line.setAttribute('x2', String(x));
    line.setAttribute('y2', String(bottom));
    this.ensureLayer().appendChild(line);
  }

  private clearVisuals(): void {
    for (const el of this.dimmed) el.classList.remove('pc-dim', 'pc-dim-history');
    for (const el of this.emphasized) el.classList.remove('pc-emph');
    this.dimmed = [];
    this.emphasized = [];
    this.ensureLayer().textContent = '';
  }

  /** Cancel nothing (CSS transitions finish naturally) but restore the scene. */
  stop(): void {
    this.clearVisuals();
    this.previous.clear();
  }

  private badge(beat: Beat, ctx: BeatCtx): void {
    const layer = this.ensureLayer();
    const g = mkEl('g', 'pc-badge');
    const first = this.allActors(beat)[0];
    const r = first === undefined ? null : ctx.rectOf(first);
    const x = r === null ? 24 : r.x - 14;
    const y = r === null ? 24 : r.y - 14;
    const c = mkEl('circle', 'pc-badge-dot');
    c.setAttribute('cx', String(x));
    c.setAttribute('cy', String(y));
    c.setAttribute('r', '11');
    const t = mkEl('text', 'pc-badge-num');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y + 4));
    t.setAttribute('text-anchor', 'middle');
    t.textContent = String(beat.index);
    g.appendChild(c);
    g.appendChild(t);
    layer.appendChild(g);
  }

  private rings(actors: string[], ctx: BeatCtx, staggerMs = 0): void {
    const layer = this.ensureLayer();
    actors.forEach((id, i) => {
      const r = ctx.rectOf(id);
      if (r === null) return;
      const ring = mkEl('rect', 'pc-ring');
      ring.setAttribute('x', String(r.x - 6));
      ring.setAttribute('y', String(r.y - 6));
      ring.setAttribute('width', String(r.w + 12));
      ring.setAttribute('height', String(r.h + 12));
      ring.setAttribute('rx', '12');
      layer.appendChild(ring);
      this.player.animate(
        ring,
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0.45, transform: 'scale(1.06)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { durationMs: this.motion.ringMs, easing: 'ease-in-out', delayMs: staggerMs * i },
      );
    });
  }

  /** Token circle + trailing dash glide along the resolved link path. */
  private travel(link: BeatLink, withToken = true): void {
    const layer = this.ensureLayer();
    const pathEl = this.svg.querySelector(`.pc-link[data-id="${link.linkId}"] .pc-route`);
    if (pathEl === null) return;
    const len = this.geometry.length(pathEl);
    const trailLen = Math.max(len * TRAIL_FRAC, 1);
    // trailing dash overlay (FR-F4): same d, dash segment slides with token
    const trail = mkEl('path', 'pc-trail');
    trail.setAttribute('d', pathEl.getAttribute('d') ?? '');
    trail.setAttribute('stroke-dasharray', `${trailLen} ${len + trailLen}`);
    layer.appendChild(trail);
    this.player.animate(
      trail,
      [
        { strokeDashoffset: len },
        { strokeDashoffset: -trailLen },
      ],
      { durationMs: this.motion.tokenMs, easing: 'linear' },
    );
    if (!withToken) return; // trail-fade: the dash is the whole illustration
    // token: sampled keyframes along the path geometry
    const token = mkEl('circle', 'pc-token');
    token.setAttribute('r', String(TOKEN_R));
    layer.appendChild(token);
    const kf: Keyframe[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const p = this.geometry.pointAt(pathEl, t * len);
      // flip reverses travel: sweep the path from the far end
      const q = link.flipped ? this.geometry.pointAt(pathEl, (1 - t) * len) : p;
      kf.push({ transform: `translate(${q.x}px, ${q.y}px)` });
    }
    this.player.animate(token, kf, { durationMs: this.motion.tokenMs, easing: 'linear' });
  }
}
