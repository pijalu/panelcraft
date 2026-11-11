// SPDX-License-Identifier: GPL-3.0-only
// QuickSearch dialog (M6-WP5, FR-W6): Ctrl/Cmd+P overlay, fuzzy over
// files/objects/flows, arrow-key navigation, Enter picks, Esc closes.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { search, type SearchEntry } from './searchIndex';
import { s } from '../strings';

export interface SearchDialogProps {
  /** Workspace-wide entries (built by the caller, e.g. from snapshotTree). */
  entries: SearchEntry[];
  onPick(entry: SearchEntry): void;
  onClose(): void;
}

/** Next/prev index within bounds. */
function step(i: number, n: number, dir: 1 | -1): number {
  if (n === 0) return 0;
  return (i + dir + n) % n;
}

export function SearchDialog(props: SearchDialogProps) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const hits = useMemo(() => search(props.entries, query), [props.entries, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSel(0);
  }, [query]);

  // Keep the highlighted row in view (keyboard navigation); jsdom-safe.
  useEffect(() => {
    const row = listRef.current?.children[sel];
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [sel, hits.length]);

  const pick = (i: number): void => {
    const h = hits[i];
    if (h) props.onPick(h);
    props.onClose();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      props.onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => step(s, hits.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => step(s, hits.length, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(sel);
    }
  };

  return (
    <div class="search-overlay" data-testid="search-overlay" onKeyDown={onKey}>
      <div class="search-dialog" role="dialog" aria-label={s("Quick search")}>
        <input
          ref={inputRef}
          class="search-input"
          data-testid="search-input"
          placeholder={s("Search files, objects, flows…")}
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <ul class="search-results" data-testid="search-results" ref={listRef}>
          {hits.length === 0 && <li class="search-empty">{s("no matches")}</li>}
          {hits.map((h, i) => (
            <li key={`${h.kind}:${h.path}:${h.id ?? ''}`}>
              <button
                type="button"
                class={i === sel ? 'search-row search-row-active' : 'search-row'}
                data-testid={`search-row-${i}`}
                onClick={() => pick(i)}
                onMouseEnter={() => setSel(i)}
              >
                <span class={`search-kind search-kind-${h.kind}`}>{s(h.kind)}</span>
                <span class="search-label">{h.label}</span>
                {h.path !== h.label && <span class="search-path">{h.path}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
