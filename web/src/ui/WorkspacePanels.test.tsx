// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only

import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropZone, PanelHost, ViewMenu } from './WorkspacePanels';
import { Splitter } from './PanelChrome';
import { closePanel, defaultLayout } from './uiLayout';

afterEach(cleanup);

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
    expect(screen.getByTestId('dock-code-right')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('dock-code-bottom'));
    expect(onMove).toHaveBeenCalledWith('code', 'bottom');
    fireEvent.click(screen.getByTestId('close-code'));
    expect(onClose).toHaveBeenCalledWith('code');
    expect(onClose).not.toHaveBeenCalledWith('code', 'collapsed');
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

  it('reopens closed panels and resets layout from View', () => {
    const onOpen = vi.fn();
    const onReset = vi.fn();
    const layout = closePanel(defaultLayout(1600), 'sidebar');
    render(<ViewMenu layout={layout} onOpen={onOpen} onReset={onReset} />);
    fireEvent.click(screen.getByTestId('view-panel-sidebar'));
    fireEvent.click(screen.getByTestId('reset-workspace-layout'));
    expect(onOpen).toHaveBeenCalledWith('sidebar');
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('view-panel-palette')).toHaveProperty('disabled', true);
  });
});
