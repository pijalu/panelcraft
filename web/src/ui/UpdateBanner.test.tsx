// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: the update banner states one thing and offers two ranked actions.
// Restart is the primary affordance (it changes the running shell); Later only
// defers. The styling hook asserted here is what keeps that ranking visible —
// without it both buttons render identically and the banner reads as a choice
// between equals.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof UpdateBanner>[0]> = {}) {
  const onRestart = vi.fn();
  const onLater = vi.fn();
  render(<UpdateBanner unapplied={null} onRestart={onRestart} onLater={onLater} {...props} />);
  return { onRestart, onLater };
}

describe('UpdateBanner', () => {
  it('announces itself politely and offers both actions', () => {
    mount();
    const banner = screen.getByTestId('banner-update');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Update available');
    expect(screen.getByTestId('update-restart').textContent).toBe('Restart');
    expect(screen.getByTestId('update-later').textContent).toBe('Later');
  });

  it('ranks Restart above Later', () => {
    mount();
    expect(screen.getByTestId('update-restart').classList.contains('banner-primary')).toBe(true);
    expect(screen.getByTestId('update-later').classList.contains('banner-primary')).toBe(false);
  });

  it('names the file whose unapplied code the restart would discard', () => {
    mount({ unapplied: 'checkout.pcd' });
    const text = screen.getByTestId('banner-update').textContent ?? '';
    expect(text).toContain('checkout.pcd');
    expect(text).toContain('discarded');
  });

  it('reports which action the user chose', () => {
    const { onRestart, onLater } = mount();
    fireEvent.click(screen.getByTestId('update-restart'));
    expect(onRestart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('update-later'));
    expect(onLater).toHaveBeenCalledTimes(1);
  });
});
