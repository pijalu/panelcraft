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
  let pauses = 0;
  let resumes = 0;
  let settles = 0;
  const anim = {
    play: (beat: Beat, _ctx: BeatCtx) => {
      played.push(beat.index);
    },
    stop: () => {
      stops += 1;
    },
    pause: () => {
      pauses += 1;
    },
    resume: () => {
      resumes += 1;
    },
    settle: () => {
      settles += 1;
    },
  };
  return {
    anim: anim as unknown as FlowAnimator,
    played,
    stops: () => stops,
    pauses: () => pauses,
    resumes: () => resumes,
    settles: () => settles,
  };
};

const mkCamera = () => {
  const focused: number[][] = [];
  const intents: Array<Record<string, unknown>> = [];
  let saved = 0;
  let restored = 0;
  const cam = {
    focus: (_rects: unknown[], _current: unknown, intent?: Record<string, unknown>) => {
      intents.push(intent ?? {});
      return focused.length;
    },
    save: () => {
      saved += 1;
    },
    restoreSaved: () => {
      restored += 1;
    },
    snapTo: () => {},
  };
  return {
    cam: cam as unknown as CameraController,
    saved: () => saved,
    restored: () => restored,
    intents,
  };
};

/** Manual timer bank: tests advance the clock by hand. */
const mkClock = () => {
  let seq = 0;
  const timers = new Map<number, { fn: () => void }>();
  const delays: number[] = [];
  const clock: Clock = {
    now: () => 0,
    delay: (fn, ms) => {
      seq += 1;
      delays.push(ms);
      timers.set(seq, { fn });
      return seq;
    },
    cancel: (t) => {
      timers.delete(t);
    },
  };
  return {
    clock,
    delays,
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

function setup(doc = DOC_A) {
  const files = new Map<string, string>([
    ['main.pcd', doc],
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
    // A parked step must not keep animating while the dock says "paused":
    // the beat jumps to its settled state instead (item 9).
    expect(h.animator.settles()).toBeGreaterThan(0);
  });

  it('playFrom plays on from a beat instead of parking on it', () => {
    // The flow pane's per-step play button: animation runs and the timer is
    // armed, unlike the transport stepper (item 9).
    act(() => {
      h.result.current.playFrom(2);
    });
    expect(h.result.current.state.status).toBe('playing');
    expect(h.result.current.state.progress).toEqual({ index: 2, total: 5 });
    expect(h.animator.played.at(-1)).toBe(2);
    expect(h.clk.pending()).toBe(1);
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

  it('pause freezes the beat animation and resume continues it', () => {
    // A token that keeps travelling while the transport is paused is an orphan
    // animation (item 9).
    expect(h.animator.pauses()).toBe(0);
    act(() => {
      h.result.current.pause();
    });
    expect(h.animator.pauses()).toBe(1);
    act(() => {
      h.result.current.resume();
    });
    expect(h.animator.resumes()).toBe(1);
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

  // Replay cases live in the focused suite below.
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
      h.result.current.replay(); // parked step — restart this beat's animation/timer, not the goto
    });
    expect(h.opened).toEqual(['other.pcd']); // replay must not re-enter the goto
    expect(h.result.current.state.status).toBe('playing');
    expect(h.clk.pending()).toBe(1);
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

// Transport Play must replay the parked beat rather than continue a frozen
// animation. Same harness as above; split out to keep each suite reviewable.
describe('useFlowPlayer replay transport', () => {
  let h: ReturnType<typeof setup>;
  beforeEach(() => {
    h = setup();
  });

  it('pause then replay restarts the current beat with one full dwell timer', () => {
    const fullDwell = h.clk.delays[0];
    act(() => {
      h.result.current.pause();
    });
    const before = h.animator.played.length;
    act(() => {
      h.result.current.replay();
    });
    // A fresh current-beat animation, not a resumed one from mid-flight.
    expect(h.animator.played.length).toBe(before + 1);
    expect(h.animator.played.at(-1)).toBe(1);
    // Exactly one timer, and it is the beat's full dwell — not the leftover
    // time from before the pause (which would cut the replay short).
    expect(h.clk.delays).toHaveLength(2);
    expect(h.clk.delays[1]).toBe(fullDwell);
    expect(h.clk.pending()).toBe(1);
    expect(h.result.current.state.status).toBe('playing');
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 5 });
  });

  it('replay from a parked step keeps that beat and arms one timer', () => {
    startAt(h, 2);
    const before = h.animator.played.length;
    act(() => {
      h.result.current.replay();
    });
    expect(h.animator.played.length).toBe(before + 1);
    expect(h.animator.played.at(-1)).toBe(2);
    expect(h.result.current.state.progress).toEqual({ index: 2, total: 5 });
    expect(h.result.current.state.status).toBe('playing');
    expect(h.clk.pending()).toBe(1);
  });

  it('restart still returns to beat 1 and replay then repeats beat 1', () => {
    startAt(h, 3);
    act(() => {
      h.result.current.restart();
    });
    expect(h.animator.played.at(-1)).toBe(1);
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 5 });
    const before = h.animator.played.length;
    act(() => {
      h.result.current.replay();
    });
    expect(h.animator.played.length).toBe(before + 1);
    expect(h.animator.played.at(-1)).toBe(1);
    expect(h.clk.pending()).toBe(1);
  });

  it('replay after a natural end starts the flow over', () => {
    act(() => {
      h.result.current.start('other.pcd', 'refund');
    });
    fire(h);
    fire(h); // two-beat flow: timer closes the last frame
    expect(h.result.current.state.status).toBe('ended');
    const before = h.animator.played.length;
    act(() => {
      h.result.current.replay();
    });
    expect(h.animator.played.length).toBe(before + 1);
    expect(h.animator.played.at(-1)).toBe(1);
    expect(h.result.current.state.status).toBe('playing');
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 2 });
    expect(h.clk.pending()).toBe(1);
  });

  it('replay after exit is inert: no beat, no timer, still idle', () => {
    act(() => {
      h.result.current.exit();
    });
    const before = h.animator.played.length;
    act(() => {
      h.result.current.replay();
    });
    expect(h.animator.played).toHaveLength(before);
    expect(h.clk.pending()).toBe(0);
    expect(h.result.current.state.status).toBe('idle');
  });

  it('replay after a file change uses the new file, not the old beat', () => {
    act(() => {
      h.result.current.start('other.pcd', 'refund');
    });
    expect(h.result.current.state.narration).toBe('refund flow');
    const before = h.animator.played.length;
    act(() => {
      h.result.current.replay();
    });
    expect(h.animator.played.length).toBe(before + 1);
    expect(h.animator.played.at(-1)).toBe(1);
    expect(h.result.current.state.narration).toBe('refund flow');
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 2 });
    expect(h.clk.pending()).toBe(1);
  });
});

// UX08-WP13 — the runner hands the plan's camera intent to the camera port and
// publishes the step description next to the narration title.
const DOC_C = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Walk" as walk {
  intro "start"
  a -> b : "order" presentation {
    description "the order reaches the shop"
    camera focus (420, 180) zoom 1.5 duration 0
  }
  info "hold here" presentation {
    camera hold
  }
}
`;

const setupWalk = () => {
  const files = new Map<string, string>([['walk.pcd', DOC_C]]);
  const animator = mkAnimator();
  const camera = mkCamera();
  const clk = mkClock();
  const { result } = renderHook(() =>
    useFlowPlayer({
      textOf: (path) => files.get(path) ?? null,
      openFile: () => {},
      animator: animator.anim,
      camera: camera.cam,
      clock: clk.clock,
      currentViewport: () => ({ x: 0, y: 0, k: 1 }),
    }),
  );
  act(() => {
    result.current.start('walk.pcd', 'walk');
  });
  return { result, animator, camera, clk };
};

describe('presentation camera + description (UX08-WP13)', () => {
  it('publishes the step description beside the narration title', () => {
    const h = setupWalk();
    expect(h.result.current.state.narration).toBe('start');
    expect(h.result.current.state.description).toBe('');
    act(() => {
      h.result.current.stepTo(2);
    });
    expect(h.result.current.state.narration).toBe('order');
    expect(h.result.current.state.description).toBe('the order reaches the shop');
    act(() => {
      h.result.current.stepTo(3);
    });
    expect(h.result.current.state.description).toBe(''); // step without prose
  });

  it('hands each beat its resolved camera intent', () => {
    const h = setupWalk();
    expect(h.camera.intents[0]).toEqual({ mode: 'overview' });
    act(() => {
      h.result.current.stepTo(2);
    });
    expect(h.camera.intents.at(-1)).toEqual({
      mode: 'focus',
      x: 420,
      y: 180,
      zoom: 1.5,
      durationMs: 0,
    });
    act(() => {
      h.result.current.stepTo(3);
    });
    expect(h.camera.intents.at(-1)).toEqual({ mode: 'hold' });
  });

  it('refit re-applies the current framing without touching playback state', () => {
    const h = setupWalk();
    act(() => {
      h.result.current.stepTo(2);
    });
    const before = h.result.current.state;
    const calls = h.camera.intents.length;
    act(() => {
      h.result.current.refit();
    });
    expect(h.camera.intents.length).toBe(calls + 1);
    expect(h.camera.intents.at(-1)).toEqual({
      mode: 'focus',
      x: 420,
      y: 180,
      zoom: 1.5,
      durationMs: 0,
    });
    expect(h.result.current.state).toEqual(before);
  });

  it('restart re-applies the first beat camera; exit restores the viewport', () => {
    const h = setupWalk();
    act(() => {
      h.result.current.stepTo(3);
    });
    act(() => {
      h.result.current.restart();
    });
    expect(h.camera.intents.at(-1)).toEqual({ mode: 'overview' });
    act(() => {
      h.result.current.exit();
    });
    expect(h.camera.restored()).toBe(1);
    expect(h.result.current.state.description).toBe('');
  });
});

describe('click-driven advance (browser assessment round 3)', () => {
  it('cycles a click-driven beat until the transport advances explicitly', () => {
    const clickDoc = DOC_A.replace('intro "start"', 'intro "start" advance click');
    const h = setup(clickDoc);
    expect(h.animator.played).toEqual([1]);
    fire(h); // the beat loops instead of advancing to step 2
    expect(h.animator.played).toEqual([1, 1]);
    expect(h.result.current.state.progress).toEqual({ index: 1, total: 5 });
    const next = (h.result.current as unknown as { next?: () => void }).next;
    expect(typeof next).toBe('function');
    act(() => next!());
    expect(h.animator.played.at(-1)).toBe(2);
  });
});
