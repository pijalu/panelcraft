// SPDX-License-Identifier: GPL-3.0-only
// The framing explanation is the introduction or conclusion prose of the flow,
// rendered from the safe Markdown renderer in a non-modal popover. It is its own
// surface: not the flow notes, not a step description, never a dialog, and never
// covering the narration card it explains.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentLayer } from './PresentDock';
import { FRESH, type FlowPlayerState } from './flows/flowController';
import type { FlowPlayerApi } from './flows/useFlowPlayer';

const state = (patch: Partial<FlowPlayerState>): FlowPlayerState => ({ ...FRESH, ...patch });

function player(st: FlowPlayerState): FlowPlayerApi {
  return {
    state: st,
    start: vi.fn(), exit: vi.fn(), pause: vi.fn(), resume: vi.fn(), replay: vi.fn(),
    restart: vi.fn(), stepTo: vi.fn(), playFrom: vi.fn(), choose: vi.fn(), refit: vi.fn(),
    setRectProvider: vi.fn(),
  } as unknown as FlowPlayerApi;
}

const intro = (text = '# Before we start\n\nThe story runs **left to right**.'): FlowPlayerState =>
  state({ status: 'playing', narration: 'Before we start', framing: { kind: 'intro', text } });

describe('framing explanation popover', () => {
  afterEach(async () => {
    cleanup();
    // Preact defers effect cleanup to a macrotask; drain it before jsdom teardown.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('renders the framing prose as Markdown, not plain narration', () => {
    render(<PresentLayer player={player(intro())} />);
    const pop = screen.getByTestId('framing-popover');
    expect(pop.getAttribute('data-kind')).toBe('intro');
    expect(pop.querySelector('h3')?.textContent).toBe('Before we start');
    expect(pop.querySelector('strong')?.textContent).toBe('left to right');
    expect(pop.getAttribute('role')).toBe('note');
    // Non-modal: no dialog role and no backdrop element.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows nothing for a step that has no framing prose', () => {
    render(<PresentLayer player={player(state({
      status: 'playing',
      narration: 'order',
      framing: null,
    }))} />);
    expect(screen.queryByTestId('framing-popover')).toBeNull();
    expect(screen.queryByTestId('framing-popover-open')).toBeNull();
  });

  it('closes on the close button', () => {
    render(<PresentLayer player={player(intro())} />);
    expect(screen.getByTestId('framing-popover')).not.toBeNull();
    fireEvent.click(screen.getByTestId('framing-popover-close'));
    expect(screen.queryByTestId('framing-popover')).toBeNull();
  });

  it('leaves Escape to the presentation exit shortcut', () => {
    render(<PresentLayer player={player(intro())} />);
    // Escape exits the presentation, so the popover must not swallow it. The
    // keyboard dismissal is the close button instead.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(false);
    expect(screen.getByTestId('framing-popover')).not.toBeNull();
  });

  it('closes on a pointer press elsewhere in the page', () => {
    render(<PresentLayer player={player(intro())} />);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('framing-popover')).toBeNull();
  });

  it('stays open when the press lands inside the popover', () => {
    render(<PresentLayer player={player(intro())} />);
    fireEvent.pointerDown(screen.getByTestId('framing-popover'));
    expect(screen.getByTestId('framing-popover')).not.toBeNull();
  });

  it('reopens from the dock after dismissal', () => {
    render(<PresentLayer player={player(intro())} />);
    const toggle = screen.getByTestId('framing-popover-open');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('framing-popover')).toBeNull();
    expect(screen.getByTestId('framing-popover-open').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByTestId('framing-popover-open'));
    expect(screen.getByTestId('framing-popover')).not.toBeNull();
  });

  it('keeps the framing prose separate from flow notes and the step description', () => {
    render(<PresentLayer player={player(state({
      status: 'playing',
      narration: 'Before we start',
      framing: { kind: 'intro', text: 'framing prose' },
      flowDescription: 'flow-level notes',
      showFlowNotes: true,
      description: 'step description',
    }))} />);
    expect(screen.getByTestId('framing-popover').textContent).toContain('framing prose');
    const notes = screen.getByTestId('flow-notes-panel').textContent ?? '';
    expect(notes).toContain('flow-level notes');
    expect(notes).not.toContain('framing prose');
    expect(screen.getByTestId('step-explanation').textContent).toContain('step description');
    expect(screen.getByTestId('step-explanation').textContent).not.toContain('flow-level notes');
  });

  it('labels a conclusion as such', () => {
    render(<PresentLayer player={player(state({
      status: 'playing',
      narration: 'Done',
      framing: { kind: 'conclusion', text: 'That is all.' },
    }))} />);
    const pop = screen.getByTestId('framing-popover');
    expect(pop.getAttribute('data-kind')).toBe('conclusion');
    expect(pop.getAttribute('aria-label')).toBe('Conclusion');
  });
});
