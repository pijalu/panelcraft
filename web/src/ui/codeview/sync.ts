// SPDX-License-Identifier: GPL-3.0-only
// Two-way sync state machine (M4-WP2) — FR-K2/K3/K5. Framework-free core:
// the CodeMirror adapter feeds textChanged/canvasChanged and renders
// snapshots; the machine owns all debouncing and state transitions.
//
// States: clean (buffer == canonical render) · editing (user typed, idle
// parse armed) · error (parse failed — buffer never clobbered, FR-K3) ·
// pending-apply (parsed doc handed to the canvas; applied() confirms).
// Canvas changes in non-clean states are queued (last wins) and flushed on
// the way back to clean — re-applied to the canvas AND re-rendered into the
// code view, so canvas and code always converge to the same doc (D-M4-5,
// last canvas-relevant event wins). Valid text always converges to clean
// with the canonical print in the buffer (FR-K2/K4).
import { parsePDL } from '../../engine/format/parser';
import { printDoc } from '../../engine/format/printer';
import type { Diagnostic } from '../../engine/format/diagnostics';
import type { Doc } from '../../engine/model/types';

export type SyncState = 'clean' | 'editing' | 'error' | 'pending-apply';

export interface SyncSnapshot {
  state: SyncState;
  /** What the editor should display (buffer; canonical after apply). */
  codeText: string;
  /** Parse diagnostics of the current buffer (empty unless error). */
  diagnostics: Diagnostic[];
  /** Buffer differs from the last saved text (FR-K5 close prompt). */
  divergedFromSaved: boolean;
}

export interface SyncMachinePort {
  /** Debounced timers (code re-render 150 ms; idle parse 300 ms). */
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  /** Canvas update port: hand the parsed doc to the canvas. */
  apply(doc: Doc): void;
  codeDebounceMs?: number;
  idleMs?: number;
}

export interface SyncMachine {
  /** Reset for a newly opened file (timers cancelled, state clean). */
  loadFile(text: string): void;
  /** User typed; arms the idle parse. Echo-suppressed when equal to buffer. */
  textChanged(text: string): void;
  /** Canvas IR changed (palette, drag, properties). */
  canvasChanged(doc: Doc): void;
  /** Format-on-save hook: canonicalize + apply + markSaved (FR-K4). */
  formatNow(): void;
  /** Consumer confirms the canvas has applied the pending doc. */
  applied(): void;
  /** Consumer saved `text` (file content now matches). */
  markSaved(text: string): void;
  snapshot(): SyncSnapshot;
  subscribe(fn: (s: SyncSnapshot) => void): () => void;
}

const CODE_MS = 150;
const IDLE_MS = 300;

class SyncMachineImpl implements SyncMachine {
  private state: SyncState = 'clean';
  private buffer = '';
  private savedText = '';
  private diagnostics: Diagnostic[] = [];
  private codeTimer: unknown = null;
  private idleTimer: unknown = null;
  private pendingCanvas: Doc | null = null;
  /** Cached canonical print of `buffer` (reset on every buffer change). */
  private bufferCanon: string | null = null;
  private readonly watchers = new Set<(s: SyncSnapshot) => void>();

  constructor(private readonly port: SyncMachinePort) {}

  snapshot = (): SyncSnapshot => ({
    state: this.state,
    codeText: this.buffer,
    diagnostics: this.diagnostics,
    // F-04: the buffer is kept verbatim after an idle apply, so "diverged"
    // means "means something other than what is saved", not "is not
    // byte-identical to the canonical print".
    divergedFromSaved: this.buffer === this.savedText ? false : this.canonOfBuffer() !== this.savedText,
  });

  /** Canonical form of the buffer (parse + print); the buffer itself if unparsable. */
  private canonOfBuffer(): string {
    if (this.bufferCanon !== null) return this.bufferCanon;
    const { doc } = parsePDL(this.buffer);
    this.bufferCanon = doc === null ? this.buffer : printDoc(doc);
    return this.bufferCanon;
  }

  subscribe = (fn: (s: SyncSnapshot) => void): (() => void) => {
    this.watchers.add(fn);
    fn(this.snapshot());
    return () => this.watchers.delete(fn);
  };

  loadFile = (text: string): void => {
    this.cancelAll();
    this.pendingCanvas = null;
    this.buffer = text;
    this.bufferCanon = null;
    this.savedText = text;
    this.diagnostics = [];
    this.state = 'clean';
    this.emit();
  };

  textChanged = (text: string): void => {
    if (text === this.buffer) return; // echo suppression
    this.buffer = text;
    this.bufferCanon = null;
    this.state = 'editing';
    this.diagnostics = [];
    // A pending canvas re-render must not clobber the freshly typed buffer.
    if (this.codeTimer !== null) {
      this.port.cancel(this.codeTimer);
      this.codeTimer = null;
    }
    if (this.idleTimer !== null) this.port.cancel(this.idleTimer);
    this.idleTimer = this.port.schedule(() => this.runIdleParse(), this.port.idleMs ?? IDLE_MS);
    this.emit();
  };

  canvasChanged = (doc: Doc): void => {
    if (this.state === 'clean') {
      this.renderFrom(doc);
      return;
    }
    this.pendingCanvas = doc; // flushed from reachClean (last wins)
  };

  formatNow = (): void => {
    this.cancelAll();
    const { doc } = this.parseBuffer();
    if (doc === null) {
      this.state = 'error';
      this.emit();
      return;
    }
    const canonical = printDoc(doc);
    const changed = canonical !== this.buffer || this.savedText !== canonical;
    this.buffer = canonical;
    this.bufferCanon = canonical;
    this.pendingCanvas = null;
    if (changed) this.port.apply(doc);
    this.state = 'clean';
    this.emit();
  };

  applied = (): void => {
    if (this.state !== 'pending-apply') return;
    if (this.idleTimer !== null) {
      this.port.cancel(this.idleTimer);
      this.idleTimer = null;
    }
    // F-04: the buffer stays exactly what the user typed — canonicalising it
    // here added `{ }` blocks and re-flowed the document under the caret while
    // typing. The canonical form goes to the file (markSaved) instead.
    this.reachClean();
  };

  markSaved = (text: string): void => {
    this.savedText = text;
    this.emit();
  };

  // ---- internals ------------------------------------------------------------

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.watchers) fn(snap);
  }

  private cancelAll(): void {
    if (this.codeTimer !== null) this.port.cancel(this.codeTimer);
    if (this.idleTimer !== null) this.port.cancel(this.idleTimer);
    this.codeTimer = null;
    this.idleTimer = null;
  }

  /** Debounced code re-render from `doc`; suppressed when already displayed. */
  private renderFrom(doc: Doc): void {
    if (printDoc(doc) === this.buffer) return;
    if (this.codeTimer !== null) this.port.cancel(this.codeTimer);
    this.codeTimer = this.port.schedule(() => {
      this.codeTimer = null;
      this.buffer = printDoc(doc);
      this.bufferCanon = this.buffer;
      this.emit();
    }, this.port.codeDebounceMs ?? CODE_MS);
  }

  private parseBuffer(): { doc: Doc | null } {
    const result = parsePDL(this.buffer);
    this.diagnostics = result.doc ? [] : result.diagnostics;
    return { doc: result.doc };
  }

  private runIdleParse(): void {
    this.idleTimer = null;
    const { doc } = this.parseBuffer();
    if (doc === null) {
      this.state = 'error'; // buffer untouched (FR-K3)
      this.emit();
      return;
    }
    this.state = 'pending-apply';
    this.emit();
    this.port.apply(doc);
  }

  private reachClean(): void {
    this.state = 'clean';
    if (this.pendingCanvas !== null) {
      // A canvas change queued while diverged is the last canvas-relevant
      // event: re-apply it (canvas converges) and re-render the code from it
      // (D-M4-5). Without the re-apply the canvas would keep the applied
      // buffer doc while the code shows the queued doc — a permanent
      // code≠canvas divergence.
      const doc = this.pendingCanvas;
      this.pendingCanvas = null;
      this.emit();
      this.port.apply(doc);
      this.renderFrom(doc);
      return;
    }
    this.emit();
  }
}

export function createSyncMachine(port: SyncMachinePort): SyncMachine {
  return new SyncMachineImpl(port);
}
