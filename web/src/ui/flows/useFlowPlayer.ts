// SPDX-License-Identifier: GPL-3.0-only
// M5-WP5 — Preact binding for the FlowRunner playback executor. The runner
// owns playback state; this hook mirrors it into component state and keeps
// the injected ports fresh across renders.
import { useRef, useState } from 'preact/hooks';
import {
  FRESH,
  FlowRunner,
  type BeatPlayer,
  type CameraCam,
  type ControllerIO,
  type FlowPlayerState,
  type FlowRects,
} from './flowController';
import type { Clock } from '../../engine/anim/ports';
import type { Transform } from '../../engine/render/viewport';

export interface FlowPlayerDeps {
  /** File text lookup (workspace adapter); null when the file is absent. */
  textOf(path: string): string | null;
  /** Navigate to a file (goto cross-file). */
  openFile(path: string): void;
  animator: BeatPlayer;
  camera: CameraCam;
  clock: Clock;
  /** Pre-play viewport (saved for exit-restore, glide start point). */
  currentViewport(): Transform;
}

export interface FlowPlayerApi {
  state: FlowPlayerState;
  start(file: string, flowKey: string): void;
  exit(): void;
  pause(): void;
  resume(): void;
  /** Transport Play: replay the current beat from time zero. */
  replay(): void;
  /** Presentation click: advance even when a click-driven beat was cycling. */
  next(): void;
  restart(): void;
  stepTo(index1: number): void;
  /** Play on from a 1-based beat (the flow pane's per-step play button). */
  playFrom(index1: number): void;
  choose(branchIndex: number): void;
  /** UX08-WP13: recompute the current beat's framing for the current viewport. */
  refit(): void;
  setRectProvider(r: FlowRects): void;
  /** F-25 (peak-end): export the current canvas as SVG from the closing card. */
  exportSvg?: () => void;
}

export function useFlowPlayer(deps: FlowPlayerDeps): FlowPlayerApi {
  const [state, setState] = useState<FlowPlayerState>(FRESH);
  const setStateRef = useRef(setState);
  setStateRef.current = setState;

  const runnerRef = useRef<FlowRunner | null>(null);
  if (runnerRef.current === null) {
    const io: ControllerIO = {
      ...deps,
      publish: (patch) => setStateRef.current((s) => ({ ...s, ...patch })),
    };
    runnerRef.current = new FlowRunner(io);
  }
  const runner = runnerRef.current;
  // Keep ports fresh each render (App supplies memoized instances anyway).
  runner.io.animator = deps.animator;
  runner.io.camera = deps.camera;
  runner.io.clock = deps.clock;
  runner.io.textOf = deps.textOf;
  runner.io.openFile = deps.openFile;
  runner.io.currentViewport = deps.currentViewport;

  // Rebuilt each render so `state` is always fresh; runner methods are
  // stable-bound (single runner for the component lifetime).
  return {
    state,
    start: (file, flowKey) => runner.start(file, flowKey),
    exit: () => runner.exit(),
    pause: () => runner.pause(),
    resume: () => runner.resume(),
    replay: () => runner.replay(),
    next: () => runner.next(),
    restart: () => runner.restart(),
    stepTo: (index1) => runner.stepTo(index1),
    playFrom: (index1) => runner.playFrom(index1),
    choose: (branchIndex) => runner.choose(branchIndex),
    refit: () => runner.refit(),
    setRectProvider: (r) => runner.setRectProvider(r),
  };
}
