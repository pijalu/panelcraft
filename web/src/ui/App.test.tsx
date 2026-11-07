// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// Component tests (M2-WP7/WP9 acceptance): palette click-to-place + drag-drop,
// properties panel edits bound to controller ops (undoable), link editing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
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
