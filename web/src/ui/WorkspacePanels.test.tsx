// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only

import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropZone, PanelHost } from './WorkspacePanels';
import { Splitter } from './PanelChrome';

afterEach(cleanup);

function openPanelMenu(): void {
  fireEvent.click(screen.getByTestId('panel-menu-code'));
}

describe('UX-02 panel commands', () => {
  it('provides named keyboard docking alternatives and a distinct close command', () => {
    const onMove = vi.fn();
    const onClose = vi.fn();
    render(
      <PanelHost id="code" dock="right" onMove={onMove} onClose={onClose} onBounds={vi.fn()}>
        <p>Editor</p>
      </PanelHost>,
    );
    expect(screen.getByRole('button', { name: /Code panel\. Drag to move/ })).toBeTruthy();
    const trigger = screen.getByTestId('panel-menu-code');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    openPanelMenu();
    expect(screen.getByTestId('dock-code-right')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('dock-code-bottom'));
    expect(onMove).toHaveBeenCalledWith('code', 'bottom');
    openPanelMenu();
    fireEvent.click(screen.getByTestId('close-code'));
    expect(onClose).toHaveBeenCalledWith('code');
    expect(onClose).not.toHaveBeenCalledWith('code', 'collapsed');
  });

  it('closes the panel menu on Escape and returns focus to its trigger', () => {
    render(
      <PanelHost id="code" dock="right" onMove={vi.fn()} onClose={vi.fn()} onBounds={vi.fn()}>
        <p>Editor</p>
      </PanelHost>,
    );
    const trigger = screen.getByTestId('panel-menu-code');
    openPanelMenu();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByTestId('dock-code-bottom')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('drops a dragged panel into the target dock', () => {
    const onMove = vi.fn();
    render(<DropZone dock="left" onMove={onMove}>target</DropZone>);
    fireEvent.drop(screen.getByTestId('dock-left'), {
      dataTransfer: { getData: () => 'props' },
    });
    expect(onMove).toHaveBeenCalledWith('props', 'left');
  });

  it('keeps resize drags from starting a native panel drag', () => {
    render(<Splitter id="code" label="Resize Code panel" onResize={vi.fn()} />);
    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    screen.getByTestId('splitter-code').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
