// SPDX-License-Identifier: GPL-3.0-only
// In-place rename overlay (F-15; review §3.3 item 6): the label on the canvas
// becomes an input, so the user's eye never leaves the diagram. Positioned in
// screen space (fixed) from the object's canvas rect and the viewport transform,
// so it tracks pan/zoom; above 200 % zoom it degrades to a compact chip.
import { useEffect, useRef, useState } from 'preact/hooks';

export interface RenameTarget {
  id: string;
  /** Object kind — used for the accessible name ("Rename system"). */
  kind: string;
  /** Current label, seeded into the input. */
  name: string;
  /** Screen-space box (CSS px, viewport coordinates). */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Viewport zoom; ≥ 2 switches to the chip presentation. */
  zoom: number;
}

export interface InlineRenameProps {
  target: RenameTarget;
  /** Enter or blur: commit the typed label. */
  onCommit: (value: string) => void;
  /** Escape: leave the label untouched. */
  onCancel: () => void;
}

const CHIP_ZOOM = 2;

/** Canvas label → editable input (Enter commits, Esc cancels, blur commits). */
export function InlineRename({ target, onCommit, onCancel }: InlineRenameProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  /** Once Enter/Escape settled the rename, the unmount blur must not commit. */
  const settled = useRef(false);
  const [value, setValue] = useState(target.name);
  const chip = target.zoom >= CHIP_ZOOM;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [target.id]);

  const commit = (): void => {
    if (settled.current) return;
    settled.current = true;
    const next = value.trim();
    if (next === '' || next === target.name) {
      onCancel();
      return;
    }
    onCommit(next);
  };

  return (
    <input
      ref={ref}
      class={`inline-rename${chip ? ' inline-rename-chip' : ''}`}
      data-testid="inline-rename"
      data-chip={chip ? 'true' : 'false'}
      aria-label={`Rename ${target.kind.replace(/_/g, ' ')}`}
      value={value}
      style={{
        left: `${target.left}px`,
        top: `${chip ? target.top + target.height + 6 : target.top}px`,
        width: `${chip ? Math.min(160, Math.max(96, target.width)) : target.width}px`,
        height: chip ? '28px' : `${Math.max(24, target.height)}px`,
      }}
      onInput={(e) => setValue((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          settled.current = true; // unmounting fires blur — do not commit then
          onCancel();
        }
      }}
      onBlur={commit}
    />
  );
}
