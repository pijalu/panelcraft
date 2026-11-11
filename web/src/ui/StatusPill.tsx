// SPDX-License-Identifier: GPL-3.0-only
// Saved/dirty pill (F-25, visibility of system status): the app always says
// whether the file on disk matches the buffer, and when it last saved.
import type { ComponentChildren } from 'preact';
import { s } from './strings';

export interface StatusPillProps {
  /** Buffer differs from the file, or the file has never been written. */
  dirty: boolean;
  /** Epoch ms of the last write (null = never). */
  savedAt: number | null;
  /** Parse problems currently reported (0 = none). */
  problems: number;
  /** Injected clock so tests are deterministic. */
  now?: () => number;
}

/** `14:05` in local time, or null when the timestamp is not usable. */
export function clockLabel(savedAt: number | null, now: () => number = Date.now): string | null {
  if (savedAt === null || !Number.isFinite(savedAt) || savedAt <= 0) return null;
  const d = new Date(Math.min(savedAt, now()));
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function StatusPill(props: StatusPillProps): ComponentChildren {
  const clock = clockLabel(props.savedAt, props.now);
  const text = props.dirty ? s('Unsaved') : clock === null ? s('Saved') : s('Saved · {time}', { time: clock });
  return (
    <span class="status-pill" data-testid="status-pill" data-dirty={String(props.dirty)}>
      <span class="status-dot" aria-hidden="true" />
      <span>{text}</span>
      {props.problems > 0 && (
        <span class="problem-chip" data-testid="problem-chip">
          {props.problems} {s('problem')}{props.problems === 1 ? '' : s('s')}
        </span>
      )}
    </span>
  );
}
