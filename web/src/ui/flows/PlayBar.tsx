// SPDX-License-Identifier: GPL-3.0-only
// M5-WP5 play-mode transport (FR-F1/F4): play/pause, step ±, restart, exit;
// progress, breadcrumb for nested goto frames, alt-branch chooser buttons,
// and the ARIA narration hook (FR-F6 — narration text is a plain string so
// e2e can assert it and the host can attach aria-live semantics). Purely
// presentational: all behavior lives in the FlowRunner executor.
import type { FlowPlayerApi } from './useFlowPlayer';

export interface PlayBarProps {
  player: FlowPlayerApi;
}

function transportLabel(p: FlowPlayerApi): string {
  const s = p.state.status;
  if (s === 'idle') return 'play';
  if (s === 'playing') return 'pause';
  if (s === 'paused') return p.state.awaitingChoice === null ? 'resume' : 'choose';
  return 'replay';
}

/** Transport bar overlaying the canvas while a flow plays. */
export function PlayBar({ player: p }: PlayBarProps) {
  const st = p.state;
  if (st.status === 'idle') return null;
  const alt = st.awaitingChoice;

  return (
    <div class="playbar" data-testid="playbar" data-status={st.status}>
      <button
        type="button"
        data-testid="pb-restart"
        title="Restart"
        onClick={() => p.restart()}
      >
        ↺
      </button>
      <button
        type="button"
        data-testid="pb-step-back"
        title="Step back"
        onClick={() => p.stepTo(Math.max(1, (st.progress?.index ?? 1) - 1))}
      >
        ⏮
      </button>
      <button
        type="button"
        data-testid="pb-toggle"
        title={transportLabel(p)}
        onClick={() => {
          if (st.status === 'playing') p.pause();
          else if (st.status === 'ended') p.restart();
          else p.resume();
        }}
      >
        {st.status === 'playing' ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        data-testid="pb-step-fwd"
        title="Step forward"
        onClick={() => p.stepTo((st.progress?.index ?? 0) + 1)}
      >
        ⏭
      </button>
      <button type="button" data-testid="pb-exit" title="Exit" onClick={() => p.exit()}>
        ✕
      </button>
      <span class="playbar-progress" data-testid="pb-progress">
        {st.progress === null ? '' : `${st.progress.index}/${st.progress.total}`}
      </span>
      {st.breadcrumb.length > 0 && (
        <span class="playbar-crumbs" data-testid="pb-breadcrumb">
          {st.breadcrumb.join(' › ')} ›
        </span>
      )}
      {alt !== null && (
        <span class="playbar-choice" data-testid="pb-choice">
          {alt.branches.map((b, i) => (
            <button key={i} type="button" data-testid={`pb-choice-${i}`} onClick={() => p.choose(i)}>
              {b}
            </button>
          ))}
        </span>
      )}
      <span class="playbar-narration" data-testid="pb-narration" aria-live="polite" role="status">
        {st.narration}
      </span>
    </div>
  );
}
