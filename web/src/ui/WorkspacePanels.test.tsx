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
      <PanelHost id="code" dock="right" onMove={onMove} onClose={onClose} onBounds={vi.fn()} onCollapse={vi.fn()}>
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
      <PanelHost id="code" dock="right" onMove={vi.fn()} onClose={vi.fn()} onBounds={vi.fn()} onCollapse={vi.fn()}>
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

describe('panel header chrome', () => {
  afterEach(cleanup);

  it('puts the collapse chevron in the title row, left of the panel actions', () => {
    const onCollapse = vi.fn();
    render(
      <PanelHost id="props" dock="right" onMove={vi.fn()} onClose={vi.fn()} onBounds={vi.fn()} onCollapse={onCollapse}>
        <p>Body</p>
      </PanelHost>,
    );
    const header = document.querySelector('.panel-host-header') as HTMLElement;
    const title = screen.getByTestId('panel-title-props');
    const chevron = screen.getByTestId('collapse-props');
    const actions = screen.getByTestId('panel-menu-props');
    // Same row as the title, and between the title and the overflow menu.
    expect(header.contains(chevron)).toBe(true);
    expect(chevron.getAttribute('aria-label')).toBe('Hide Properties panel');
    expect(title.compareDocumentPosition(chevron) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chevron.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The panel body no longer opens with a row of its own.
    expect(document.querySelector('.panel-host-content .panel-head')).toBeNull();

    fireEvent.click(chevron);
    expect(onCollapse).toHaveBeenCalledWith('props');
  });

  it('shows the panel explanation behind an info icon beside the title', () => {
    render(
      <PanelHost
        id="sidebar"
        dock="left"
        onMove={vi.fn()}
        onClose={vi.fn()}
        onBounds={vi.fn()}
        onCollapse={vi.fn()}
        info={{ text: 'Browser files live only in this browser.' }}
      >
        <p>Tree</p>
      </PanelHost>,
    );
    const trigger = screen.getByTestId('panel-info-sidebar');
    const description = document.getElementById(trigger.getAttribute('aria-describedby')!);
    expect(trigger.getAttribute('aria-label')).toBe('Files panel information');
    expect(description?.textContent).toBe('Browser files live only in this browser.');
    expect(trigger.getAttribute('title')).toBe('Browser files live only in this browser.');
    // The header carries it; the body holds no standing paragraph about it.
    expect(document.querySelector('.panel-host-header')?.contains(trigger)).toBe(true);
    expect(document.querySelector('.panel-host-content')?.textContent).not.toContain('live only in this browser');
  });
});
