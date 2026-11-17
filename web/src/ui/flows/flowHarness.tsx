// SPDX-License-Identifier: GPL-3.0-only
// Test harness for the two flow surfaces. The step list and the Properties panel
// are two views of one document, so a test mounts both against a single session —
// exactly how the shell wires them — and can read back the text that was written.
// @vitest-environment jsdom
import { useState } from 'preact/hooks';
import type { IllustrationId } from '../../engine/anim/illustrations';
import type { Doc } from '../../engine/model/types';
import { FlowPane } from './FlowPane';
import { FlowPanel } from './FlowPanel';
import { parseForEditor, useFlowSession } from './flowSession';
import type { FlowCanvasContext, FlowSelection, ViewPoint } from './flowTypes';
import { pick } from './pick';

export interface HarnessOptions {
  /** Initial document; defaults to the shared fixture. */
  doc?: string;
  /** Text of `other.pcd` for `goto` file/flow pickers. */
  otherDoc?: string;
  files?: string[];
  canvas?: FlowCanvasContext;
  view?: () => ViewPoint | null;
  illustration?: IllustrationId | 'auto';
  onIllustration?(id: IllustrationId | 'auto'): void;
  /** Observe each write without replacing the harness's own state. */
  onWrite?(text: string): void;
  onHighlight?(ids: string[] | null): void;
  onPlay?(flowKey: string): void;
  onPlayFrom?(flowKey: string, index: number): void;
  selection?: FlowSelection | null;
  /** Path of the open file; null means no file is active. */
  activePath?: string | null;
  /** Render only the step list (the panel is on by default). */
  panel?: boolean;
  dirty?: boolean;
}

export const FIXTURE = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start"
  a -> b : "order"
  alt "how?" {
    "fast" { a -> b : "rush" }
    "slow" { process b }
  }
  par "both" {
    { info "one" }
    { process a }
  }
  goto "other.pcd#refund" return here
  conclusion "done"
}
`;

export const OTHER_FIXTURE = `pcd 1.0

system s "Service"

flow "Refund" as refund {
  intro "start"
  process s
}

flow "Refund two" as refund2 {
  intro "start"
  process s
}
`;

/** Mount both surfaces over one document, one session and one selection. */
export function FlowHarness(opts: HarnessOptions = {}) {
  const [text, setText] = useState(opts.doc ?? FIXTURE);
  const [selection, setSelection] = useState<FlowSelection | null>(opts.selection ?? null);
  const session = useFlowSession(text, 1, (next) => {
    setText(next);
    opts.onWrite?.(next);
  });
  const doc: Doc | null = parseForEditor(text);
  const activePath = opts.activePath === undefined ? 'main.pcd' : opts.activePath;
  const textOf = (path: string): string | null =>
    path === 'other.pcd' ? (opts.otherDoc ?? null) : text;
  const shared = { session, textOf, activePath };
  return (
    <div>
      <FlowPane
        {...shared}
        doc={doc}
        onPlay={(key) => opts.onPlay?.(key)}
        onPlayFrom={(key, index) => opts.onPlayFrom?.(key, index)}
        selection={selection}
        onSelection={setSelection}
        {...pick({ canvas: opts.canvas, files: opts.files, onHighlight: opts.onHighlight })}
      />
      {opts.panel !== false && doc !== null && selection !== null && (
        <FlowPanel
          {...shared}
          doc={doc}
          selection={selection}
          {...pick({
            files: opts.files,
            canvas: opts.canvas,
            view: opts.view,
            illustration: opts.illustration,
            onIllustration: opts.onIllustration,
            dirty: opts.dirty,
          })}
          onPlay={(key) => opts.onPlay?.(key)}
          onSelect={setSelection}
        />
      )}
      <pre data-testid="text-out">{text}</pre>
    </div>
  );
}
