// SPDX-License-Identifier: GPL-3.0-only
// Shell glue for flow editing: one session for the open file, and the rule that
// choosing a step takes the Properties column away from the canvas.
import { useFlowSession, type FlowSession } from './flowSession';
import type { FlowSelection } from './flowTypes';

export interface FlowEditingArgs {
  /** Text of the open file. */
  text: string;
  /** Workspace emit counter; a bump means the file is authoritative again. */
  version: number;
  onChangeText(next: string): void;
  setSelection(next: FlowSelection | null): void;
  /** Drop the canvas selection, so only the chosen step is highlighted. */
  clearCanvasSelection(): void;
}

export interface FlowEditing {
  /** Shared by the step list and the Properties panel. */
  session: FlowSession;
  /** Choose a flow or step: a chosen step drops the canvas selection. */
  selectFlow(next: FlowSelection | null): void;
}

export function useFlowEditing(args: FlowEditingArgs): FlowEditing {
  const session = useFlowSession(args.text, args.version, args.onChangeText);
  const selectFlow = (next: FlowSelection | null): void => {
    args.setSelection(next);
    if (next !== null && next.step.length > 0) args.clearCanvasSelection();
  };
  // The other direction: choosing something on the canvas ends the step edit, so
  // the panel never describes a step while the user is working on the diagram.
  return { session, selectFlow };
}
