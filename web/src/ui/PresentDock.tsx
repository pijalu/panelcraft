// SPDX-License-Identifier: GPL-3.0-only
// Present-mode transport dock (F-16): step counter, progress dots, speaker
// notes and the minimal transport (back / play-pause / next / restart / exit).
// Docked at the bottom so the diagram keeps the whole viewport.
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import { progressDots } from './present';
import { s } from './strings';

export interface PresentDockProps {
  player: FlowPlayerApi;
}

/** Advance surface + dock: the whole canvas is the "next" target (F-16). */
export function PresentLayer({ player }: PresentDockProps) {
  const index = player.state.progress?.index ?? 1;
  return (
    <>
      <button
        type="button"
        class="present-advance"
        data-testid="present-advance"
                  aria-label={s('Next step')}
        onClick={() => player.stepTo(index + 1)}
      />
      <PresentDock player={player} />
    </>
  );
}

/** Bottom dock shown while presenting (or paused inside a flow). */
export function PresentDock({ player: p }: PresentDockProps) {
  const st = p.state;
  const index = st.progress?.index ?? 0;
  const total = st.progress?.total ?? 0;
  const dots = progressDots(index, total);

  return (
    <div class="present-dock" data-testid="present-dock" data-status={st.status}>
      <div class="present-row">
        <button
          type="button"
          data-testid="present-back"
          aria-label={s('Previous step')}
          onClick={() => p.stepTo(Math.max(1, index - 1))}
        >
          {s("‹")}{' '}</button>
        <button
          type="button"
          data-testid="present-toggle"
          aria-label={st.status === 'playing' ? s('Pause') : s('Play')}
          onClick={() => (st.status === 'playing' ? p.pause() : p.resume())}
        >
          {st.status === 'playing' ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          data-testid="present-next"
                      aria-label={s('Next step')}
          onClick={() => p.stepTo(index + 1)}
        >
          {s("›")}{' '}</button>
        <span class="present-counter" data-testid="present-counter">
          {index} {s("/")}{' '}{total}
        </span>
        <button type="button" data-testid="present-restart" aria-label={s('Restart')} onClick={() => p.restart()}>
          {s("↺")}{' '}</button>
        <button type="button" data-testid="present-exit" aria-label={s('Exit presentation')} onClick={() => p.exit()}>
          {s("✕")}{' '}</button>
      </div>
      <div class="present-dots" data-testid="present-dots">
        {dots.map((d) => (
          <button
            key={d.step}
            type="button"
            class={`present-dot${d.current ? ' current' : ''}`}
            data-testid={`present-dot-${d.step}`}
            aria-label={s('Step {n}', { n: d.step })}
            aria-current={d.current ? 'step' : undefined}
            onClick={() => p.stepTo(d.step)}
          />
        ))}
      </div>
      {st.awaitingChoice && (
        <div class="present-choices" data-testid="present-choices">
          {st.awaitingChoice.branches.map((label, i) => (
            <button key={`${label}-${i}`} type="button" onClick={() => p.choose(i)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <p class="present-notes" data-testid="present-notes" aria-live="polite">
        {st.narration}
      </p>
    </div>
  );
}
