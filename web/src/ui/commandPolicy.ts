// SPDX-License-Identifier: GPL-3.0-only
// Shared selection policy for reset commands (bugs.md, ADR 0007). One pure
// model consumed by both the canvas context menu and the application menu, so
// an action is enabled identically wherever it is offered.
export interface CommandSelection {
  objects: string[];
  links: string[];
}

export type RouteResetTarget =
  | { kind: 'off' }
  | { kind: 'all' }
  | { kind: 'one'; linkId: string };

/**
 * Route reset needs a single unambiguous connection, or no selection at all
 * (meaning "every link"). Objects, mixed selections and multiple connections
 * disable it rather than guessing which route the user meant.
 */
export function routeResetTarget(selection: CommandSelection): RouteResetTarget {
  if (selection.objects.length > 0) return { kind: 'off' };
  if (selection.links.length === 0) return { kind: 'all' };
  if (selection.links.length === 1) return { kind: 'one', linkId: selection.links[0]! };
  return { kind: 'off' };
}

/** "Reset diagram layout" is always available when a file is open. */
export function canResetDiagramLayout(activePath: string | null): boolean {
  return activePath !== null;
}
