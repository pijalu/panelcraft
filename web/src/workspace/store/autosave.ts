// SPDX-License-Identifier: GPL-3.0-only
// M3-WP2: debounced autosave controller (FR-S1 — 800 ms trailing edge).
import { mapStoreError, type StoreError, type StoredWorkspace } from './port';

export interface AutosaveOpts {
  save: (ws: StoredWorkspace) => Promise<void>;
  /** Debounce window; SPEC FR-S1 = 800 ms. */
  delay?: number;
  /** Quota failures surface here (degrade to ephemeral + banner). */
  onQuota?: (err: Error) => void;
  /** Other failures remain pending and surface without claiming a save. */
  onError?: (err: StoreError) => void;
  /** Successful persistence timestamp, never the attempted-save timestamp. */
  onSaved?: (workspace: StoredWorkspace) => void;
}

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: StoredWorkspace | null = null;
  private flushing: Promise<void> | null = null;
  private readonly delay: number;
  private readonly save: (ws: StoredWorkspace) => Promise<void>;
  private readonly onQuota?: (err: Error) => void;
  private readonly onError?: (err: StoreError) => void;
  private readonly onSaved?: (workspace: StoredWorkspace) => void;

  constructor(opts: AutosaveOpts) {
    this.delay = opts.delay ?? 800;
    this.save = opts.save;
    this.onQuota = opts.onQuota;
    this.onError = opts.onError;
    this.onSaved = opts.onSaved;
  }

  /** Record the latest state and (re)start the debounce window. */
  schedule(ws: StoredWorkspace): void {
    this.pending = ws;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => {}); // errors surfaced via onQuota / flush()
    }, this.delay);
  }

  /** Save pending states in request order; rapid UI writes must not race. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) return this.flushing;
    const draining = this.drain();
    this.flushing = draining;
    try {
      await draining;
    } finally {
      this.flushing = null;
    }
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const ws = this.pending;
      this.pending = null;
      try {
        await this.save(ws);
        this.onSaved?.(ws);
      } catch (err) {
        const mapped = mapStoreError(err);
        // A newer record queued during the failed write remains authoritative.
        if (this.pending === null) this.pending = ws;
        if (mapped.code === 'quota') {
          this.onQuota?.(mapped);
          return;
        }
        this.onError?.(mapped);
        throw mapped;
      }
    }
  }

  /** Drop pending state and stop the timer (ephemeral switch / teardown). */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  get hasPending(): boolean {
    return this.pending !== null || this.timer !== null || this.flushing !== null;
  }
}
