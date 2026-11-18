// SPDX-License-Identifier: GPL-3.0-only
// Present-mode transport dock (F-16): step counter, progress dots, speaker
// notes and the minimal transport (back / play-pause / next / restart / exit).
// Docked at the bottom so the diagram keeps the whole viewport.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import { flowNotesVisible, stepExplanationVisible } from './flows/flowController';
import { parseSafeMarkdown } from '../engine/format/safeMarkdown';
import { NOTES_LABEL, SafeMarkdown } from './flows/SafeMarkdown';
import { progressDots } from './present';
import { CloseIcon, PauseIcon, PlayIcon, RestartIcon, StepBackIcon, StepForwardIcon } from './icons';
import { s } from './strings';

export interface PresentDockProps {
  player: FlowPlayerApi;
}

/**
 * Non-modal flow notes. No role=dialog, no backdrop and no focus call: the
 * canvas and transport keep their focus and pointer behaviour.
 */
function FlowNotesAside({ text }: { text: string }) {
  const blocks = useMemo(() => parseSafeMarkdown(text), [text]);
  return (
    <aside
      class="present-notes-aside"
      data-testid="flow-notes-panel"
      aria-label={NOTES_LABEL}
    >
      <h2 class="present-notes-title">{NOTES_LABEL}</h2>
      <SafeMarkdown blocks={blocks} />
    </aside>
  );
}


/**
 * The framing explanation: the introduction or conclusion prose, rendered with
 * the safe Markdown renderer in a NON-MODAL popover. No backdrop, no focus trap,
 * no role=dialog: the transport and the canvas stay usable, Escape, the close
 * button and a pointer press elsewhere all dismiss it, and it is placed above the
 * narration card it explains so it never covers it.
 */
function FramingPopover(props: {
  framing: { kind: 'intro' | 'conclusion'; text: string };
  anchor: HTMLElement | null;
  onClose(): void;
}) {
  const blocks = useMemo(() => parseSafeMarkdown(props.framing.text), [props.framing.text]);
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const place = (): void => {
      const el = ref.current;
      const anchor = props.anchor;
      if (el === null || anchor === null) return;
      const vw = window.innerWidth;
      const pop = el.getBoundingClientRect();
      // Anchor to the dock that holds the narration card, not the card alone:
      // the dock paints above the canvas, and a card-anchored popover would end
      // up underneath it.
      const host = anchor.closest('.present-dock') ?? anchor;
      const target = host.getBoundingClientRect();
      // Clamp inside the viewport, then keep the whole card above the anchor.
      const left = Math.max(8, Math.min(target.left, vw - pop.width - 8));
      const above = target.top - pop.height - 8;
      setBox({ left, top: Math.max(8, above) });
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    if (ref.current !== null) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [props.framing, props.anchor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Escape closes the topmost surface first: the popover claims it here, at
      // document level, before the presentation's own window-level keymap can
      // read it as "exit". With the popover closed, Escape still exits.
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    };
    const onPointer = (e: Event): void => {
      const el = ref.current;
      if (el !== null && e.target instanceof Node && el.contains(e.target)) return;
      props.onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [props.onClose]);
  return (
    <div
      ref={ref}
      class="present-framing"
      data-testid="framing-popover"
      data-kind={props.framing.kind}
      role="note"
      aria-label={s(props.framing.kind === 'intro' ? 'Introduction' : 'Conclusion')}
      style={box === null ? undefined : `left: ${box.left}px; top: ${box.top}px`}
    >
      <div class="present-framing-head">
        <h2 class="present-framing-title">{s(props.framing.kind === 'intro' ? 'Introduction' : 'Conclusion')}</h2>
        <button
          type="button"
          class="present-framing-close"
          data-testid="framing-popover-close"
          aria-label={s('Close explanation')}
          onClick={() => props.onClose()}
        >
          <CloseIcon />
        </button>
      </div>
      <SafeMarkdown blocks={blocks} />
    </div>
  );
}

/**
 * The current step's explanation: rendered Markdown in a region BESIDE the
 * drawing. It reserves canvas space instead of covering the diagram, so the step
 * component it explains stays visible, and it never shares the transport dock
 * with the framing narration.
 */
function StepExplanationAside({ text }: { text: string }) {
  const blocks = useMemo(() => parseSafeMarkdown(text), [text]);
  return (
    <aside
      class="present-explanation"
      data-testid="step-explanation"
      aria-label={s('Step explanation')}
    >
      <h2 class="present-explanation-title">{s('Step explanation')}</h2>
      <SafeMarkdown blocks={blocks} />
    </aside>
  );
}

/** Advance surface + dock: the whole canvas is the "next" target (F-16). */
export function PresentLayer({ player }: PresentDockProps) {
  const visible = flowNotesVisible(player.state);
  const explanation = stepExplanationVisible(player.state);
  const shown = useRef<string | null>(null);
  const refit = useRef(player.refit);
  refit.current = player.refit;
  // Both asides take canvas space, so both change the beat's framing.
  const signature = `${visible ? 'notes' : ''}/${explanation ? 'explanation' : ''}`;
  useEffect(() => {
    const first = shown.current === null;
    if (!first && shown.current === signature) return;
    const opened = signature !== '' && signature !== '/';
    shown.current = signature;
    if (first && !opened) return;
    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(() => refit.current());
      return () => cancelAnimationFrame(id);
    }
    refit.current();
    return undefined;
  }, [signature]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const onResize = (): void => {
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => refit.current());
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <>
      {visible && <FlowNotesAside text={player.state.flowDescription} />}
      {explanation && <StepExplanationAside text={player.state.description} />}
      <button
        type="button"
        class="present-advance"
        data-testid="present-advance"
        aria-label={s('Next step')}
        onClick={() => player.next()}
      />
      <PresentDock player={player} />
    </>
  );
}

/** The popover slot: mounts the explanation only while it is shown. */
function FramingArea(props: {
  framing: { kind: 'intro' | 'conclusion'; text: string } | null;
  anchor: HTMLElement | null;
  onClose(): void;
}) {
  if (props.framing === null) return null;
  return <FramingPopover framing={props.framing} anchor={props.anchor} onClose={props.onClose} />;
}

/** Bottom dock shown while presenting (or paused inside a flow). */
export function PresentDock({ player: p }: PresentDockProps) {
  const st = p.state;
  const index = st.progress?.index ?? 0;
  const total = st.progress?.total ?? 0;
  const dots = progressDots(index, total);
  // The explanation is shown once per framing beat: dismissing it keeps it
  // closed until the step changes, and the dock keeps a way to reopen it.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [card, setCard] = useState<HTMLElement | null>(null);
  const framing = st.framing;
  const framingShown = framing !== null && dismissedAt !== index;

  return (
    <>
    <FramingArea framing={framingShown ? framing : null} anchor={card} onClose={() => setDismissedAt(index)} />
    <div class="present-dock" data-testid="present-dock" data-status={st.status}>
      <div class="present-row">
        <button
          type="button"
          data-testid="present-back"
          aria-label={s('Previous step')}
          onClick={() => p.stepTo(Math.max(1, index - 1))}
        >
          <StepBackIcon />
        </button>
        <button
          type="button"
          data-testid="present-toggle"
          aria-label={st.status === 'playing' ? s('Pause') : s('Play')}
          onClick={() => (st.status === 'playing' ? p.pause() : p.replay())}
        >
          {st.status === 'playing' ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          data-testid="present-next"
                      aria-label={s('Next step')}
          onClick={() => p.stepTo(index + 1)}
        >
          <StepForwardIcon />
        </button>
        <span class="present-counter" data-testid="present-counter">
          {index} {s("/")}{' '}{total}
        </span>
        <button type="button" data-testid="present-restart" aria-label={s('Restart')} onClick={() => p.restart()}>
          <RestartIcon />
        </button>
        <button type="button" data-testid="present-exit" aria-label={s('Exit presentation')} onClick={() => p.exit()}>
          <CloseIcon />
        </button>
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
      <p class="present-notes" data-testid="present-notes" aria-live="polite" ref={setCard}>
        {st.narration}
      </p>
      {framing !== null && (
        <button
          type="button"
          class="present-framing-open"
          data-testid="framing-popover-open"
          aria-expanded={framingShown}
          onClick={() => setDismissedAt(framingShown ? index : null)}
        >
          {s('Explanation')}
        </button>
      )}
    </div>
    </>
  );
}
