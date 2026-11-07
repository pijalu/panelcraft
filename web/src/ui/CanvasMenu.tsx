// SPDX-License-Identifier: GPL-3.0-only
// Canvas context menu contents (F-19): derives the available commands from the
// controller's selection so the menu never offers a no-op.
import type { CanvasController } from './CanvasController';
import { ContextMenu, type MenuItem } from './ContextMenu';

export interface CanvasMenuProps {
  ctrl: CanvasController;
  x: number;
  y: number;
  /** Object count in the current selection (menu enablement). */
  selectionCount: number;
  onClose: () => void;
}

/** Objects/edges/canvas actions for the current selection. */
export function CanvasMenu({ ctrl, x, y, selectionCount, onClose }: CanvasMenuProps) {
  const many = selectionCount > 1;
  const items: MenuItem[] = [
    {
      id: 'duplicate',
      label: 'Duplicate',
      onSelect: () => ctrl.duplicateSelected(),
      disabled: selectionCount === 0,
    },
    {
      id: 'copy',
      label: 'Copy',
      onSelect: () => ctrl.copySelected(),
      disabled: selectionCount === 0,
    },
    {
      id: 'paste',
      label: 'Paste',
      onSelect: () => ctrl.pasteCopied(),
      disabled: !ctrl.canPaste(),
    },
    {
      id: 'delete',
      label: 'Delete',
      onSelect: () => ctrl.deleteSelection(),
      disabled: selectionCount === 0 && ctrl.snapshot.selection.links.length === 0,
    },
    {
      id: 'align-left',
      label: 'Align left',
      onSelect: () => ctrl.alignSelected('left'),
      disabled: !many,
    },
    {
      id: 'align-center-x',
      label: 'Align centre (horizontal)',
      onSelect: () => ctrl.alignSelected('centerX'),
      disabled: !many,
    },
    {
      id: 'align-right',
      label: 'Align right',
      onSelect: () => ctrl.alignSelected('right'),
      disabled: !many,
    },
    {
      id: 'align-top',
      label: 'Align top',
      onSelect: () => ctrl.alignSelected('top'),
      disabled: !many,
    },
    {
      id: 'align-center-y',
      label: 'Align middle (vertical)',
      onSelect: () => ctrl.alignSelected('centerY'),
      disabled: !many,
    },
    {
      id: 'align-bottom',
      label: 'Align bottom',
      onSelect: () => ctrl.alignSelected('bottom'),
      disabled: !many,
    },
    {
      id: 'distribute-x',
      label: 'Distribute horizontally',
      onSelect: () => ctrl.distributeSelected('x'),
      disabled: selectionCount < 3,
    },
    {
      id: 'distribute-y',
      label: 'Distribute vertically',
      onSelect: () => ctrl.distributeSelected('y'),
      disabled: selectionCount < 3,
    },
    {
      id: 'equal-size',
      label: 'Equal size',
      onSelect: () => ctrl.equalSizeSelected(),
      disabled: !many,
    },
  ];
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
