// SPDX-License-Identifier: GPL-3.0-only
// Transport replay regression: every "Play" surface must ask the runner to
// replay the parked beat, not resume a frozen animation. The runner owns the
// semantics; these tests keep the dock, play bar and keyboard from diverging.
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentDock } from './PresentDock';
import { PlayBar } from './flows/PlayBar';
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import { FRESH } from './flows/flowController';
import { applyPresentAction } from './usePresentKeys';

type FakePlayer = FlowPlayerApi & { replay: ReturnType<typeof vi.fn> };

const fakePlayer = (): FakePlayer =>
  ({
    state: { ...FRESH, status: 'paused', progress: { index: 2, total: 5 } },
    start: vi.fn(),
    exit: vi.fn(),
    pause: vi.fn(),
    replay: vi.fn(),
    resume: vi.fn(),
    restart: vi.fn(),
    stepTo: vi.fn(),
    playFrom: vi.fn(),
    choose: vi.fn(),
    refit: vi.fn(),
    setRectProvider: vi.fn(),
  }) as unknown as FakePlayer;

const expectReplayNotResume = (p: FakePlayer): void => {
  expect(p.replay).toHaveBeenCalledOnce();
  expect(p.resume).not.toHaveBeenCalled();
};

describe('Play surfaces replay the parked beat', () => {
  afterEach(cleanup);

  it('presentation dock Play asks the runner to replay', () => {
    const p = fakePlayer();
    render(<PresentDock player={p} />);
    fireEvent.click(screen.getByTestId('present-toggle'));
    expectReplayNotResume(p);
  });

  it('play bar Play uses the same runner operation', () => {
    const p = fakePlayer();
    render(<PlayBar player={p} />);
    fireEvent.click(screen.getByTestId('pb-toggle'));
    expectReplayNotResume(p);
  });

  it('presentation keyboard toggle uses the same runner operation', () => {
    const p = fakePlayer();
    applyPresentAction(p, 'toggle');
    expectReplayNotResume(p);
  });

  it('playing surfaces still pause, not replay', () => {
    const p = fakePlayer();
    p.state = { ...p.state, status: 'playing' };
    render(<PresentDock player={p} />);
    fireEvent.click(screen.getByTestId('present-toggle'));
    expect(p.pause).toHaveBeenCalledOnce();
    expect(p.replay).not.toHaveBeenCalled();
  });
});
