// SPDX-License-Identifier: GPL-3.0-only
// Canvas context menu: canvas, object and edge actions at the pointer.
// Item 7 moved this onto the shared menu surface, so placement, internal
// scrolling, overflow cues, keyboard navigation (arrows/Home/End/submenus),
// Enter/Space, Escape/Tab dismissal and focus-visible styling are identical to
// the application menu instead of a second, weaker implementation.
import { FloatingMenu, type MenuEntry } from './Menu';
import { s } from './strings';

export interface MenuItem {
  label: string;
  /** Stable hook for tests and for command routing. */
  id: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** A titled group of items, shown as a submenu. */
export interface MenuGroup {
  label: string;
  id: string;
  items: MenuItem[];
}

export type ContextEntry = MenuItem | MenuGroup;

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextEntry[];
  onClose: () => void;
}

const isGroup = (entry: ContextEntry): entry is MenuGroup => 'items' in entry;

/** Map the canvas action model onto the shared menu entries. */
function toMenuEntries(items: ContextEntry[]): MenuEntry[] {
  return items.map((entry): MenuEntry => {
    if (isGroup(entry)) {
      return {
        kind: 'submenu',
        id: entry.id,
        label: entry.label,
        testId: `ctx-${entry.id}`,
        items: entry.items.map(toAction),
      };
    }
    return toAction(entry);
  });
}

function toAction(item: MenuItem): MenuEntry {
  return {
    kind: 'item',
    id: item.id,
    label: item.label,
    testId: `ctx-${item.id}`,
    ...(item.disabled === true ? { disabled: true } : {}),
    onSelect: item.onSelect,
  };
}

/** Floating menu at (x, y) in viewport coordinates. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  return (
    <FloatingMenu
      id="canvas-context"
      label={s('Canvas actions')}
      anchor={{ left: x, top: y }}
      items={toMenuEntries(items)}
      onClose={onClose}
      testId="context-menu"
    />
  );
}
