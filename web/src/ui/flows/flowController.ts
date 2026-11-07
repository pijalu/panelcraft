// SPDX-License-Identifier: GPL-3.0-only
// M5-WP5 — flow playback executor (SPEC §4.5 FR-F1..F6). UI-agnostic state
// machine over a frame stack: plans come from buildPlan (plan.ts), navigation
// from the goto grammar (FILE-FORMAT §6). All timing flows through the Clock
// port; all rendering through BeatPlayer/CameraCam ports — injectable, so
// tests drive it with a fake clock and recording doubles (no real timers).
// Cross-file goto pushes a frame and calls openFile; `return here` replays
// the goto beat's visual once (loop checkpoint) and pauses (see M5.md).
import {
  buildPlan,
  type AltInfo,
  type Beat,
  type FlowResolver,
  type PlaybackPlan,
} from '../../engine/flows/plan';
import { parsePDL } from '../../engine/format/parser';
import type { BeatCtx } from '../../engine/anim/engine';
import type { Clock } from '../../engine/anim/ports';
import type { Rect, Transform } from '../../engine/render/viewport';
import type { Doc, Flow } from '../../engine/model/types';

/** Rect lookup the owner (canvas) supplies for actor emphasis/camera. */
export interface FlowRects {
  rectOf(id: string): Rect | null;
}

/** Narrow animator port — the real FlowAnimator satisfies it. */
export interface BeatPlayer {
  play(beat: Beat, ctx: BeatCtx): void;
  stop(): void;
}

/** Narrow camera port — the real CameraController satisfies it. */
export interface CameraCam {
  focus(rects: Rect[], current: Transform): void;
  save(t: Transform): void;
  restoreSaved(current: Transform): void;
}

export interface FlowPlayerState {
  status: 'idle' | 'playing' | 'paused' | 'ended';
  narration: string;
  breadcrumb: string[]; // titles of the frames above the current one
  awaitingChoice: AltInfo | null;
  progress: { index: number; total: number } | null;
}

/** Fully-reset player state (idle). */
export const FRESH: FlowPlayerState = {
  status: 'idle',
  narration: '',
  breadcrumb: [],
  awaitingChoice: null,
  progress: null,
};

interface Frame {
  plan: PlaybackPlan;
  doc: Doc;
  flow: Flow;
  index: number; // 0-based
  file: string;
  /** Parent plan index of the goto beat that pushed this frame (-1 = root). */
  returnTo: number;
  retHere: boolean;
}

export interface ControllerIO {
  publish(patch: Partial<FlowPlayerState>): void;
  animator: BeatPlayer;
  camera: CameraCam;
  clock: Clock;
  /** File text lookup (workspace adapter); null when the file is absent. */
  textOf(path: string): string | null;
  /** Navigate to a file (goto cross-file). */
  openFile(path: string): void;
  /** Pre-play viewport (saved for exit-restore, glide start point). */
  currentViewport(): Transform;
}

/** Playback executor. One instance per mounted player. */
export class FlowRunner {
  private stack: Frame[] = [];
  private choices: Record<string, number> = {};
  private timer: number | null = null;
  private rects: FlowRects = { rectOf: () => null };
  constructor(readonly io: ControllerIO) {}

  setRectProvider(r: FlowRects): void {
    this.rects = r;
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.io.clock.cancel(this.timer);
    this.timer = null;
  }

  private frame(): Frame {
    const f = this.stack.at(-1);
    if (f === undefined) throw new Error('playback frame stack empty');
    return f;
  }

  private breadcrumbOf(): string[] {
    return this.stack.slice(0, -1).map((f) => f.plan.flowTitle);
  }

  /** Parse `text`, find the flow by id then title. */
  private findFlow(text: string | null, key: string): { doc: Doc; flow: Flow } | null {
    const { doc } = text === null ? { doc: null } : parsePDL(text);
    if (doc === null) return null;
    const flow =
      doc.flows.find((fl) => fl.id === key) ?? doc.flows.find((fl) => fl.title === key) ?? null;
    return flow === null ? null : { doc, flow };
  }

  /** Execute the current frame's beat. `nav=false` skips goto navigation. */
  private runBeat(nav = true): void {
    const f = this.frame();
    const beat = f.plan.beats[f.index];
    if (beat === undefined) return;
    this.io.animator.play(beat, this.rects);
    this.io.camera.focus(
      beat.actors
        .map((id) => this.rects.rectOf(id))
        .filter((r): r is Rect => r !== null),
      this.io.currentViewport(),
    );
    this.io.publish({
      narration: beat.title,
      progress: { index: f.index + 1, total: f.plan.beats.length },
      awaitingChoice: null,
    });
    if (nav && beat.kind === 'alt') this.awaitChoice(beat);
    else if (nav && beat.kind === 'goto') this.enterGoto(f, beat);
    else this.scheduleAdvance(beat.delayMs);
  }

  private awaitChoice(beat: Beat): void {
    this.cancelTimer();
    const alts =
      this.frame().plan.alts.find((a) => a.path === String(beat.index)) ?? null;
    this.io.publish({ status: 'paused', awaitingChoice: alts });
  }

  private enterGoto(parent: Frame, beat: Beat): void {
    const g = beat.goto;
    if (g === undefined) return;
    this.cancelTimer();
    const target = g.file ?? parent.file;
    const found = this.findFlow(this.io.textOf(target), g.flow);
    if (found === null) {
      this.io.publish({ status: 'paused' }); // dangling goto (validation flags it)
      return;
    }
    const plan = buildPlan({
      doc: found.doc,
      flow: found.flow,
      choices: this.choices,
      resolveFlow: g.file === undefined ? this.sameFileResolver(parent) : undefined,
    });
    if (g.file !== undefined && g.file !== parent.file) this.io.openFile(g.file);
    this.stack.push({
      plan,
      doc: found.doc,
      flow: found.flow,
      index: 0,
      file: target,
      returnTo: parent.index,
      retHere: g.ret === 'here',
    });
    this.io.publish({ breadcrumb: this.breadcrumbOf() });
    this.runBeat();
  }

  /** Same-file goto titles resolve against the parent frame's doc. */
  private sameFileResolver(f: Frame): FlowResolver {
    return (file, key) => {
      if (file !== undefined) return null;
      const fl = f.doc.flows.find((x) => x.id === key) ?? f.doc.flows.find((x) => x.title === key);
      return fl === undefined ? null : { title: fl.title ?? fl.id };
    };
  }

  private scheduleAdvance(ms: number): void {
    this.cancelTimer();
    this.timer = this.io.clock.delay(() => {
      this.timer = null;
      this.advance();
    }, ms);
  }

  private advance(): void {
    const f = this.frame();
    if (f.index + 1 >= f.plan.beats.length) this.finishFrame();
    else {
      f.index += 1;
      this.runBeat();
    }
  }

  private finishFrame(): void {
    const done = this.stack.pop();
    if (done === undefined || this.stack.length === 0) {
      this.cancelTimer();
      this.io.animator.stop();
      const total = done?.plan.beats.length ?? 0;
      this.io.publish({
        status: 'ended',
        narration: done === undefined ? '' : done.plan.flowTitle,
        breadcrumb: [],
        progress: done === undefined ? null : { index: total, total },
      });
      return;
    }
    const parent = this.frame();
    parent.index = done.returnTo;
    this.io.publish({ breadcrumb: this.breadcrumbOf() });
    if (done.retHere) {
      this.runBeat(false); // replay the goto beat's visual, no re-navigation
      this.cancelTimer();
      this.io.publish({ status: 'paused' }); // loop checkpoint awaits transport
      return;
    }
    this.advance(); // resume after the goto step
  }

  start(file: string, flowKey: string): void {
    this.cancelTimer();
    this.io.animator.stop();
    this.stack = [];
    this.choices = {};
    this.io.camera.save(this.io.currentViewport());
    const found = this.findFlow(this.io.textOf(file), flowKey);
    if (found === null) return;
    const plan = buildPlan({ doc: found.doc, flow: found.flow });
    this.stack.push({
      plan,
      doc: found.doc,
      flow: found.flow,
      index: 0,
      file,
      returnTo: -1,
      retHere: false,
    });
    this.io.publish({ ...FRESH, status: 'playing' });
    this.runBeat();
  }

  /** Transport stepper: jump to a 1-based beat and park (no auto-advance). */
  stepTo(index1: number): void {
    if (this.stack.length === 0) return;
    this.cancelTimer();
    const f = this.frame();
    f.index = Math.max(0, Math.min(f.plan.beats.length - 1, index1 - 1));
    this.runBeat();
    this.cancelTimer(); // stepping parks: no auto-advance
    this.io.publish({ status: 'paused' });
  }

  /** Answer the current alt chooser; rebuilds the plan with the choice. */
  choose(branchIndex: number): void {
    const f = this.frame();
    const beat = f.plan.beats[f.index];
    if (beat?.kind !== 'alt') return;
    this.choices[String(beat.index)] = branchIndex;
    f.plan = buildPlan({ doc: f.doc, flow: f.flow, choices: this.choices });
    this.io.publish({ awaitingChoice: null, status: 'playing' });
    this.advance();
  }

  restart(): void {
    this.choices = {};
    this.frame().index = 0;
    this.io.publish({ ...FRESH, status: 'playing', breadcrumb: this.breadcrumbOf() });
    this.runBeat();
  }

  pause(): void {
    this.cancelTimer();
    this.io.publish({ status: 'paused' });
  }

  resume(): void {
    const beat = this.frame().plan.beats[this.frame().index];
    if (beat === undefined) return;
    this.io.publish({ status: 'playing' });
    this.scheduleAdvance(beat.delayMs);
  }

  exit(): void {
    this.cancelTimer();
    this.io.animator.stop();
    this.io.camera.restoreSaved(this.io.currentViewport());
    this.stack = [];
    this.io.publish({ ...FRESH });
  }
}
