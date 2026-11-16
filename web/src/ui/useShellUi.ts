// SPDX-License-Identifier: GPL-3.0-only
// Transient shell UI state (inline rename, hover card, presentation
// illustration choice, flow selection, history popover). None of it is
// persisted: it is what the *current* interaction is showing, so it lives in one
// hook instead of scattered `useState` calls in the shell component.
import { useState } from 'preact/hooks';
import type { IllustrationId } from '../engine/anim/illustrations';
import type { FlowSelection } from './flows/FlowPane';
import type { HoverInfo } from './hoverInfo';

export interface ShellUi {
  /** Object id being renamed inline, or `null`. */
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  /** Hover card content, or `null`. */
  hover: HoverInfo | null;
  setHover: (info: HoverInfo | null) => void;
  /** Presentation illustration preference (`auto` uses the file's choice). */
  illustration: IllustrationId | 'auto';
  setIllustration: (id: IllustrationId | 'auto') => void;
  /** Flow step selection driving the canvas-assisted editor. */
  flowSelection: FlowSelection | null;
  setFlowSelection: (selection: FlowSelection | null) => void;
  /** Unified history popover. */
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
}

export function useShellUi(): ShellUi {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [illustration, setIllustration] = useState<IllustrationId | 'auto'>('auto');
  const [flowSelection, setFlowSelection] = useState<FlowSelection | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  return {
    renaming, setRenaming,
    hover, setHover,
    illustration, setIllustration,
    flowSelection, setFlowSelection,
    historyOpen, setHistoryOpen,
  };
}
