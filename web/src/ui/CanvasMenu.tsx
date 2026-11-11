// SPDX-License-Identifier: GPL-3.0-only
// Canvas context menu contents (F-19): derives the available commands from the
// controller's selection so the menu never offers a no-op.
import type { CanvasController } from './CanvasController';
import { s } from './strings';
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
    {
      id: 'align-left',
      label: s('Align left'),
      onSelect: () => ctrl.alignSelected('left'),
      disabled: !many,
    },
    {
      id: 'align-center-x',
      label: s('Align centre (horizontal)'),
      onSelect: () => ctrl.alignSelected('centerX'),
      disabled: !many,
    },
    {
      id: 'align-right',
      label: s('Align right'),
      onSelect: () => ctrl.alignSelected('right'),
      disabled: !many,
    },
    {
      id: 'align-top',
      label: s('Align top'),
      onSelect: () => ctrl.alignSelected('top'),
      disabled: !many,
    },
    {
      id: 'align-center-y',
      label: s('Align middle (vertical)'),
      onSelect: () => ctrl.alignSelected('centerY'),
      disabled: !many,
    },
    {
      id: 'align-bottom',
      label: s('Align bottom'),
      onSelect: () => ctrl.alignSelected('bottom'),
      disabled: !many,
    },
    {
      id: 'distribute-x',
      label: s('Distribute horizontally'),
      onSelect: () => ctrl.distributeSelected('x'),
      disabled: selectionCount < 3,
    },
    {
      id: 'distribute-y',
      label: s('Distribute vertically'),
      onSelect: () => ctrl.distributeSelected('y'),
      disabled: selectionCount < 3,
    },
    {
      id: 'equal-size',
      label: s('Equal size'),
      onSelect: () => ctrl.equalSizeSelected(),
      disabled: !many,
    },
  ];
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
}
