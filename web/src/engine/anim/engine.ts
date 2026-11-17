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
import { beatTimeline, type Endpoint, type PulseTimes, type SparkPass, type SparkTimes, type BeatTimeline } from './timeline';
import type { AnimHandle, AnimPlayer, Keyframe } from './ports';

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
  /** FR-F5: evaluated per beat so a media-query change takes effect live. */
  private readonly reducedAtMount: boolean;
  private dimmed: Element[] = [];
  private emphasized: Element[] = [];
  /** Immediately previous participants stay readable as narrative context. */
  private previous = new Set<string>();
  /** F-17: flow-level illustration choice (null = auto per beat kind). */
  private illustration: IllustrationId | null = null;
  /** Animations owned by the current beat. One session per play; the camera
   * shares the AnimPlayer port but is never part of it. */
  private session: AnimHandle[] = [];

  constructor(svg: SVGSVGElement, deps: AnimatorDeps) {
    this.svg = svg;
    this.player = deps.player;
    this.geometry = deps.geometry ?? domGeometry;
    this.motion = deps.motion ?? MOTION;
    this.reducedAtMount = deps.reducedMotion ?? false;
  }

  /** F-17: pick the illustration style for this flow (null = auto). */
  setIllustration(id: IllustrationId | null): void {
    this.illustration = id;
  }

  /** Reduced motion now: the injected value OR the live media query. */
  private reduced(): boolean {
    if (this.reducedAtMount) return true;
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
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

  /** Play a beat: cancel the previous beat's motion, clear visuals, then apply
   * dim/emphasis/visuals. Called again for replay and every step change. */
  play(beat: Beat, ctx: BeatCtx): void {
    this.cancelSession();
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
    if (this.reduced()) this.reducedEndState(beat, ctx);
    else this.motionForBeat(beat, ctx);
  }

  /** Reduced motion jumps to the settled frame: emphasis plus one token at
   * the last arrival endpoint, with no WAAPI animation at all. */
  private reducedEndState(beat: Beat, ctx: BeatCtx): void {
    for (const id of this.allActors(beat)) {
      const el = this.findEl(id);
      if (el !== null) {
        el.classList.add('pc-emph');
        this.emphasized.push(el);
      }
    }
    for (const link of this.allLinks(beat)) {
      const el = this.findEl(link.linkId);
      if (el === null) continue;
      el.classList.add('pc-emph');
      this.emphasized.push(el);
      this.staticToken(link, ctx);
    }
  }

  /** Non-reduced visuals. Link-bearing travel illustrations use the shared
   * timeline; static illustrations keep the plain actor rings. */
  private motionForBeat(beat: Beat, ctx: BeatCtx): void {
    const links = this.allLinks(beat);
    const illu = resolveIllustration(this.illustration, beat.kind, links.length);
    const timelineStyles = illu !== 'pulse' && illu !== 'packet-burst' && illu !== 'compare-split';
    if (links.length > 0 && timelineStyles) {
      for (const link of links) {
        this.sequencedLink(link, beat.delayMs, ctx, illu !== 'trail-fade');
      }
      return;
    }
    this.rings(this.allActors(beat), ctx, illu === 'sequential-glow' ? 90 : 0);
    this.applyIllustration(illu, beat, ctx);
  }

  /** F-17: draw the chosen illustration for this beat. */
  private applyIllustration(illu: IllustrationId, beat: Beat, ctx: BeatCtx): void {
    switch (illu) {
      case 'travel-token':
      case 'trail-fade':
      case 'sequential-glow':
        // These travel illustrations are driven by beatTimeline in play();
        // the border pulses now belong to that same sequence.
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

  /** Reduced motion: the token, already arrived, at the connector's endpoint. */
  private staticToken(link: BeatLink, ctx: BeatCtx): void {
    const pathEl = this.svg.querySelector(`.pc-link[data-id="${link.linkId}"] .pc-route`);
    if (pathEl === null) return;
    const len = this.geometry.length(pathEl);
    // Reduced motion shows the final visible state of the same timeline: one
    // settled token at the last arrival endpoint, plus static emphasis.
    const timeline = beatTimeline({ dwellMs: this.motion.stepDelayMs, count: link.sparks, speed: link.speed, bidir: link.bidir, distance: len });
    const endpoint = timeline.sparks[0]!.finalTo;
    const geometry = this.linkGeometry(pathEl, len, link, ctx);
    const p = this.geometry.pointAt(pathEl, endpoint === 'from' ? geometry.fromDist : geometry.toDist);
    const token = mkEl('circle', 'pc-token pc-token-static');
    token.setAttribute('r', String(TOKEN_R));
    token.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    this.ensureLayer().appendChild(token);
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
      this.track(this.player.animate(
        dot,
        [
          { transform: `translate(${cx}px, ${cy}px)`, opacity: 1 },
          {
            transform: `translate(${cx + Math.cos(angle) * 34}px, ${cy + Math.sin(angle) * 34}px)`,
            opacity: 0,
          },
        ],
        { durationMs: this.motion.ringMs, easing: 'ease-out' },
      ));
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

  private track(handle: AnimHandle): void {
    this.session.push(handle);
  }

  /** Cancel exactly the animations this animator created for the last beat.
   * Detached WAAPI animations must not stay registered; camera glides must. */
  private cancelSession(): void {
    for (const handle of this.session) handle.cancel();
    this.session = [];
  }

  /** Cancel nothing (CSS transitions finish naturally) but restore the scene. */
  stop(): void {
    this.cancelSession();
    this.clearVisuals();
    this.previous.clear();
    // And remove the emptied layer: leaving one behind after playback is an
    // orphan element that accumulates across presentations.
    this.svg.querySelector('.pc-anim-layer')?.remove();
  }

  /** Transport pause: freeze the beat's motion, do not remove it. */
  pause(): void {
    this.player.pauseAll?.();
  }

  /** Transport resume: continue what pause froze. */
  resume(): void {
    this.player.resumeAll?.();
  }

  /** Parked step (transport stepper / progress dot): show the beat's settled
   * state at once. The transport reports "paused", so nothing may still be
   * moving — the token is left at its endpoint instead (item 9). */
  settle(): void {
    this.player.finishAll?.();
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
    // CSS gives .pc-badge-num text-anchor: middle and dominant-baseline:
    // central, so x/y are the glyph box centre. Put the number exactly on
    // the dot's centre; an extra offset pushes it low inside the circle.
    t.setAttribute('y', String(y));
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
      this.track(this.player.animate(
        ring,
        [
          { opacity: 0, transform: 'scale(1)', offset: 0 },
          { opacity: 1, transform: 'scale(1.06)', offset: 0.5 },
          { opacity: 0, transform: 'scale(1)', offset: 1 },
        ],
        { durationMs: this.motion.ringMs, easing: 'ease-in-out', delayMs: staggerMs * i },
      ));
    });
  }

  /** Which end of the drawn path is `link.from`? Compare path endpoints with
   * the resolved actor rectangles — a step may reverse a link without `flip`,
   * so the written direction, not the ring order, decides the travel. */
  private linkGeometry(
    pathEl: Element,
    len: number,
    link: BeatLink,
    ctx: BeatCtx,
  ): { fromDist: number; toDist: number } {
    const fromRect = ctx.rectOf(link.from);
    const toRect = ctx.rectOf(link.to);
    if (fromRect !== null && toRect !== null) {
      const p0 = this.geometry.pointAt(pathEl, 0);
      const p1 = this.geometry.pointAt(pathEl, len);
      const dist = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }): number =>
        (p.x - r.x - r.w / 2) ** 2 + (p.y - r.y - r.h / 2) ** 2;
      const fromAtStart =
        dist(p0, fromRect) + dist(p1, toRect) <= dist(p0, toRect) + dist(p1, fromRect);
      if (fromAtStart) return { fromDist: 0, toDist: len };
      return { fromDist: len, toDist: 0 };
    }
    return link.flipped ? { fromDist: len, toDist: 0 } : { fromDist: 0, toDist: len };
  }

  private endpointId(link: BeatLink, endpoint: Endpoint): string {
    return endpoint === 'from' ? link.from : link.to;
  }

  /** One border pulse: invisible at rest, expanded at the peak, invisible
   * again at rest. Scheduled on the shared timeline, never at t=0 en masse. */
  private pulse(
    layer: SVGGElement,
    link: BeatLink,
    ctx: BeatCtx,
    sparkIndex: number,
    pass: SparkPass,
    times: PulseTimes,
    role: 'source-pulse' | 'target-pulse',
  ): void {
    const id = this.endpointId(link, times.actor);
    const r = ctx.rectOf(id);
    if (r === null) return;
    const ring = mkEl('rect', 'pc-ring');
    ring.setAttribute('data-role', role);
    ring.setAttribute('data-link', link.linkId);
    ring.setAttribute('data-spark', String(sparkIndex));
    ring.setAttribute('data-pass', String(pass.index));
    ring.setAttribute('data-actor-id', id);
    ring.setAttribute('x', String(r.x - 6));
    ring.setAttribute('y', String(r.y - 6));
    ring.setAttribute('width', String(r.w + 12));
    ring.setAttribute('height', String(r.h + 12));
    ring.setAttribute('rx', '12');
    layer.appendChild(ring);
    this.track(this.player.animate(
      ring,
      [
        { opacity: 0, transform: 'scale(1)', offset: 0 },
        { opacity: 1, transform: 'scale(1.06)', offset: 0.5 },
        { opacity: 0, transform: 'scale(1)', offset: 1 },
      ],
      { durationMs: times.end - times.start, easing: 'ease-in-out', delayMs: times.start },
    ));
  }

  /** One moving spark per logical spark: every bidirectional pass is a leg of
   * the same element, invisible across the border pulses between legs. */
  private sparkGlyph(
    layer: SVGGElement,
    pathEl: Element,
    link: BeatLink,
    spark: SparkTimes,
    geometry: { fromDist: number; toDist: number },
  ): void {
    const token = mkEl('circle', 'pc-token');
    token.setAttribute('r', String(TOKEN_R));
    token.setAttribute('data-role', 'spark');
    token.setAttribute('data-link', link.linkId);
    token.setAttribute('data-spark', String(spark.index));
    layer.appendChild(token);
    const last = spark.passes.at(-1)!;
    const lastPoint = this.geometry.pointAt(
      pathEl,
      geometry[last.travel.to === 'from' ? 'fromDist' : 'toDist'],
    );
    const duration = last.target.end - spark.start;
    const gap = Math.min(1, duration * 0.02);
    const kf: Keyframe[] = [];
    for (const pass of spark.passes) {
      const fromPoint = this.geometry.pointAt(pathEl, geometry[pass.travel.from === 'from' ? 'fromDist' : 'toDist']);
      const toPoint = this.geometry.pointAt(pathEl, geometry[pass.travel.to === 'from' ? 'fromDist' : 'toDist']);
      const frame = (at: number, p: { x: number; y: number }, opacity: number): Keyframe => ({
        offset: Math.min(1, Math.max(0, (at - spark.start) / duration)),
        transform: `translate(${p.x}px, ${p.y}px)`,
        opacity,
      });
      kf.push(frame(pass.source.start, fromPoint, 0));
      kf.push(frame(pass.source.peak, fromPoint, 1));
      kf.push(frame(pass.travel.arrival, toPoint, 1));
      kf.push(frame(pass.travel.arrival + gap, toPoint, 0));
    }
    kf.push({
      offset: 1,
      transform: `translate(${lastPoint.x}px, ${lastPoint.y}px)`,
      opacity: 0,
    });
    this.track(this.player.animate(token, kf, {
      durationMs: duration,
      easing: 'linear',
      delayMs: spark.start,
    }));
  }

  /** The settled token appears at the last arrival and stays for the rest of
   * the beat (and under a parked transport), so the arrival remains visible. */
  private arrivalToken(
    layer: SVGGElement,
    pathEl: Element,
    link: BeatLink,
    timeline: BeatTimeline,
    spark: SparkTimes,
    geometry: { fromDist: number; toDist: number },
  ): void {
    const last = spark.passes.at(-1)!;
    const p = this.geometry.pointAt(pathEl, geometry[last.travel.to === 'from' ? 'fromDist' : 'toDist']);
    const token = mkEl('circle', 'pc-token pc-token-arrival');
    token.setAttribute('data-role', 'arrival-token');
    token.setAttribute('data-link', link.linkId);
    token.setAttribute('data-spark', String(spark.index));
    token.setAttribute('r', String(TOKEN_R));
    token.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    token.setAttribute('opacity', '0');
    layer.appendChild(token);
    this.track(this.player.animate(
      token,
      [{ opacity: 0 }, { opacity: 1 }],
      {
        durationMs: Math.max(0.01, Math.min(1, timeline.settleMs || 1)),
        easing: 'linear',
        delayMs: last.target.start,
        fill: 'forwards',
      },
    ));
  }

  /** The historical neon dash follows the first one-way spark only. */
  private trail(
    layer: SVGGElement,
    pathEl: Element,
    timeline: BeatTimeline,
    len: number,
  ): void {
    const first = timeline.sparks[0];
    if (first === undefined) return;
    const pass = first.passes[0]!;
    const trailLen = Math.max(len * TRAIL_FRAC, 1);
    const trail = mkEl('path', 'pc-trail');
    trail.setAttribute('data-role', 'trail');
    trail.setAttribute('d', pathEl.getAttribute('d') ?? '');
    trail.setAttribute('stroke-dasharray', `${trailLen} ${len + trailLen}`);
    layer.appendChild(trail);
    this.track(this.player.animate(
      trail,
      [
        { opacity: 1, strokeDashoffset: len },
        { opacity: 0, strokeDashoffset: -trailLen },
      ],
      {
        durationMs: timeline.travelMs,
        easing: 'linear',
        delayMs: pass.source.peak,
      },
    ));
  }

  /** Drive one link's border pulses, sparks and trail from one numeric beat. */
  private sequencedLink(
    link: BeatLink,
    dwellMs: number,
    ctx: BeatCtx,
    withToken: boolean,
  ): void {
    const pathEl = this.svg.querySelector(`.pc-link[data-id="${link.linkId}"] .pc-route`);
    if (pathEl === null) return;
    const len = this.geometry.length(pathEl);
    const timeline = beatTimeline({
      dwellMs,
      count: link.sparks,
      speed: link.speed,
      bidir: link.bidir,
      distance: len,
      motion: { ringMs: this.motion.ringMs, tokenMs: this.motion.tokenMs },
    });
    const geometry = this.linkGeometry(pathEl, len, link, ctx);
    const layer = this.ensureLayer();
    for (const spark of timeline.sparks) {
      for (const pass of spark.passes) {
        this.pulse(layer, link, ctx, spark.index, pass, pass.source, 'source-pulse');
        this.pulse(layer, link, ctx, spark.index, pass, pass.target, 'target-pulse');
      }
      if (withToken) {
        this.sparkGlyph(layer, pathEl, link, spark, geometry);
        this.arrivalToken(layer, pathEl, link, timeline, spark, geometry);
      }
    }
    if (timeline.sparks.length === 1 && link.bidir !== true) {
      this.trail(layer, pathEl, timeline, len);
    }
  }

}
