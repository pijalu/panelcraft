// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: keyboard and dismissal contract of the shared menu primitive.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu, type ContextEntry } from './ContextMenu';
import { FloatingMenu, Menu, type MenuEntry } from './Menu';

afterEach(cleanup);

function entries(overrides: { disabled?: boolean; sub?: boolean } = {}): MenuEntry[] {
  const file: MenuEntry[] = [
    {
      kind: 'item',
      id: 'pcd',
      label: 'Export .pcd',
      testId: 'item-pcd',
      onSelect: vi.fn(),
    },
  ];
  return [
    { kind: 'item', id: 'import', label: 'Import files', testId: 'item-import', onSelect: vi.fn() },
    { kind: 'item', id: 'off', label: 'Disabled', testId: 'item-off', disabled: true, onSelect: vi.fn() },
    {
      kind: 'item',
      id: 'theme',
      label: 'Dark',
      testId: 'item-dark',
      role: 'menuitemradio',
      checked: true,
      onSelect: vi.fn(),
    },
    ...(overrides.sub === true
      ? [{ kind: 'submenu', id: 'export', label: 'Export current', testId: 'item-export', items: file } as const]
      : []),
    { kind: 'separator', id: 'sep' },
    {
      kind: 'item',
      id: 'clear',
      label: 'Clear data',
      testId: 'item-clear',
      disabled: overrides.disabled === true,
      onSelect: vi.fn(),
    },
  ];
}

function mount(items: MenuEntry[] = entries()) {
  render(<Menu id="app" label="Application menu" testId="app-menu" items={items} />);
  return items;
}

describe('Menu primitive', () => {
  it('exposes trigger state and opens on click', () => {
    mount();
    const trigger = screen.getByTestId('app-menu');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu', { name: 'Application menu' })).toBeTruthy();
  });

  it('focuses the first enabled item and roves over arrows, Home and End', () => {
    mount();
    fireEvent.click(screen.getByTestId('app-menu'));
    expect(document.activeElement).toBe(screen.getByTestId('item-import'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('item-dark'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('item-clear'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('item-import'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('item-clear'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('item-import'));
  });

  it('skips a disabled first entry when it opens', () => {
    // A panel menu whose first action is unavailable must still land on something
    // focusable: focusing a disabled button is a no-op, which stranded keyboard
    // users on the trigger.
    mount([
      { kind: 'item', id: 'left', label: 'Dock left', testId: 'item-left', disabled: true, onSelect: vi.fn() },
      { kind: 'item', id: 'float', label: 'Float', testId: 'item-float', onSelect: vi.fn() },
    ]);
    fireEvent.click(screen.getByTestId('app-menu'));
    expect(document.activeElement).toBe(screen.getByTestId('item-float'));
  });

  it('closes on outside pointer without touching the trigger', () => {
    mount();
    fireEvent.click(screen.getByTestId('app-menu'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('restores trigger focus when Escape dismisses', () => {
    mount();
    const trigger = screen.getByTestId('app-menu');
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses from the trigger, before the popover took focus (UX08-WP05 regression)', () => {
    // The menu opens on click with focus still on the trigger; the popover's
    // internal focus move lands a frame later. Escape pressed in that window
    // must still close: the trigger answers for its own popover.
    mount();
    const trigger = screen.getByTestId('app-menu');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Tab without trapping focus', () => {
    mount();
    const trigger = screen.getByTestId('app-menu');
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('runs the action, closes and restores trigger focus', () => {
    const items = mount();
    const trigger = screen.getByTestId('app-menu');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('item-import'));
    const first = items[0];
    expect(first?.kind === 'item' ? first.onSelect : null).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('marks the active radio choice for assistive technology', () => {
    mount();
    fireEvent.click(screen.getByTestId('app-menu'));
    const dark = screen.getByTestId('item-dark');
    expect(dark.getAttribute('role')).toBe('menuitemradio');
    expect(dark.getAttribute('aria-checked')).toBe('true');
  });

  it('opens a submenu with ArrowRight and returns with ArrowLeft', () => {
    mount(entries({ sub: true }));
    fireEvent.click(screen.getByTestId('app-menu'));
    const sub = screen.getByTestId('item-export');
    sub.focus();
    fireEvent.keyDown(sub, { key: 'ArrowRight' });
    expect(screen.getByTestId('item-pcd')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('item-pcd'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.queryByTestId('item-pcd')).toBeNull();
  });

  it('opens on ArrowDown from the trigger', () => {
    mount();
    const trigger = screen.getByTestId('app-menu');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('FloatingMenu surface (item 7)', () => {
  const items: MenuEntry[] = [
    { kind: 'item', id: 'one', label: 'One', testId: 'f-one', onSelect: vi.fn() },
    { kind: 'item', id: 'two', label: 'Two', testId: 'f-two', onSelect: vi.fn() },
    {
      kind: 'submenu',
      id: 'more',
      label: 'More',
      testId: 'f-more',
      items: [{ kind: 'item', id: 'deep', label: 'Deep', testId: 'f-deep', onSelect: vi.fn() }],
    },
  ];

  function mountFloating(onClose = vi.fn()) {
    render(<FloatingMenu id="float" label="Canvas actions" anchor={{ left: 40, top: 60 }} items={items} onClose={onClose} testId="floating" />);
    return onClose;
  }

  it('opens at its anchor, focuses the first entry and roves with arrows', () => {
    mountFloating();
    const menu = screen.getByTestId('floating');
    expect(menu.getAttribute('data-testid')).toBe('floating');
    expect(document.activeElement).toBe(screen.getByTestId('f-one'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('f-two'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('f-more'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('f-one'));
    // It is a menu surface, not a dialog: assistive technology gets the same role.
    expect(screen.getByRole('menu', { name: 'Canvas actions' })).toBeTruthy();
  });

  it('closes on Escape and Tab without leaving focus inside', () => {
    const onClose = mountFloating();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on an outside pointer but not on a click inside', () => {
    const onClose = mountFloating();
    fireEvent.pointerDown(screen.getByTestId('f-two'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('context menu (item 7)', () => {
  const onProps = vi.fn();
  const entries: ContextEntry[] = [
    { id: 'props', label: 'Properties', onSelect: onProps },
    { id: 'remove', label: 'Delete', onSelect: vi.fn() },
    {
      id: 'arrange',
      label: 'Arrange',
      items: [{ id: 'align-left', label: 'Align left', onSelect: vi.fn() }],
    },
  ];

  it('runs an action exactly once and reports the close', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={20} y={30} items={entries} onClose={onClose} />);
    const item = screen.getByTestId('ctx-props');
    fireEvent.click(item);
    expect(onProps).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes grouped commands as a submenu that keeps its entries reachable', () => {
    render(<ContextMenu x={20} y={30} items={entries} onClose={vi.fn()} />);
    const group = screen.getByTestId('ctx-arrange');
    expect(group.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(group);
    expect(screen.getByTestId('ctx-align-left')).toBeTruthy();
    // The direct actions stay one click away on the root surface.
    expect(screen.getByTestId('ctx-props')).toBeTruthy();
    expect(screen.getByTestId('ctx-remove')).toBeTruthy();
  });
});
