// SPDX-License-Identifier: GPL-3.0-only
// M3-WP1 tab strip (FR-W2): click to switch, close buttons, dirty dots,
// pointer-based drag reorder (moveTab reducer owns the invariants).
import { useRef } from 'preact/hooks';
import type { Tab } from '../workspace/tabs';
import { s } from './strings';

export interface TabsProps {
  tabs: Tab[];
  active: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

export function Tabs({ tabs, active, onSelect, onClose, onReorder }: TabsProps) {
  const dragFrom = useRef<number | null>(null);

  return (
    <div class="tab-strip" data-testid="tab-strip">
      {tabs.map((t, i) => (
        <span
          key={t.path}
          class={`tab${i === active ? ' tab-active' : ''}`}
          onPointerDown={() => {
            dragFrom.current = i;
          }}
          onPointerUp={() => {
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from === null || from === i) return;
            onReorder(from, i);
          }}
        >
          {/* N5 (M7): tab buttons carry their own accessible names (close =
              aria-label); active state stays visual (data-active drives the
              accent border). No tablist wrapper — its children would have to
              be exactly role=tab, which the close button is not. */}
          <button
            type="button"
            class="tab-name"
            data-testid={`tab-${t.path}`}
            data-active={i === active ? 'true' : 'false'}
            onClick={() => onSelect(i)}
          >
            {t.dirty && <span class="tab-dirty" data-testid={`tab-dirty-${t.path}`} title={s('Unsaved changes')}>{s("●")}</span>}
            {t.path.split('/').pop()}
          </button>
          <button
            type="button"
            class="tab-close"
            data-testid={`tab-close-${t.path}`}
            title={s('Close tab')}
            aria-label={s('Close {path}', { path: t.path })}
            onClick={() => onClose(i)}
          >
            {s("×")}{' '}</button>
        </span>
      ))}
      {tabs.length === 0 && <span class="tab-empty">{s('no open files')}</span>}
    </div>
  );
}
