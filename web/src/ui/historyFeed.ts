// SPDX-License-Identifier: GPL-3.0-only
// Unified history feed (F-24): canvas commands and code edits land in one
// ordered journal so the shell can show what happened across surfaces. The
// stacks themselves stay where they belong (canvas: UndoStack, code: the
// editor's own history) — this is the shared *view* plus the routing rule.

export type Surface = 'canvas' | 'code';

export interface HistoryEntry {
  surface: Surface;
  /** Human label ('move system api', 'code edit'). */
  label: string;
  /** Monotonic sequence number (1-based). */
  seq: number;
  /** Folds a run of like actions (one drag, one typing burst) into one row. */
  mergeKey?: string;
}

export const HISTORY_CAP = 40;

export class HistoryFeed {
  private entries: HistoryEntry[] = [];
  private seq = 0;

  /**
   * Record an entry. Consecutive entries with the same `mergeKey` (a drag run,
   * a typing run) fold into the previous one so the affordance shows one row
   * per user action rather than one per pointer move.
   */
  record(surface: Surface, label: string, mergeKey?: string): HistoryEntry {
    const top = this.entries[this.entries.length - 1];
    this.seq += 1;
    if (top !== undefined && mergeKey !== undefined && mergeKey === top.mergeKey) {
      const merged: HistoryEntry = { ...top, label };
      this.entries[this.entries.length - 1] = merged;
      return merged;
    }
    const entry: HistoryEntry = { surface, label, seq: this.seq };
    if (mergeKey !== undefined) entry.mergeKey = mergeKey;
    this.entries.push(entry);
    if (this.entries.length > HISTORY_CAP) this.entries.shift();
    return entry;
  }

  /** Most recent first, at most `limit` rows. */
  recent(limit = 12): HistoryEntry[] {
    return [...this.entries].reverse().slice(0, limit);
  }

  get last(): HistoryEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

/** Which surface a `Ctrl/Cmd+Z` should act on, given where focus is. */
export function undoSurface(focusInCode: boolean, last: HistoryEntry | undefined): Surface {
  if (focusInCode) return 'code';
  return last?.surface === 'code' ? 'canvas' : (last?.surface ?? 'canvas');
}
