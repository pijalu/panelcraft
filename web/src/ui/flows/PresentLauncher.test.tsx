// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13 unit tests — presentation launcher rows (title, purpose, step count,
// estimate), the empty state and the keyboard contract (focus + Escape).
// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { PresentLauncher } from './PresentLauncher';

afterEach(cleanup);

const ENTRIES = [
  {
    key: 'order',
    title: 'Order walkthrough',
    description: 'How an order reaches the shop',
    steps: 4,
    estimatedMs: 12_000,
  },
  { key: 'refund', title: 'Refunds', steps: 2, estimatedMs: 65_000 },
];

describe('PresentLauncher (UX08-WP13)', () => {
  it('lists each flow with title, purpose, step count and duration', () => {
    render(<PresentLauncher entries={ENTRIES} onPresent={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('launcher-title-order').textContent).toBe('Order walkthrough');
    expect(screen.getByTestId('launcher-desc-order').textContent).toBe(
      'How an order reaches the shop',
    );
    expect(screen.getByTestId('launcher-meta-order').textContent).toBe('4 steps, about 12 s');
    // a flow without prose renders no description line, only its meta
    expect(screen.queryByTestId('launcher-desc-refund')).toBeNull();
    expect(screen.getByTestId('launcher-meta-refund').textContent).toBe('2 steps, about 1 min 5 s');
  });

  it('uses the singular for a one-step flow', () => {
    render(<PresentLauncher entries={[ENTRIES[1]!]} onPresent={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('launcher-meta-refund').textContent).toBe('2 steps, about 1 min 5 s');
    cleanup();
    render(
      <PresentLauncher
        entries={[{ key: 'solo', title: 'Solo', steps: 1, estimatedMs: 4000 }]}
        onPresent={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('launcher-meta-solo').textContent).toBe('1 step, about 4 s');
  });

  it('presents the chosen flow', () => {
    const onPresent = vi.fn();
    render(<PresentLauncher entries={ENTRIES} onPresent={onPresent} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('launcher-flow-refund'));
    expect(onPresent).toHaveBeenCalledWith('refund');
  });

  it('explains an empty file instead of showing an empty list', () => {
    render(<PresentLauncher entries={[]} onPresent={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('launcher-empty').textContent).toContain('No flows in this file yet');
    expect(screen.queryByTestId('launcher-list')).toBeNull();
  });

  it('focuses the first flow and closes on Escape', () => {
    const onClose = vi.fn();
    render(<PresentLauncher entries={ENTRIES} onPresent={() => {}} onClose={onClose} />);
    expect(document.activeElement).toBe(screen.getByTestId('launcher-flow-order'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from the close button', () => {
    const onClose = vi.fn();
    render(<PresentLauncher entries={ENTRIES} onPresent={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('launcher-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
