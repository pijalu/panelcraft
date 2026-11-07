// SPDX-License-Identifier: GPL-3.0-only
// M5-WP5 unit tests — play-mode transport (useFlowPlayer). Fully injected
// ports: fake clock, recording animator + camera, in-memory workspace text.
// Deterministic — no real timers (handover protocol c).
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/preact';
import { useFlowPlayer, type FlowPlayerDeps } from './useFlowPlayer';
import type { Clock } from '../../engine/anim/ports';
import type { FlowAnimator } from '../../engine/anim/engine';
import type { CameraController } from '../../engine/anim/camera';
import type { Beat } from '../../engine/flows/plan';
import type { BeatCtx } from '../../engine/anim/engine';

const DOC_A = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start"
  a -> b : "order"
  alt "how?" {
    "fast" { a -> b : "rush" }
    "slow" { process b }
  }
  conclusion "done"
}
`;

const DOC_B = `pcd 1.0

person u "User"

flow "Refund" as refund {
  intro "refund flow"
  process u
}
`;

/** Recording FlowAnimator double. */
const mkAnimator = () => {
  const played: number[] = [];
  let stops = 0;
  const anim = {
    play: (beat: Beat, _ctx: BeatCtx) => {
      played.push(beat.index);
    },
    stop: () => {
      stops += 1;
    },
  };
  return { anim: anim as unknown as FlowAnimator, played, stops: () => stops };
};

const mkCamera = () => {
  const focused: number[][] = [];
  let saved = 0;
  let restored = 0;
  const cam = {
    focus: (_rects: unknown[], _current: unknown) => focused.length,
    save: () => {
      saved += 1;
    },
    restoreSaved: () => {
      restored += 1;
    },
    snapTo: () => {},
  };
  return { cam: cam as unknown as CameraController, saved: () => saved, restored: () => restored };
};

/** Manual timer bank: tests advance the clock by hand. */
const mkClock = () => {
  let seq = 0;
  const timers = new Map<number, { fn: () => void }>();
  const clock: Clock = {
    now: () => 0,
    delay: (fn) => {
      seq += 1;
      timers.set(seq, { fn });
      return seq;
    },
    cancel: (t) => {
      timers.delete(t);
    },
  };
  return {
    clock,
    fireNext: () => {
      const first = [...timers.entries()][0];
      if (first === undefined) return false;
      timers.delete(first[0]);
      first[1].fn();
      return true;
    },
    pending: () => timers.size,
  };
};

function setup() {
  const files = new Map<string, string>([
    ['main.pcd', DOC_A],
    ['other.pcd', DOC_B],
  ]);
  const animator = mkAnimator();
  const camera = mkCamera();
  const clk = mkClock();
  const deps: FlowPlayerDeps = {
    textOf: (path) => files.get(path) ?? null,
    openFile: (path) => {
      opened.push(path);
    },
    animator: animator.anim,
    camera: camera.cam,
    clock: clk.clock,
    currentViewport: () => ({ x: 0, y: 0, k: 1 }),
  };
  const opened: string[] = [];
  const { result } = renderHook(() => useFlowPlayer(deps));
  act(() => {
    result.current.start('main.pcd', 'main');
  });
  return { result, animator, camera, clk, opened, files };
}

const startAt = (h: ReturnType<typeof setup>, i: number): void => {
  act(() => {
    h.result.current.stepTo(i);
  });
};

const fire = (h: ReturnType<typeof setup>): void => {
  act(() => {
    h.clk.fireNext();
  });
};

describe('useFlowPlayer transport (M5-WP5)', () => {
  let h: ReturnType<typeof setup>;
  beforeEach(() => {
    h = setup();
  });

  it('start saves the viewport, builds the plan, plays beat 1', () => {
    expect(h.camera.saved()).toBe(1);
    expect(h.animator.played).toEqual([1]);
    expect(h.result.current.state.status).toBe('playing');
    expect(h.result.current.state.narration).toBe('start');
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 5 });
    expect(h.clk.pending()).toBe(1);
  });

  it('auto-advances on the clock until the flow ends', () => {
    fire(h); // → beat 2
    fire(h); // → alt chooser (awaits choice, no timer)
    expect(h.result.current.state.awaitingChoice?.branches).toEqual(['fast', 'slow']);
    expect(h.clk.pending()).toBe(0);
  });

  it('choosing a branch continues into that branch', () => {
    startAt(h, 3); // park on the alt beat deterministically
    act(() => {
      h.result.current.choose(1); // "slow"
    });
    expect(h.result.current.state.awaitingChoice).toBeNull();
    expect(h.animator.played.at(-1)).toBe(4); // process b (branch 2's beat)
    expect(h.result.current.state.narration).toBe('Web');
  });

  it('stepTo parks anywhere (transport stepper, paused)', () => {
    startAt(h, 5);
    expect(h.result.current.state.status).toBe('paused');
    expect(h.result.current.state.progress).toEqual({ index: 5, total: 5 });
    expect(h.clk.pending()).toBe(0);
  });

  it('restart returns to beat 1 and clears choices', () => {
    startAt(h, 3);
    act(() => {
      h.result.current.choose(1);
    });
    act(() => {
      h.result.current.restart();
    });
    expect(h.animator.played.at(-1)).toBe(1);
    expect(h.result.current.state.status).toBe('playing');
    // choices cleared: reaching the alt again asks again
    fire(h);
    fire(h);
    expect(h.result.current.state.awaitingChoice).not.toBeNull();
  });

  it('exit stops the animator and restores the viewport', () => {
    act(() => {
      h.result.current.exit();
    });
    // start() cleans up with a stop, exit() stops again — 2 total
    expect(h.animator.stops()).toBe(2);
    expect(h.camera.restored()).toBe(1);
    expect(h.result.current.state.status).toBe('idle');
    expect(h.clk.pending()).toBe(0);
  });

  it('play/pause toggles the auto-advance timer', () => {
    act(() => {
      h.result.current.pause();
    });
    expect(h.result.current.state.status).toBe('paused');
    expect(h.clk.pending()).toBe(0);
    act(() => {
      h.result.current.resume();
    });
    expect(h.result.current.state.status).toBe('playing');
    expect(h.clk.pending()).toBe(1);
  });

  it('goto pushes a cross-file frame: opens the file, plays sub-plan, returns', () => {
    const files = h.files;
    files.set(
      'main.pcd',
      DOC_A.replace('conclusion "done"', 'goto "other.pcd#refund" return end\n  conclusion "done"'),
    );
    act(() => {
      h.result.current.exit();
    });
    act(() => {
      h.result.current.start('main.pcd', 'main');
    });
    // beats: 1 intro, 2 msg, 3 alt, 4 branch "fast", 5 goto, 6 conclusion
    startAt(h, 5);
    act(() => {
      h.result.current.resume(); // stepTo parks paused — restart the auto-advance
    });
    expect(h.opened).toEqual(['other.pcd']);
    expect(h.result.current.state.breadcrumb).toEqual(['Main']);
    expect(h.result.current.state.narration).toBe('refund flow');
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 2 });
    // walk to the end of the sub-plan → pops back to the parent, post-goto
    fire(h);
    expect(h.result.current.state.progress).toEqual({ index: 2, total: 2 });
    fire(h);
    expect(h.result.current.state.breadcrumb).toEqual([]);
    expect(h.result.current.state.narration).toBe('done');
    expect(h.result.current.state.progress).toEqual({ index: 6, total: 6 });
  });
});
