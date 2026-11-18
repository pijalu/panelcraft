// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// The code pane must not offer an editor before the open file's text is in the
// sync machine. The machine reports "clean" while it is still empty (nothing has
// been loaded yet), so an editor rendered on that signal invites a keystroke the
// incoming file text then overwrites — the document ends up duplicated and
// unparsable. The pane therefore gates on `loaded`, and this file pins that.
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/preact';
import { CodePane } from './CodePane';
import { createSyncMachine } from './codeview/sync';

function machine() {
  return createSyncMachine({
    schedule: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    apply: () => {},
  });
}

function mount(loaded: boolean) {
  const m = machine();
  return render(
    <CodePane
      machine={m}
      snapshot={m.snapshot()}
      loaded={loaded}
      onFormat={vi.fn()}
    />,
  );
}

describe('code pane readiness', () => {
  it('shows no editor while the file has not been loaded', () => {
    const { container } = mount(false);
    expect(container.querySelector('[data-testid="code-loading"]')).not.toBeNull();
    expect(container.querySelector('.cm-content')).toBeNull();
    // the chip is still readable, so the pane is not simply blank
    expect(container.querySelector('[data-testid="sync-state"]')).not.toBeNull();
  });

  it('shows the editor once the file is loaded', () => {
    const { container } = mount(true);
    expect(container.querySelector('[data-testid="code-loading"]')).toBeNull();
    expect(container.querySelector('.cm-editor')).not.toBeNull();
  });
});
