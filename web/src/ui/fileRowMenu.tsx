// SPDX-License-Identifier: GPL-3.0-only
// The file row context menu: the same actions as the row's inline buttons, on
// the shared menu surface. Long names used to push those buttons out of the
// panel, so the menu is the second way to reach them — it must not be a second
// menu implementation. Placement, internal scrolling, keyboard navigation and
// dismissal come from the same primitive as the canvas and application menus.
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ContextMenu, type ContextEntry } from './ContextMenu';
import { s } from './strings';

/** What the menu needs to know about the row it was opened from. */
export interface RowMenuTarget {
  path: string;
  kind: 'file' | 'folder' | 'document';
}

/** A row menu request: the target plus the viewport point to open at. */
export interface RowMenuRequest extends RowMenuTarget {
  x: number;
  y: number;
}

export interface RowMenuHandlers {
  onOpen: (path: string) => void;
  onDuplicate: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export interface RowMenu {
  /** Open for a row at a viewport point (pointer position or the row's box). */
  open: (request: RowMenuRequest) => void;
  /** The menu surface, or null while closed. Render it inside the tree. */
  node: ComponentChildren;
}

/**
 * The row's live control: the inline rename input once a rename starts, the name
 * button otherwise. Focus comes back here after the menu closes — closing alone
 * drops focus to the document body, which silently broke keyboard rename.
 */
function rowControl(path: string): HTMLElement | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-path]'));
  const row = rows.find((el) => el.dataset.path === path);
  return row?.querySelector<HTMLElement>('input, .tree-name') ?? null;
}

/** Build the entries for one row. Folders have no duplicate (they have no copy). */
function rowEntries(target: RowMenuTarget, handlers: RowMenuHandlers): ContextEntry[] {
  const { path, kind } = target;
  const items: ContextEntry[] = [];
  if (kind === 'file') {
    items.push({ id: 'open', label: s('Open'), onSelect: () => handlers.onOpen(path) });
    items.push({ id: 'duplicate', label: s('Duplicate'), onSelect: () => handlers.onDuplicate(path) });
  }
  items.push({ id: 'rename', label: s('Rename'), onSelect: () => handlers.onRename(path) });
  // Deleting is the same two-step confirmation as the inline button: the first
  // pick arms the row, the second one removes it.
  items.push({ id: 'delete', label: s('Delete'), onSelect: () => handlers.onDelete(path) });
  return items;
}

/** Row menu state plus its surface. */
export function useRowMenu(handlers: RowMenuHandlers): RowMenu {
  const [request, setRequest] = useState<RowMenuRequest | null>(null);

  const close = (): void => {
    const path = request?.path ?? '';
    setRequest(null);
    // Synchronous: a deferred focus would land after the next keystroke and lose
    // it to the document body. The row exists already, so nothing can steal it
    // back except the rename input, which focuses itself when it mounts.
    if (path !== '') rowControl(path)?.focus();
  };

  const node =
    request === null ? null : (
      <ContextMenu
        id="tree-context"
        label={s('File actions')}
        testId="tree-context-menu"
        itemTestIdPrefix="tree-ctx"
        x={request.x}
        y={request.y}
        items={rowEntries(request, handlers)}
        onClose={close}
      />
    );

  return { open: setRequest, node };
}
