// SPDX-License-Identifier: GPL-3.0-only
// Canvas context menu contents (F-19): derives the available commands from the
// controller's selection so the menu never offers a no-op. Item 7 groups the
// advanced arrangement commands behind one submenu: the common actions
// (Properties, Duplicate, Copy, Paste, Delete) stay one click away, while
// align/distribute/equal-size — mostly disabled unless several objects are
// selected — no longer compete with them for attention.
import type { CanvasController } from './CanvasController';
import { s } from './strings';
import { ContextMenu, type ContextEntry, type MenuItem, type MenuGroup } from './ContextMenu';

export interface CanvasMenuProps {
  ctrl: CanvasController;
  x: number;
  y: number;
  /** Object count in the current selection (menu enablement). */
  selectionCount: number;
  /** Link count in the current selection (UX08-WP08: inspect exactly one). */
  linkCount?: number;
  onClose: () => void;
}

/** The six alignments, in reading order (used by the Arrange submenu). */
function alignItems(ctrl: CanvasController, enabled: boolean): MenuItem[] {
  return [
    { id: 'align-left', label: s('Align left'), onSelect: () => ctrl.alignSelected('left'), disabled: !enabled },
    { id: 'align-center-x', label: s('Align centre (horizontal)'), onSelect: () => ctrl.alignSelected('centerX'), disabled: !enabled },
    { id: 'align-right', label: s('Align right'), onSelect: () => ctrl.alignSelected('right'), disabled: !enabled },
    { id: 'align-top', label: s('Align top'), onSelect: () => ctrl.alignSelected('top'), disabled: !enabled },
    { id: 'align-center-y', label: s('Align middle (vertical)'), onSelect: () => ctrl.alignSelected('centerY'), disabled: !enabled },
    { id: 'align-bottom', label: s('Align bottom'), onSelect: () => ctrl.alignSelected('bottom'), disabled: !enabled },
    { id: 'distribute-x', label: s('Distribute horizontally'), onSelect: () => ctrl.distributeSelected('x'), disabled: ctrl.snapshot.selection.objects.length < 3 },
    { id: 'distribute-y', label: s('Distribute vertically'), onSelect: () => ctrl.distributeSelected('y'), disabled: ctrl.snapshot.selection.objects.length < 3 },
    { id: 'equal-size', label: s('Equal size'), onSelect: () => ctrl.equalSizeSelected(), disabled: !enabled },
  ];
}

/** Objects, edges, canvas: direct commands, then one Arrange group. */
export function CanvasMenu({ ctrl, x, y, selectionCount, linkCount = 0, onClose }: CanvasMenuProps) {
  const many = selectionCount > 1;
  // UX08-WP08: the inspector exists for exactly one object or exactly one link;
  // the menu entry and Enter share controller.openProperties().
  const inspectable =
    (selectionCount === 1 && linkCount === 0) || (selectionCount === 0 && linkCount === 1);
  const canArrange = many || ctrl.snapshot.selection.objects.length >= 3;
  const arrange: MenuGroup = {
    id: 'arrange',
    label: s('Arrange'),
    items: alignItems(ctrl, many),
  };
  const items: ContextEntry[] = [
    {
      id: 'properties',
      label: s('Properties'),
      onSelect: () => ctrl.openProperties(),
      disabled: !inspectable,
    },
    {
      id: 'duplicate',
      label: s('Duplicate'),
      onSelect: () => ctrl.duplicateSelected(),
      disabled: selectionCount === 0,
    },
    {
      id: 'copy',
      label: s('Copy'),
      onSelect: () => ctrl.copySelected(),
      disabled: selectionCount === 0,
    },
    {
      id: 'paste',
      label: s('Paste'),
      onSelect: () => ctrl.pasteCopied(),
      disabled: !ctrl.canPaste(),
    },
    {
      id: 'delete',
      label: s('Delete'),
      onSelect: () => ctrl.deleteSelection(),
      disabled: selectionCount === 0 && ctrl.snapshot.selection.links.length === 0,
    },
    // The group stays reachable (its entries explain themselves when disabled),
    // so no capability is removed by the regrouping.
    ...(canArrange ? [arrange] : [{ ...arrange, disabled: true } as MenuGroup]),
  ];
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
