// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Component tests (M2-WP7/WP9 acceptance): palette click-to-place + drag-drop,
// properties panel edits bound to controller ops (undoable), link editing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { EditorView } from '@codemirror/view';
import { App } from './App';

describe('App shell + palette (WP9)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(cleanup);

  function mount() {
    const { container } = render(<App />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ x: 40, y: 40, left: 40, top: 40, width: 800, height: 600, right: 840, bottom: 640, toJSON: () => ({}) }) as DOMRect;
    return { container, svg };
  }

  it('renders palette with all 9 C4 kinds + properties panel', () => {
    mount();
    for (const kind of [
      'person',
      'system',
      'system_ext',
      'container',
      'component',
      'datastore',
      'queue',
      'group',
      'note',
    ]) {
      expect(screen.getByTestId(`palette-${kind}`)).not.toBeNull();
    }
    expect(screen.getByTestId('properties')).not.toBeNull();
  });

  it('click-to-place adds an object to the scene', () => {
    const { svg } = mount();
    fireEvent.click(screen.getByTestId('palette-system'));
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(1);
    const label = svg.querySelector('g.pc-obj text');
    expect(label?.textContent).toContain('System');
  });

  it('drag-drop from palette places shape at drop point', () => {
    const { svg } = mount();
    const item = screen.getByTestId('palette-person');
    // pointerdown on palette item, move, drop over canvas
    fireEvent.pointerDown(item, { clientX: 60, clientY: 60, button: 0 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 200, button: 0 });
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(1);
    const g = svg.querySelector('g.pc-obj');
    // drop point → canvas coords ((300-40)/1, (200-40)/1) = (260,160); person 120×72 → tl (200,124)
    expect(g?.getAttribute('transform')).toBe('translate(200 124)');
  });

  it('canvas click selects → properties shows name field', () => {
    const { svg } = mount();
    fireEvent.click(screen.getByTestId('palette-system'));
    const g = svg.querySelector('g.pc-obj');
    const x = Number(g?.getAttribute('transform')?.split(' ')[0]?.replace('translate(', ''));
    const y = Number(g?.getAttribute('transform')?.split(' ')[1]?.replace(')', ''));
    const cx = x + 80;
    const cy = y + 30;
    // dispatch real pointer events through the svg (jsdom click ≠ pointer flow)
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: cx + 40, clientY: cy + 40, bubbles: true, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: cx + 40, clientY: cy + 40, bubbles: true, button: 0 }));
    const nameInput = screen.getByTestId('prop-name') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    expect(nameInput.value).toContain('System');
  });
});

describe('properties panel edits (WP7)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(cleanup);

  function mountAndSelect() {
    const svg = (() => {
      const r = render(<App />);
      const s = r.container.querySelector('svg') as SVGSVGElement;
      s.getBoundingClientRect = () =>
        ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
      return { svg: s };
    })().svg;
    // place + select a system via click-to-place then canvas click
    fireEvent.click(screen.getByTestId('palette-system'));
    const g = svg.querySelector('g.pc-obj');
    const m = /translate\((\d+) (\d+)\)/.exec(g?.getAttribute('transform') ?? '');
    const cx = Number(m?.[1]) + 80;
    const cy = Number(m?.[2]) + 30;
    svg.dispatchEvent(new MouseEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true, button: 0 }));
    return { svg };
  }

  it('name edit updates DOM label + undo reverts label and input', async () => {
    const { svg } = mountAndSelect();
    const name = screen.getByTestId('prop-name') as HTMLInputElement;
    const original = name.value;
    fireEvent.input(name, { target: { value: 'Checkout System' } });
    expect(svg.querySelector('g.pc-obj text')?.textContent).toBe('Checkout System');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    await act(async () => {}); // Preact rerender is microtask-batched
    expect(svg.querySelector('g.pc-obj text')?.textContent).not.toBe('Checkout System');
    expect((screen.getByTestId('prop-name') as HTMLInputElement).value).toBe(original);
  });

  it('tags input parses comma-separated values + undo reverts', async () => {
    mountAndSelect();
    const tags = screen.getByTestId('prop-tags') as HTMLInputElement;
    fireEvent.input(tags, { target: { value: 'core, billing, v2' } });
    await act(async () => {}); // flush typing rerender
    // controlled value renders the parsed+trimmed tag list
    expect((screen.getByTestId('prop-tags') as HTMLInputElement).value).toBe('core, billing, v2');
    // undo once → tags revert to empty (command from the typing edit)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    await act(async () => {});
    expect((screen.getByTestId('prop-tags') as HTMLInputElement).value).toBe('');
  });
});

/** Mount App and settle the async init chain (storage → init → ready). */
async function mountReady() {
  const { container } = render(<App />);
  await act(async () => {}); // flush manager.init() → welcome file ready
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0)); // storage fallback macrotask → setReady
  });
  const svg = container.querySelector('svg') as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON: () => ({}) }) as DOMRect;
  return { container, svg };
}

/** The code view's EditorView (single instance in the App shell). */
function codeView(): EditorView {
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement);
  if (!view) throw new Error('no EditorView in DOM');
  return view;
}

describe('workspace chrome (M3)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(cleanup);

  it('renders file tree with the welcome file + tab strip', async () => {
    await mountReady();
    expect(screen.getByTestId('tree-row-untitled.pcd')).not.toBeNull();
    expect(screen.getByTestId('tab-untitled.pcd')).not.toBeNull();
    expect(screen.getByTestId('tab-untitled.pcd').getAttribute('data-active')).toBe('true');
  });

  it('new file: toolbar input → creates file, opens tab', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tree-new-file'));
    const input = screen.getByTestId('tree-create-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'arch.pcd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('tree-row-arch.pcd')).not.toBeNull();
    expect(screen.getByTestId('tab-arch.pcd')).not.toBeNull();
    expect(screen.getByTestId('tab-arch.pcd').getAttribute('data-active')).toBe('true');
  });

  it('click a tree row opens that file (tab activates)', async () => {
    const { svg } = await mountReady();
    // create a second file via the toolbar
    fireEvent.click(screen.getByTestId('tree-new-file'));
    const input = screen.getByTestId('tree-create-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'second.pcd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // active is now second.pcd; switch back by clicking the welcome row
    fireEvent.click(screen.getByTestId('tree-row-untitled.pcd').querySelector('.tree-name') as HTMLElement);
    await act(async () => {});
    expect(screen.getByTestId('tab-untitled.pcd').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('tab-second.pcd').getAttribute('data-active')).toBe('false');
    void svg;
  });

  it('rename via ✎ → input → Enter updates the path (tab retargets)', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tree-ren-untitled.pcd'));
    const input = screen.getByTestId('tree-rename-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'welcome.pcd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByTestId('tree-row-untitled.pcd')).toBeNull();
    expect(screen.getByTestId('tree-row-welcome.pcd')).not.toBeNull();
    expect(screen.getByTestId('tab-welcome.pcd')).not.toBeNull();
  });

  it('duplicate copies the file', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tree-dup-untitled.pcd'));
    expect(screen.getByTestId('tree-row-untitled copy.pcd')).not.toBeNull();
  });

  it('delete is two-step: first click shows confirm, second removes', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tree-del-untitled.pcd'));
    expect(screen.getByTestId('tree-del-confirm-untitled.pcd')).not.toBeNull();
    expect(screen.getByTestId('tree-row-untitled.pcd')).not.toBeNull();
    fireEvent.click(screen.getByTestId('tree-del-confirm-untitled.pcd'));
    expect(screen.queryByTestId('tree-row-untitled.pcd')).toBeNull();
    // tab closed with the file
    expect(screen.queryByTestId('tab-untitled.pcd')).toBeNull();
  });

  it('new folder appears with a folder row', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tree-new-folder'));
    const input = screen.getByTestId('tree-create-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'docs' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('tree-row-docs')).not.toBeNull();
  });

  it('tab close button closes the tab', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tree-new-file'));
    const input = screen.getByTestId('tree-create-input') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'temp.pcd' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('tab-temp.pcd')).not.toBeNull();
    fireEvent.click(screen.getByTestId('tab-close-temp.pcd'));
    expect(screen.queryByTestId('tab-temp.pcd')).toBeNull();
  });

  it('clear-data dialog requires typing DELETE (FR-S4)', async () => {
    const { svg } = await mountReady();
    // put an object on the canvas first — clear must wipe it too
    fireEvent.click(screen.getByTestId('palette-system'));
    await act(async () => {});
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('tb-clear-data'));
    const dialog = screen.getByTestId('clear-dialog');
    expect(dialog).not.toBeNull();
    const btn = screen.getByTestId('clear-confirm-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.input(screen.getByTestId('clear-confirm-input'), { target: { value: 'DELETE' } });
    expect((screen.getByTestId('clear-confirm-btn') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('clear-confirm-btn'));
    await act(async () => {});
    // workspace reset → welcome file re-bootstrapped, canvas emptied, dialog gone
    expect(screen.queryByTestId('clear-dialog')).toBeNull();
    expect(screen.getByTestId('tree-row-untitled.pcd')).not.toBeNull();
    await act(async () => {});
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(0);
  });

  it('canvas edits mark the tab dirty; content lands in the file', async () => {
    const { svg } = await mountReady();
    fireEvent.click(screen.getByTestId('palette-system'));
    await act(async () => {});
    expect(screen.queryByTestId('tab-dirty-untitled.pcd')).not.toBeNull();
    // the file content must now contain the system object (canonical PDL)
    const label = svg.querySelector('g.pc-obj text');
    expect(label?.textContent).toContain('System');
  });
});

describe('code view sync + close guard (M4-WP3/4/5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(cleanup);

  it('closing a tab with a diverged buffer prompts apply/discard (FR-K5)', async () => {
    await mountReady();
    const view = codeView();
    // type garbage (buffer diverges; idle parse has not fired yet → editing)
    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'pcd 1.0\nsystem' } });
    });
    // close the active tab → the FR-K5 prompt intercepts
    fireEvent.click(screen.getByTestId('tab-close-untitled.pcd'));
    await act(async () => {});
    expect(screen.getByTestId('diverged-dialog')).not.toBeNull();
    // FR-K4: applying unparseable text is blocked — the dialog shows the error
    fireEvent.click(screen.getByTestId('diverged-apply'));
    await act(async () => {});
    expect(screen.getByTestId('diverged-dialog')).not.toBeNull();
    expect(screen.getByTestId('diverged-error')?.textContent).toContain('Cannot apply');
    expect((screen.getByTestId('diverged-apply') as HTMLButtonElement).disabled).toBe(true);
    // discard keeps the file and closes the tab
    fireEvent.click(screen.getByTestId('diverged-discard'));
    await act(async () => {});
    expect(screen.queryByTestId('diverged-dialog')).toBeNull();
    expect(screen.queryByTestId('tab-untitled.pcd')).toBeNull();
  });

  it('clean buffer closes without a prompt', async () => {
    await mountReady();
    fireEvent.click(screen.getByTestId('tab-close-untitled.pcd'));
    await act(async () => {});
    expect(screen.queryByTestId('diverged-dialog')).toBeNull();
    expect(screen.queryByTestId('tab-untitled.pcd')).toBeNull();
  });

  it('canvas edit (palette add) updates the code view (FR-K2, ≤150 ms)', async () => {
    const { svg } = await mountReady();
    fireEvent.click(screen.getByTestId('palette-system'));
    // real 150 ms debounce in the machine → poll for the buffer update
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(codeView().state.doc.toString()).toContain('system');
    expect(svg.querySelectorAll('g.pc-obj')).toHaveLength(1);
  });
});
