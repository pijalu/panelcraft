// SPDX-License-Identifier: GPL-3.0-only
// Panel chrome for the collapsible shell (F-10; review §3.1 items 1-3):
// the collapse button each panel header carries, the always-present rail a
// collapsed panel leaves behind (so the affordance never disappears, and the
// code rail keeps the sync-state chip), and the draggable splitter.
import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ChevronLeftIcon, ChevronRightIcon, InfoIcon } from './icons';
import { s, type StringKey } from './strings';

export interface RailProps {
  /** Panel id — drives the test ids and aria wiring. */
  id: 'sidebar' | 'flows' | 'palette' | 'code' | 'props';
  /** Catalog key for the human label used in the rail text and accessible name. */
  labelKey: StringKey;
  onExpand: () => void;
  /** Optional rail content (the code rail shows the sync-state chip). */
  children?: ComponentChildren;
}

/** Narrow rail that replaces a collapsed panel. */
export function PanelRail({ id, labelKey, onExpand, children }: RailProps) {
  return (
    <div class="panel-rail" data-testid={`rail-${id}`}>
      <button
        type="button"
        class="rail-toggle"
        data-testid={`expand-${id}`}
        aria-label={s('Show {label} panel', { label: s(labelKey) })}
        aria-expanded={false}
        title={s('Show {label} (expand)', { label: s(labelKey) })}
        onClick={onExpand}
      >
        <ChevronRightIcon />
        {/* Collapsed panels keep a visible label, and the whole tab activates. */}
        <span class="rail-label" aria-hidden="true">{s(labelKey)}</span>
      </button>
      {children}
    </div>
  );
}

/** Focus the rail's expand button after a collapse (F-10 a11y: focus must not
 * stay inside an unmounted panel, and the keyboard shortcuts keep working). */
export function focusRail(id: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLButtonElement>(`[data-testid="expand-${id}"]`)?.focus();
  });
}

/** Header chevron that collapses its panel. It lives in the shared host header
 * row, immediately after the panel title, so the control that hides a panel sits
 * with the name that identifies it. */
export function CollapseButton(props: { id: string; label: string; onCollapse: () => void; dock?: string }) {
  const towards = props.dock === 'right' ? <ChevronRightIcon /> : <ChevronLeftIcon />;
  return (
    <button
      type="button"
      class="panel-toggle"
      data-testid={`collapse-${props.id}`}
      aria-label={s('Hide {label} panel', { label: props.label })}
      aria-expanded={true}
      title={s('Hide {label}', { label: props.label })}
      onClick={() => {
        props.onCollapse();
        focusRail(props.id);
      }}
    >
      {towards}
    </button>
  );
}

export interface InfoHintProps {
  /** Accessible name of the trigger ("About the Files panel"). */
  label: string;
  /** The explanation, shown as a tooltip on hover/focus and as the description. */
  text: string;
  /** Test id of the trigger; the description id is derived from it. */
  testId: string;
  /**
   * Which side the tooltip opens on. It must open away from the panel body, so it
   * never covers the panel content the user is asking about.
   */
  placement?: 'start' | 'end';
}

/**
 * Info trigger for a panel header. The explanation is a one-line icon next to the
 * title instead of a standing paragraph: it stays reachable by keyboard, is
 * announced as the trigger's accessible description, and opens as a tooltip on
 * hover *or* focus — so nothing depends on hover alone.
 */
export function InfoHint(props: InfoHintProps) {
  const textId = `${props.testId}-text`;
  return (
    <span class="panel-info" data-testid={`${props.testId}-wrap`} data-placement={props.placement ?? 'start'}>
      <button
        type="button"
        class="panel-info-trigger"
        data-testid={props.testId}
        aria-label={props.label}
        aria-describedby={textId}
        title={props.text}
      >
        <InfoIcon />
      </button>
      {/* Visual tooltip only: the description above is what assistive tech reads. */}
      <span class="panel-info-tooltip" data-testid={`${props.testId}-tooltip`} aria-hidden="true">
        {props.text}
      </span>
      <span class="sr-only" id={textId}>
        {props.text}
      </span>
    </span>
  );
}

export interface SplitterProps {
  id: string;
  /** Pointer delta since the previous move; existing callers may ignore Y. */
  onResize: (deltaX: number, deltaY: number) => void;
  orientation?: 'horizontal' | 'vertical';
  /** Drag finished — persist now (F-10: a reload right after must keep it). */
  onEnd?: () => void;
  /** Accessible name ("Resize files panel"). */
  label: string;
}

/**
 * Drag handle between two panels. Reports the *total* delta since pointer-down
 * on every move; the caller owns the clamp (uiLayout.setWidth) so a drag can
 * never push a panel outside its limits.
 */
export function Splitter({ id, onResize, onEnd, label, orientation = 'vertical' }: SplitterProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      class={`panel-splitter ${orientation}`}
      data-testid={`splitter-${id}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const ev = e as unknown as PointerEvent;
        start.current = { x: ev.clientX, y: ev.clientY };
        (ev.target as Element).setPointerCapture?.(ev.pointerId);
      }}
      onPointerMove={(e) => {
        const ev = e as unknown as PointerEvent;
        if (start.current === null) return;
        onResize(ev.clientX - start.current.x, ev.clientY - start.current.y);
        start.current = { x: ev.clientX, y: ev.clientY };
      }}
      onPointerUp={() => {
        if (start.current === null) return;
        start.current = null;
        onEnd?.();
      }}
      onPointerCancel={() => {
        if (start.current === null) return;
        start.current = null;
        onEnd?.();
      }}
      onDblClick={() => onResize(0, 0)}
    />
  );
}
