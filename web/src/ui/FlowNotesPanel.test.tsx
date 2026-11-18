// SPDX-License-Identifier: GPL-3.0-only
// Presentation notes are a labelled, non-modal aside: it never takes focus or
// covers the dock, and its presence refits the camera to the narrower canvas.
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentLayer } from './PresentDock';
import { FRESH, type FlowPlayerState } from './flows/flowController';
import type { FlowPlayerApi } from './flows/useFlowPlayer';

const state = (patch: Partial<FlowPlayerState>): FlowPlayerState => ({ ...FRESH, ...patch });

function player(st: FlowPlayerState, refit = vi.fn()): FlowPlayerApi {
  return {
    state: st,
    start: vi.fn(), exit: vi.fn(), pause: vi.fn(), resume: vi.fn(), replay: vi.fn(),
    restart: vi.fn(), stepTo: vi.fn(), playFrom: vi.fn(), choose: vi.fn(), refit,
    setRectProvider: vi.fn(),
  } as unknown as FlowPlayerApi;
}

describe('presentation notes aside', () => {
  afterEach(cleanup);

  it('shows a labelled non-modal aside only when enabled and non-empty', () => {
    const { container, rerender } = render(<PresentLayer player={player(state({
      status: 'playing',
      flowDescription: '# Notes\n**bold**',
      showFlowNotes: true,
    }))} />);
    const aside = screen.getByRole('complementary');
    expect(aside.getAttribute('aria-label')).toBe('Flow notes');
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Notes');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(aside.querySelector('[role="dialog"]')).toBeNull();

    rerender(<PresentLayer player={player(state({ status: 'playing', flowDescription: '# Notes', showFlowNotes: false }))} />);
    expect(screen.queryByRole('complementary')).toBeNull();
    rerender(<PresentLayer player={player(state({ status: 'playing', flowDescription: '   ', showFlowNotes: true }))} />);
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('keeps step prose separate from flow notes', async () => {
    render(<PresentLayer player={player(state({
      status: 'playing',
      description: 'current step narration',
      flowDescription: 'flow-level notes',
      showFlowNotes: true,
    }))} />);
    // The step's own prose lives in its own beside-the-drawing region now, not
    // in the dock and not in the flow notes aside.
    expect(screen.getByTestId('step-explanation').textContent).toContain('current step narration');
    const notes = screen.getByTestId('flow-notes-panel').textContent ?? '';
    expect(notes).toContain('flow-level notes');
    expect(notes).not.toContain('current step narration');
  });

  it('does not steal focus and refits when panel presence changes', async () => {
    const refit = vi.fn();
    const focused = document.createElement('button');
    document.body.append(focused);
    focused.focus();
    const p = player(state({ status: 'playing', flowDescription: 'notes', showFlowNotes: true }), refit);
    const { rerender, unmount } = render(<PresentLayer player={p} />);
    expect(document.activeElement).toBe(focused);
    await vi.waitFor(() => expect(refit).toHaveBeenCalledTimes(1));
    rerender(<PresentLayer player={player(state({ status: 'playing', flowDescription: 'notes', showFlowNotes: false }), refit)} />);
    await vi.waitFor(() => expect(refit).toHaveBeenCalledTimes(2));
    expect(document.activeElement).toBe(focused);
    unmount();
    focused.remove();
  });
});
