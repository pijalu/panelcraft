// SPDX-License-Identifier: GPL-3.0-only
// M3-WP2: debounced autosave controller (FR-S1 — 800 ms trailing edge).
import { mapStoreError, type StoredWorkspace } from './port';

export interface AutosaveOpts {
  save: (ws: StoredWorkspace) => Promise<void>;
  /** Debounce window; SPEC FR-S1 = 800 ms. */
  delay?: number;
  /** Quota failures surface here (FR-S3: degrade to ephemeral + banner). */
  onQuota?: (err: Error) => void;
}

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: StoredWorkspace | null = null;
  private readonly delay: number;
  private readonly save: (ws: StoredWorkspace) => Promise<void>;
  private readonly onQuota?: (err: Error) => void;

  constructor(opts: AutosaveOpts) {
    this.delay = opts.delay ?? 800;
    this.save = opts.save;
    this.onQuota = opts.onQuota;
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

  /** Save the pending state immediately (flush on export/close/visibility). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ws = this.pending;
    if (!ws) return;
    this.pending = null;
    try {
      await this.save(ws);
    } catch (err) {
      const mapped = mapStoreError(err);
      this.pending = ws; // keep for a later flush — a failed save must not vanish
      if (mapped.code === 'quota') this.onQuota?.(mapped);
      else throw mapped;
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
    return this.pending !== null || this.timer !== null;
  }
}
