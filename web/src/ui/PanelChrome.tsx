// SPDX-License-Identifier: GPL-3.0-only
// Panel chrome for the collapsible shell (F-10; review §3.1 items 1-3):
// the collapse button each panel header carries, the always-present rail a
// collapsed panel leaves behind (so the affordance never disappears, and the
// code rail keeps the sync-state chip), and the draggable splitter.
import { useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface RailProps {
  /** Panel id — drives the test ids and aria wiring. */
  id: 'sidebar' | 'palette' | 'code' | 'props';
  /** Human label used in the accessible name ("Show files panel"). */
  label: string;
  onExpand: () => void;
  /** Optional rail content (the code rail shows the sync-state chip). */
  children?: ComponentChildren;
}

/** Narrow rail that replaces a collapsed panel. */
export function PanelRail({ id, label, onExpand, children }: RailProps) {
  return (
    <div class="panel-rail" data-testid={`rail-${id}`}>
      <button
        type="button"
        class="rail-toggle"
        data-testid={`expand-${id}`}
        aria-label={`Show ${label} panel`}
        aria-expanded={false}
        title={`Show ${label} (expand)`}
        onClick={onExpand}
      >
        ›
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

/** Header chevron that collapses its panel. */
export function CollapseButton(props: { id: string; label: string; onCollapse: () => void }) {
  return (
    <button
      type="button"
      class="panel-toggle"
      data-testid={`collapse-${props.id}`}
      aria-label={`Hide ${props.label} panel`}
      aria-expanded={true}
      title={`Hide ${props.label}`}
      onClick={() => {
        props.onCollapse();
        focusRail(props.id);
      }}
    >
      ‹
    </button>
  );
}

export interface SplitterProps {
  id: string;
  /** Called with the horizontal pointer delta since the drag started. */
  onResize: (deltaX: number) => void;
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
export function Splitter({ id, onResize, onEnd, label }: SplitterProps) {
  const start = useRef<number | null>(null);
  return (
    <div
      class="panel-splitter"
      data-testid={`splitter-${id}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={(e) => {
        const ev = e as unknown as PointerEvent;
        start.current = ev.clientX;
        (ev.target as Element).setPointerCapture?.(ev.pointerId);
      }}
      onPointerMove={(e) => {
        const ev = e as unknown as PointerEvent;
        if (start.current === null) return;
        onResize(ev.clientX - start.current);
        start.current = ev.clientX;
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
      onDblClick={() => onResize(0)}
    />
  );
}
