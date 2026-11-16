// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP13 presentation launcher: every flow in the active file with its
// title, one-line purpose, step count and estimated length, so presenting does
// not require knowing the PDL. Picking a row starts that flow and hands the
// shell to presentation mode; the transport stays the FlowRunner's job.
import { useEffect, useRef } from 'preact/hooks';
import { formatDuration, type FlowEntry } from './flowCatalog';
import { CloseIcon, PlayIcon } from '../icons';
import { s } from '../strings';

export interface PresentLauncherProps {
  entries: FlowEntry[];
  /** Start this flow (key from the catalog) and enter presentation. */
  onPresent(key: string): void;
  onClose(): void;
}

/** Modal flow picker (Escape closes, focus lands on the first flow). */
export function PresentLauncher({ entries, onPresent, onClose }: PresentLauncherProps) {
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div class="launcher-backdrop" data-testid="present-launcher-backdrop" onClick={onClose}>
      <div
        class="launcher"
        data-testid="present-launcher"
        role="dialog"
        aria-modal="true"
        aria-label={s('Present a flow')}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="launcher-head">
          <h2>{s('Present a flow')}</h2>
          <button type="button" data-testid="launcher-close" aria-label={s('Close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <p class="launcher-intro">
          {s('Pick a walkthrough to present. Each step frames its own part of the diagram.')}
        </p>
        {entries.length === 0 ? (
          <p class="launcher-empty" data-testid="launcher-empty">
            {s('No flows in this file yet. Add one in Flow Steps.')}
          </p>
        ) : (
          <ul class="launcher-list" data-testid="launcher-list">
            {entries.map((entry, i) => (
              <li key={entry.key}>
                <button
                  type="button"
                  class="launcher-row"
                  data-testid={`launcher-flow-${entry.key}`}
                  aria-label={s('Present {title}', { title: entry.title })}
                  ref={i === 0 ? first : null}
                  onClick={() => onPresent(entry.key)}
                >
                  <span class="launcher-play" aria-hidden="true">
                    <PlayIcon />
                  </span>
                  <span class="launcher-text">
                    <strong data-testid={`launcher-title-${entry.key}`}>{entry.title}</strong>
                    {entry.description !== undefined && (
                      <span class="launcher-desc" data-testid={`launcher-desc-${entry.key}`}>
                        {entry.description}
                      </span>
                    )}
                    <span class="launcher-meta" data-testid={`launcher-meta-${entry.key}`}>
                      {s(entry.steps === 1 ? '{steps} step, about {length}' : '{steps} steps, about {length}', {
                        steps: entry.steps,
                        length: formatDuration(entry.estimatedMs),
                      })}
                      {entry.derived === true && (
                        <span data-testid={`launcher-derived-${entry.key}`}>{` · ${s('from the connections')}`}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
