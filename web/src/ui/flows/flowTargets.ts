// SPDX-License-Identifier: GPL-3.0-only
// What the Properties panel shows. One rule, one owner: while a flow or a step is
// chosen, that is what the column describes; otherwise the canvas selection; then
// the empty state. Keeping this decision pure means the panel and the canvas
// cannot disagree about who owns the right-hand column. The two selections do not
// coexist for long — choosing on the canvas ends the step edit and vice versa —
// but a canvas reload caused by the edit itself may re-select something, and that
// must not swap the panel out from under the field being typed in.
import type { DiagramLink, DiagramObject } from '../CanvasController';
import type { Doc } from '../../engine/model/types';
import { resolveTarget, type FlowSelection, type FlowTarget } from './flowTypes';

export type PropTarget =
  | { kind: 'flow'; target: FlowTarget }
  | { kind: 'object'; object: DiagramObject }
  | { kind: 'link'; link: DiagramLink }
  | { kind: 'none' };

export function propTarget(args: {
  object: DiagramObject | null;
  link: DiagramLink | null;
  doc: Doc | null;
  selection: FlowSelection | null;
}): PropTarget {
  const target = args.doc === null ? null : resolveTarget(args.doc, args.selection);
  if (target !== null) return { kind: 'flow', target };
  if (args.object !== null) return { kind: 'object', object: args.object };
  if (args.link !== null) return { kind: 'link', link: args.link };
  return { kind: 'none' };
}
