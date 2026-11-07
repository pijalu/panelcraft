// SPDX-License-Identifier: GPL-3.0-only
// Stencil palette (M2-WP9, FR-C3): click-to-place, pointer drag-drop onto the
// canvas, 1..9 quick-add keys handled by the controller keymap.
import { useRef } from 'preact/hooks';
import type { Kind } from '../engine/model/types';
import { labelFor } from './CanvasController';
import { CollapseButton } from './PanelChrome';

interface PaletteProps {
  kinds: Kind[];
  onPlace: (kind: Kind) => void;
  /** Pointer-based drop: (kind, end-event) — App converts to canvas coords. */
  onDragDrop: (kind: Kind, e: PointerEvent) => void;
  /** F-10: collapse this panel into its rail. */
  onCollapse?: () => void;
}

export function Palette({ kinds, onPlace, onDragDrop, onCollapse }: PaletteProps) {
  const dragging = useRef<{ kind: Kind; ghost: HTMLDivElement } | null>(null);

  const startDrag = (kind: Kind, e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const ghost = document.createElement('div');
    ghost.className = 'pc-palette-ghost';
    ghost.textContent = labelFor(kind);
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    document.body.appendChild(ghost);
    dragging.current = { kind, ghost };
    const move = (ev: PointerEvent): void => {
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
    };
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      dragging.current = null;
      onDragDrop(kind, ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside class="palette" data-testid="palette" aria-label="Shape palette">
      <div class="panel-head">
        <h2 class="panel-title">Shapes</h2>
        {onCollapse && <CollapseButton id="palette" label="shapes" onCollapse={onCollapse} />}
      </div>
      <ul class="palette-list">
        {kinds.map((kind, i) => (
          <li key={kind}>
            <button
              type="button"
              class="palette-item"
              data-kind={kind}
              data-testid={`palette-${kind}`}
              title={`${labelFor(kind)} (key ${i + 1})`}
              onClick={() => onPlace(kind)}
              onPointerDown={(e) => startDrag(kind, e as unknown as PointerEvent)}
            >
              <span class="palette-glyph" data-glyph={kind} aria-hidden="true" />
              <span class="palette-label">{labelFor(kind)}</span>
              <kbd class="palette-key">{i + 1}</kbd>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
