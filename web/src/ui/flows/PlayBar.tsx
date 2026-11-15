// SPDX-License-Identifier: GPL-3.0-only
// M5-WP5 play-mode transport (FR-F1/F4): play/pause, step ±, restart, exit;
// progress, breadcrumb for nested goto frames, alt-branch chooser buttons,
// and the ARIA narration hook (FR-F6 — narration text is a plain string so
// e2e can assert it and the host can attach aria-live semantics). Purely
// presentational: all behavior lives in the FlowRunner executor.
import type { FlowPlayerApi } from './useFlowPlayer';
import { CloseIcon, FullscreenIcon, PauseIcon, PlayIcon, RestartIcon, StepFirstIcon, StepLastIcon } from '../icons';
import { s } from '../strings';

export interface PlayBarProps {
  player: FlowPlayerApi;
  /** F-16: enter the fullscreen presentation shell. */
  onPresent?: () => void;
}

function transportLabel(p: FlowPlayerApi): string {
  const s = p.state.status;
  if (s === 'idle') return 'play';
  if (s === 'playing') return 'pause';
  if (s === 'paused') return p.state.awaitingChoice === null ? 'resume' : 'choose';
  return 'replay';
}

/** Transport bar overlaying the canvas while a flow plays. */
export function PlayBar({ player: p, onPresent }: PlayBarProps) {
  const st = p.state;
  if (st.status === 'idle') return null;
  const alt = st.awaitingChoice;

  return (
    <div class="playbar" data-testid="playbar" data-status={st.status}>
      {onPresent && (
        <button
          type="button"
          data-testid="pb-present"
          title={s("Present (fullscreen, no editor chrome)")}
          onClick={onPresent}
        >
          <FullscreenIcon />
        </button>
      )}
      <button
        type="button"
        data-testid="pb-restart"
        title={s("Restart")}
        onClick={() => p.restart()}
      >
        <RestartIcon />
      </button>
      <button
        type="button"
        data-testid="pb-step-back"
        title={s("Step back")}
        onClick={() => p.stepTo(Math.max(1, (st.progress?.index ?? 1) - 1))}
      >
        <StepFirstIcon />
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
        {st.status === 'playing' ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button
        type="button"
        data-testid="pb-step-fwd"
        title={s("Step forward")}
        onClick={() => p.stepTo((st.progress?.index ?? 0) + 1)}
      >
        <StepLastIcon />
      </button>
      <button type="button" data-testid="pb-exit" title={s("Exit")} onClick={() => p.exit()}>
        <CloseIcon />
      </button>
      <span class="playbar-progress" data-testid="pb-progress">
        {st.progress === null ? '' : `${st.progress.index}/${st.progress.total}`}
      </span>
      {st.breadcrumb.length > 0 && (
        <span class="playbar-crumbs" data-testid="pb-breadcrumb">
          {st.breadcrumb.join(' › ')} {s("›")}{' '}</span>
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
      {st.description !== '' && (
        <span class="playbar-desc" data-testid="pb-description">
          {st.description}
        </span>
      )}
      {st.status === 'ended' && (
        <div class="closing-card" data-testid="closing-card" role="status">
          <strong>{st.progress === null ? s('Flow') : s('Flow complete')}</strong>
          <span class="muted">
            {st.progress === null ? '' : s('{n} steps', { n: st.progress.total })}
          </span>
          <button type="button" data-testid="cc-replay" onClick={() => p.restart()}>
            {s("Replay")}{' '}</button>
          <button type="button" data-testid="cc-export" onClick={() => p.exportSvg?.()}>
            {s("Export SVG")}{' '}</button>
          <button type="button" data-testid="cc-exit" onClick={() => p.exit()}>
            {s("Close")}{' '}</button>
        </div>
      )}
    </div>
  );
}
