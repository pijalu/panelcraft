// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniMap } from './MiniMap';
import type { Snapshot } from './CanvasController';

const snapshot: Snapshot = {
  objects: [
    { id: 'a', kind: 'system', x: 0, y: 0, w: 100, h: 60 },
    { id: 'b', kind: 'system', x: 600, y: 300, w: 100, h: 60 },
  ],
  links: [{ id: 'L1', from: 'a', to: 'b' }],
  selection: { objects: [], links: [] },
  viewport: { x: 0, y: 0, k: 1 },
};

function mount() {
  const controller = { centerOn: vi.fn(), panBy: vi.fn(), fitDiagram: vi.fn() };
  render(<MiniMap snapshot={snapshot} controller={controller} viewSize={{ w: 800, h: 600 }} />);
  return controller;
}

afterEach(cleanup);

describe('accessible mini-map', () => {
  it('exposes a named navigation control and a viewport indicator', () => {
    mount();
    expect(screen.getByRole('button', { name: /mini-map navigation/i })).toBeTruthy();
    expect(screen.getByTestId('mini-map-viewport')).toBeTruthy();
    expect(screen.getByTestId('mini-map-canvas')).toBeTruthy();
  });

  it('centers the diagram at the clicked canvas location', () => {
    const controller = mount();
    const button = screen.getByTestId('mini-map');
    button.getBoundingClientRect = () => ({ left: 0, top: 0, width: 180, height: 120 }) as DOMRect;
    fireEvent.click(button, { clientX: 90, clientY: 60, detail: 1 });
    expect(controller.centerOn).toHaveBeenCalledTimes(1);
    expect(Number.isFinite(controller.centerOn.mock.calls[0]?.[0].x)).toBe(true);
  });

  it('supports keyboard panning and fit-to-diagram', () => {
    const controller = mount();
    const button = screen.getByTestId('mini-map');
    fireEvent.keyDown(button, { key: 'ArrowRight' });
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.keyDown(button, { key: 'Home' });
    expect(controller.panBy).toHaveBeenNthCalledWith(1, -40, 0);
    expect(controller.panBy).toHaveBeenNthCalledWith(2, 0, -40);
    expect(controller.fitDiagram).toHaveBeenCalledTimes(1);
  });
});
