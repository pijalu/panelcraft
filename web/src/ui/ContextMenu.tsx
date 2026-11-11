// SPDX-License-Identifier: GPL-3.0-only
// Canvas context menu (F-19): a small fixed-position menu for canvas, object
// and edge actions. Keyboard: Escape closes, items are real buttons so Tab and
// Enter work; the first item receives focus on open.
import { useEffect, useRef } from 'preact/hooks';
import { s } from './strings';

export interface MenuItem {
  label: string;
  /** Stable hook for tests and for command routing. */
  id: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Floating menu at (x, y) in viewport coordinates. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      class="context-menu"
      data-testid="context-menu"
      role="menu"
      aria-label={s('Canvas actions')}
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          class="context-item"
          data-testid={`ctx-${item.id}`}
          disabled={item.disabled === true}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
