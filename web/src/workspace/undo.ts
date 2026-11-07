// SPDX-License-Identifier: GPL-3.0-only
// Undo/redo command stack (M2-WP8, FR-C9): ≥100 steps, coalescing windows
// for drag/typing, redo tail cleared on new work. Clock is injected (port
// rule, docs/ARCHITECTURE) so tests are deterministic.

export interface Command {
  readonly label: string;
  undo(): void;
  redo(): void;
}

/** A command that can absorb follow-up commands of the same kind. */
export interface CoalescableCommand extends Command {
  /** Absorb `next` (same key, within window) → merged command, or null. */
  coalesce(next: CoalescableCommand): CoalescableCommand | null;
  readonly coalesceKey?: string;
}

export const UNDO_CAP = 100;
export const COALESCE_WINDOW_MS = 1000;

export class UndoStack {
  private undoStack: CoalescableCommand[] = [];
  private redoStack: CoalescableCommand[] = [];
  private lastPushAt = -Infinity;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get size(): number {
    return this.undoStack.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Top command's coalesce key (testing/debug). */
  get topKey(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.coalesceKey;
  }

  /**
   * Push a completed command. Coalesces into the top when the key matches
   * within the window (drag moves, keystrokes); clears the redo tail.
   */
  push(cmd: CoalescableCommand): void {
    const t = this.now();
    const top = this.undoStack[this.undoStack.length - 1];
    if (
      top &&
      cmd.coalesceKey !== undefined &&
      top.coalesceKey === cmd.coalesceKey &&
      t - this.lastPushAt <= COALESCE_WINDOW_MS
    ) {
      const merged = top.coalesce(cmd);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        this.lastPushAt = t;
        return;
      }
    }
    this.undoStack.push(cmd);
    this.lastPushAt = t;
    if (this.redoStack.length > 0) this.redoStack = [];
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
  }

  /** Roll the top command back. Returns its label, or null when empty. */
  undo(): string | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.undo();
    this.redoStack.push(cmd);
    this.lastPushAt = -Infinity; // undo/redo breaks coalescing runs
    return cmd.label;
  }

  /** Re-apply a previously undone command. Returns label, or null. */
  redo(): string | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.redo();
    this.undoStack.push(cmd);
    this.lastPushAt = -Infinity;
    return cmd.label;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastPushAt = -Infinity;
  }
}

/**
 * Generic value-change command (properties panel, drags): `set` applies the
 * value; coalescing keeps the *original* `before` and the *latest* `after`,
 * so a typing run undoes to the pre-typing value in one step (FR-C9).
 */
export class ValueChange<T> implements CoalescableCommand {
  constructor(
    private readonly set: (v: T) => void,
    readonly before: T,
    readonly after: T,
    readonly coalesceKey: string,
    readonly label: string = 'change',
    private readonly equals: (a: T, b: T) => boolean = Object.is,
  ) {}

  /** Create + immediately apply (the `do` half of the command). */
  static apply<T>(
    set: (v: T) => void,
    before: T,
    after: T,
    key: string,
    label?: string,
    equals?: (a: T, b: T) => boolean,
  ): ValueChange<T> {
    const cmd = new ValueChange(set, before, after, key, label, equals);
    set(after);
    return cmd;
  }

  undo(): void {
    this.set(this.before);
  }

  redo(): void {
    this.set(this.after);
  }

  coalesce(next: CoalescableCommand): CoalescableCommand | null {
    if (!(next instanceof ValueChange)) return null;
    if (!this.equals(next.before, this.after)) return null; // state moved underneath
    return new ValueChange<T>(
      this.set,
      this.before,
      next.after,
      this.coalesceKey,
      this.label,
      this.equals,
    );
  }
}
