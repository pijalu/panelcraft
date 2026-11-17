// SPDX-License-Identifier: GPL-3.0-only
// Presentation keyboard wiring (F-16): while a flow is playing, bare keys drive
// playback (Space/→ next, ← back, P pause, R restart, Esc exit). Extracted from
// App so the shell keeps its size and the mapping stays in one place.
import { useEffect, useRef } from 'preact/hooks';
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import { presentAction, presentKeyIsGlobal, type PresentAction } from './present';

/** Apply one presentation action to the runner. */
export function applyPresentAction(p: FlowPlayerApi, action: PresentAction): void {
  const index = p.state.progress?.index ?? 1;
  switch (action) {
    case 'next':
      p.stepTo(index + 1);
      return;
    case 'back':
      p.stepTo(Math.max(1, index - 1));
      return;
    case 'toggle':
      if (p.state.status === 'playing') p.pause();
      else p.replay();
      return;
    case 'restart':
      p.restart();
      return;
    case 'exit':
      p.exit();
  }
}

/** Bind the present-mode keymap while `active` (no-op otherwise). */
export function usePresentKeys(player: FlowPlayerApi, active: boolean): void {
  const ref = useRef(player);
  ref.current = player;
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // A focused dock control owns Space/Enter: stealing them made the control
      // look dead and, on Previous, advanced instead of going back. Arrows and
      // Escape stay global because no control is activated by them.
      if (target !== null && !presentKeyIsGlobal(e.key, target.tagName, target.isContentEditable)) return;
      const action = presentAction(e.key, e.metaKey || e.ctrlKey || e.altKey);
      if (action === null) return;
      e.preventDefault();
      applyPresentAction(ref.current, action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
