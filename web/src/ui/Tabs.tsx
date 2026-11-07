// SPDX-License-Identifier: GPL-3.0-only
// M3-WP1 tab strip (FR-W2): click to switch, close buttons, dirty dots,
// pointer-based drag reorder (moveTab reducer owns the invariants).
import { useRef } from 'preact/hooks';
import type { Tab } from '../workspace/tabs';

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
    <div class="tab-strip" data-testid="tab-strip" role="tablist">
      {tabs.map((t, i) => (
        <span
          key={t.path}
          class={`tab${i === active ? ' tab-active' : ''}`}
          data-testid={`tab-${t.path}`}
          data-active={i === active ? 'true' : 'false'}
          role="tab"
          aria-selected={i === active}
          tabIndex={0}
          onPointerDown={() => {
            dragFrom.current = i;
          }}
          onPointerUp={() => {
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from === null || from === i) return;
            onReorder(from, i);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelect(i);
          }}
        >
          {t.dirty && <span class="tab-dirty" data-testid={`tab-dirty-${t.path}`} title="Unsaved changes">●</span>}
          <button
            type="button"
            class="tab-name"
            onClick={() => onSelect(i)}
          >
            {t.path.split('/').pop()}
          </button>
          <button
            type="button"
            class="tab-close"
            data-testid={`tab-close-${t.path}`}
            title="Close tab"
            aria-label={`Close ${t.path}`}
            onClick={() => onClose(i)}
          >
            ×
          </button>
        </span>
      ))}
      {tabs.length === 0 && <span class="tab-empty">no open files</span>}
    </div>
  );
}
