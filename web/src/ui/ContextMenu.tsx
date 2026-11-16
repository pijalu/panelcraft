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
  /** Element id of the surface; defaults to the canvas menu's id. */
  id?: string;
  /** Accessible name of the surface. */
  label?: string;
  /** `data-testid` of the surface. */
  testId?: string;
  /** Prefix for the per-entry test ids (`<prefix>-<entry id>`). */
  itemTestIdPrefix?: string;
}

const isGroup = (entry: ContextEntry): entry is MenuGroup => 'items' in entry;

/** Map the context action model onto the shared menu entries. */
function toMenuEntries(items: ContextEntry[], prefix: string): MenuEntry[] {
  return items.map((entry): MenuEntry => {
    if (isGroup(entry)) {
      return {
        kind: 'submenu',
        id: entry.id,
        label: entry.label,
        testId: `${prefix}-${entry.id}`,
        items: entry.items.map((item) => toAction(item, prefix)),
      };
    }
    return toAction(entry, prefix);
  });
}

function toAction(item: MenuItem, prefix: string): MenuEntry {
  return {
    kind: 'item',
    id: item.id,
    label: item.label,
    testId: `${prefix}-${item.id}`,
    ...(item.disabled === true ? { disabled: true } : {}),
    onSelect: item.onSelect,
  };
}

/**
 * Floating menu at (x, y) in viewport coordinates. The canvas and the file tree
 * share one surface: only the element id, accessible name and test ids differ,
 * so placement, scrolling, keyboard and dismissal cannot drift between them.
 */
export function ContextMenu(props: ContextMenuProps) {
  return (
    <FloatingMenu
      id={props.id ?? 'canvas-context'}
      label={props.label ?? s('Canvas actions')}
      anchor={{ left: props.x, top: props.y }}
      items={toMenuEntries(props.items, props.itemTestIdPrefix ?? 'ctx')}
      onClose={props.onClose}
      testId={props.testId ?? 'context-menu'}
    />
  );
}
