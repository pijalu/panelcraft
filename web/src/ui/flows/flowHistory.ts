// SPDX-License-Identifier: GPL-3.0-only
// Flow controls edit the same document buffer as the code view. Route their
// undo/redo shortcuts to that buffer before the canvas window handler sees them.
import { codePorts } from '../codePorts';

/** Handle document history for a key pressed inside a flow-editing surface. */
export function flowHistoryKeyDown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  const command = key === 'z'
    ? (event.shiftKey ? codePorts.redo : codePorts.undo)
    : (key === 'y' && !event.shiftKey ? codePorts.redo : null);
  if (command === null) return;
  event.preventDefault();
  event.stopPropagation();
  command();
}
