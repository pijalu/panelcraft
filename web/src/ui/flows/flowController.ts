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
  type BeatCamera,
  type FlowResolver,
  type PlaybackPlan,
} from '../../engine/flows/plan';
import { parsePDL } from '../../engine/format/parser';
import type { BeatCtx } from '../../engine/anim/engine';
import type { Clock } from '../../engine/anim/ports';
import type { Rect, Transform } from '../../engine/render/viewport';
import type { Doc, Flow } from '../../engine/model/types';
import { findFlow } from './derivedFlow';

/** Rect lookup the owner (canvas) supplies for actor emphasis/camera. */
export interface FlowRects {
  rectOf(id: string): Rect | null;
}

/** Narrow animator port — the real FlowAnimator satisfies it. */
export interface BeatPlayer {
  play(beat: Beat, ctx: BeatCtx): void;
  stop(): void;
  /** Freeze the current beat's animation (transport pause). */
  pause(): void;
  /** Continue the frozen beat animation. */
  resume(): void;
  /** Show the beat's settled state at once (parked step, no motion). */
  settle(): void;
}

/** Narrow camera port — the real CameraController satisfies it. */
export interface CameraCam {
  focus(rects: Rect[], current: Transform, intent?: BeatCamera): void;
  save(t: Transform): void;
  restoreSaved(current: Transform): void;
}

export interface FlowPlayerState {
  status: 'idle' | 'playing' | 'paused' | 'ended';
  /** Authored id of the flow being played, null for derived/title-only flows.
   *  A fact for the shell to publish as a link, never a URL policy here. */
  flowId: string | null;
  narration: string;
  /** one-line prose of the current step (UX08-WP13; '' when none) */
  description: string;
  /** Authored flow-level Markdown source (never rendered HTML). */
  flowDescription: string;
  /** The current beat's framing prose, when it is an introduction or conclusion.
   *  Distinct from flow notes and from a step description: one owner per surface. */
  framing: { kind: 'intro' | 'conclusion'; text: string } | null;
  /** True only when flow notes exist and their presentation flag is set. */
  showFlowNotes: boolean;
  breadcrumb: string[]; // titles of the frames above the current one
  awaitingChoice: AltInfo | null;
  progress: { index: number; total: number } | null;
}

/** Fully-reset player state (idle). */
export const FRESH: FlowPlayerState = {
  status: 'idle',
  flowId: null,
  narration: '',
  description: '',
  flowDescription: '',
  framing: null,
  showFlowNotes: false,
  breadcrumb: [],
  awaitingChoice: null,
  progress: null,
};

/**
 * Flow-level notes are a distinct playback fact: they never replace the
 * current step's one-line description, including on the closing card.
 */
function notesOf(flow?: Flow): Pick<FlowPlayerState, 'flowDescription' | 'showFlowNotes'> {
  const source = flow?.descriptionLines?.join('\n') ?? flow?.description ?? '';
  return {
    flowDescription: source,
    showFlowNotes: flow?.presentation === true && source.trim() !== '',
  };
}

/** A framing beat's prose, for the presentation popover. */
function framingOf(beat: Beat): FlowPlayerState['framing'] {
  if (beat.kind !== 'intro' && beat.kind !== 'conclusion') return null;
  return beat.title.trim() === '' ? null : { kind: beat.kind, text: beat.title };
}

/** Panel visibility: one predicate shared by the shell class and the layer. */
export function flowNotesVisible(state: FlowPlayerState): boolean {
  return state.showFlowNotes && state.flowDescription.trim() !== '';
}

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
  /** Where to start again when Play follows a natural end (the frame stack is
   * empty by then). Cleared on exit so an idle runner cannot restart itself. */
  private origin: { file: string; flowKey: string } | null = null;
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

  /** Parse `text`, then resolve the flow: authored first, else the derived one. */
  private findFlow(text: string | null, key: string): { doc: Doc; flow: Flow } | null {
    const { doc } = text === null ? { doc: null } : parsePDL(text);
    if (doc === null) return null;
    // Item 10: a link-only file presents through its derived default flow.
    const flow = findFlow(doc, key);
    return flow === null ? null : { doc, flow };
  }

  /** Execute the current frame's beat. `nav=false` skips goto navigation. */
  private runBeat(nav = true): void {
    const f = this.frame();
    const beat = f.plan.beats[f.index];
    if (beat === undefined) return;
    this.io.animator.play(beat, this.rects);
    // UX08-WP13: the plan resolved the camera intent; the port only executes it
    this.io.camera.focus(
      beat.cameraIds.map((id) => this.rects.rectOf(id)).filter((r): r is Rect => r !== null),
      this.io.currentViewport(),
      beat.camera,
    );
    this.io.publish({
      narration: beat.title,
      description: beat.description ?? '',
      framing: framingOf(beat),
      ...notesOf(f.flow),
      progress: { index: f.index + 1, total: f.plan.beats.length },
      awaitingChoice: null,
    });
    if (nav && beat.kind === 'alt') this.awaitChoice(beat);
    else if (nav && beat.kind === 'goto') this.enterGoto(f, beat);
    else if (beat.advance === 'click') this.scheduleCycle(beat.delayMs);
    else this.scheduleAdvance(beat.delayMs);
  }

  private awaitChoice(beat: Beat): void {
    this.cancelTimer();
    // The chooser parks the flow: nothing may keep moving behind a dialog.
    this.io.animator.settle();
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

  private scheduleCycle(ms: number): void {
    this.cancelTimer();
    this.timer = this.io.clock.delay(() => {
      this.timer = null;
      this.replay();
    }, ms);
  }

  /** Presentation click: leave a click-driven beat and play the next one. */
  next(): void {
    if (this.stack.length === 0) return;
    this.cancelTimer();
    this.advance();
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
        description: '',
        framing: null,
        ...notesOf(done?.flow),
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
      this.io.animator.settle();
      this.io.publish({ status: 'paused' }); // loop checkpoint awaits transport
      return;
    }
    this.advance(); // resume after the goto step
  }

  /** Re-apply the current beat's camera to the CURRENT viewport (UX08-WP13).
   * Entering presentation mode resizes the canvas, so the framing computed for
   * the editor size must be recomputed or the beat drifts off-centre. Playback
   * state, timer and animation are untouched. */
  refit(): void {
    const f = this.stack.at(-1);
    const beat = f?.plan.beats[f.index];
    if (beat === undefined) return;
    this.io.camera.focus(
      beat.cameraIds.map((id) => this.rects.rectOf(id)).filter((r): r is Rect => r !== null),
      this.io.currentViewport(),
      beat.camera,
    );
  }

  start(file: string, flowKey: string): void {
    this.cancelTimer();
    this.io.animator.stop();
    this.origin = { file, flowKey };
    this.stack = [];
    this.choices = {};
    this.io.camera.save(this.io.currentViewport());
    const found = this.findFlow(this.io.textOf(file), flowKey);
    if (found === null) return;
    const plan = buildPlan({ doc: found.doc, flow: found.flow });
    const authoredId = found.doc.flows.includes(found.flow) ? found.flow.id ?? null : null;
    this.stack.push({
      plan,
      doc: found.doc,
      flow: found.flow,
      index: 0,
      file,
      returnTo: -1,
      retHere: false,
    });
    this.io.publish({ ...FRESH, status: 'playing', flowId: authoredId, ...notesOf(found.flow) });
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
    // ...and it really is parked: the beat jumps to its settled state, because a
    // dock that says "paused" while a token still travels is the wrong report.
    this.io.animator.settle();
    this.io.publish({ status: 'paused' });
  }

  /** Play on from a 1-based beat (the flow pane's per-step play button): the
   * beat runs with its animation and auto-advance, unlike a parked step. */
  playFrom(index1: number): void {
    if (this.stack.length === 0) return;
    this.cancelTimer();
    const f = this.frame();
    f.index = Math.max(0, Math.min(f.plan.beats.length - 1, index1 - 1));
    this.io.publish({ status: 'playing' });
    this.runBeat();
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
    if (this.stack.length === 0) {
      this.replay(); // natural end: start the last flow over
      return;
    }
    this.choices = {};
    this.frame().index = 0;
    this.io.publish({ ...FRESH, status: 'playing', breadcrumb: this.breadcrumbOf() });
    this.runBeat();
  }

  pause(): void {
    this.cancelTimer();
    // The transport froze the beat, so the beat's animation freezes with it —
    // a token that keeps travelling while paused is an orphan (item 9).
    this.io.animator.pause();
    this.io.publish({ status: 'paused' });
  }

  /** Transport Play: replay the current beat from time zero. This is not the
   * low-level `resume` (continue a frozen animation): a paused or parked beat
   * gets a fresh animation and exactly one full-duration advance timer. The
   * beat's goto/alt navigation is not re-entered. */
  replay(): void {
    if (this.stack.length === 0) {
      if (this.origin !== null) {
        const { file, flowKey } = this.origin;
        this.start(file, flowKey);
      }
      return; // exited (no origin): Play has nothing to replay
    }
    const f = this.frame();
    const beat = f.plan.beats[f.index];
    // An open chooser must stay parked until a branch is picked.
    if (beat === undefined || beat.kind === 'alt') return;
    this.cancelTimer();
    this.io.publish({ status: 'playing' });
    this.runBeat(false);
  }

  resume(): void {
    const beat = this.frame().plan.beats[this.frame().index];
    if (beat === undefined) return;
    this.io.publish({ status: 'playing' });
    this.io.animator.resume();
    this.scheduleAdvance(beat.delayMs);
  }

  exit(): void {
    this.cancelTimer();
    this.io.animator.stop();
    this.io.camera.restoreSaved(this.io.currentViewport());
    this.stack = [];
    this.origin = null;
    this.io.publish({ ...FRESH });
  }
}
