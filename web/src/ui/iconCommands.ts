// SPDX-License-Identifier: GPL-3.0-only
// The single icon-write command (FILE-FORMAT §3.1). Every control that sets an
// object's icon goes through here, so a legacy `style { icon … }` override is
// always cleared in the same patch instead of becoming a second, invisible
// source of truth. The control (properties panel, future command palette, …)
// owns no patch logic of its own.
import type { DiagramObject } from './CanvasController';

/** Patch that writes `icon` and drops a stale style override, if one exists. */
export function writeObjectIcon(
  obj: Pick<DiagramObject, 'icon' | 'style'>,
  icon: string | undefined,
): Partial<DiagramObject> {
  if (obj.style?.icon !== undefined) {
    return { style: { ...obj.style, icon: undefined }, icon };
  }
  return { icon };
}
