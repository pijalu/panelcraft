// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Item 8: the file row menu must offer exactly the row's actions, target the
// row it was opened from, and give keyboard focus back to that row.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRowMenu, type RowMenuHandlers, type RowMenuTarget } from './fileRowMenu';

afterEach(cleanup);

/** A tree row plus the menu, the way FileTree wires them together. */
function Harness(props: { target: RowMenuTarget; handlers: RowMenuHandlers }) {
  const rowMenu = useRowMenu(props.handlers);
  const [opened, setOpened] = useState(0);
  return (
    <div>
      <ul>
        <li data-path={props.target.path}>
          <button type="button" class="tree-name" onClick={() => setOpened((n) => n + 1)}>
            {props.target.path}
          </button>
        </li>
      </ul>
      <button
        type="button"
        data-testid="open-menu"
        onClick={() =>
          rowMenu.open({ ...props.target, x: 10, y: 20 })
        }
      >
        open
      </button>
      <output data-testid="opened">{opened}</output>
      {rowMenu.node}
    </div>
  );
}

function handlers(): RowMenuHandlers {
  return { onOpen: vi.fn(), onDuplicate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() };
}

function open(target: RowMenuTarget, h = handlers()): { h: RowMenuHandlers; menu: HTMLElement } {
  render(<Harness target={target} handlers={h} />);
  fireEvent.click(screen.getByTestId('open-menu'));
  return { h, menu: screen.getByTestId('tree-context-menu') };
}

describe('file row context menu', () => {
  it('offers open, duplicate, rename and delete for a file', () => {
    open({ path: 'docs/a.pcd', kind: 'file' });
    const labels = ['open', 'duplicate', 'rename', 'delete'].map(
      (id) => screen.getByTestId(`tree-ctx-${id}`).textContent,
    );
    expect(labels).toEqual(['Open', 'Duplicate', 'Rename', 'Delete']);
  });

  it('offers only rename and delete for a folder (a folder has no copy)', () => {
    open({ path: 'docs', kind: 'folder' });
    expect(screen.queryByTestId('tree-ctx-open')).toBeNull();
    expect(screen.queryByTestId('tree-ctx-duplicate')).toBeNull();
    expect(screen.getByTestId('tree-ctx-rename')).toBeTruthy();
    expect(screen.getByTestId('tree-ctx-delete')).toBeTruthy();
  });

  it('routes every action to the row it was opened from and closes', () => {
    const h = handlers();
    open({ path: 'group/long-name.pcd', kind: 'file' }, h);
    fireEvent.click(screen.getByTestId('tree-ctx-duplicate'));
    expect(h.onDuplicate).toHaveBeenCalledWith('group/long-name.pcd');
    expect(h.onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tree-context-menu')).toBeNull();
  });

  it('returns focus to the row when the menu is dismissed', () => {
    open({ path: 'group/a.pcd', kind: 'file' });
    fireEvent.keyDown(screen.getByTestId('tree-context-menu'), { key: 'Escape' });
    expect(document.activeElement?.className).toBe('tree-name');
    expect(document.activeElement?.closest('[data-path]')?.getAttribute('data-path')).toBe('group/a.pcd');
  });

  it('keeps focus on the same row after an action, not on the document body', () => {
    const h = handlers();
    open({ path: 'a.pcd', kind: 'file' }, h);
    fireEvent.click(screen.getByTestId('tree-ctx-open'));
    expect(h.onOpen).toHaveBeenCalledWith('a.pcd');
    // The menu item is gone; focus must not fall through to <body>.
    expect(document.activeElement?.className).toBe('tree-name');
    expect(document.activeElement?.closest('[data-path]')?.getAttribute('data-path')).toBe('a.pcd');
  });
});
