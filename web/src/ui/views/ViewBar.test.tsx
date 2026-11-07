// SPDX-License-Identifier: GPL-3.0-only
// ViewBar component tests (M6-WP1/WP2): chips toggle view hide-tags via the
// retext round-trip; view switch + apply-layout commit through the harness.
// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { ViewBar, type ViewBarProps } from './ViewBar';
import type { CanvasController } from '../CanvasController';

const DOC = `pcd 1.0

system api "API" { tag backend }
system db "DB" { tag backend storage }
system web "Web" { tag frontend }

api -> db as L1 { tag sync }
api -> web

view "Roadmap" {
  hide tag frontend
  layout saved
  position api (10, 20)
  position db (300, 40)
}
`;

function fakeCtrl(): CanvasController {
  const positions: Record<string, { x: number; y: number }> = {
    api: { x: 0, y: 0 },
    db: { x: 100, y: 0 },
    web: { x: 200, y: 0 },
  };
  return {
    setFaded: vi.fn(),
    applyPositions: vi.fn(),
    currentPositions: () => positions,
    // F-14: the view bar applies layout through the undoable command; the double
    // must model that API (calling applyPositions like the real controller does),
    // otherwise the double hides a production call.
    applyLayoutCommand: vi.fn((next: Record<string, { x: number; y: number }>) => {
      Object.assign(positions, next);
    }),
    clearPositions: vi.fn(),
  } as unknown as CanvasController;
}

/** Harness: keeps text + view name in state, like App does. */
function Harness(props: Partial<ViewBarProps> = {}) {
  const [text, setText] = useState(DOC);
  const [viewName, setViewName] = useState<string | undefined>(undefined);
  const ctrl = fakeCtrl();
  const all: ViewBarProps = {
    text,
    viewName,
    onView: setViewName,
    onChangeText: setText,
    ctrl,
    selection: [],
    ...props,
  };
  return (
    <div>
      <ViewBar {...all} />
      <pre data-testid="text-out">{text}</pre>
      <span data-testid="view-out">{viewName ?? '(default)'}</span>
    </div>
  );
}

function out(): string {
  return screen.getByTestId('text-out').textContent ?? '';
}

describe('ViewBar', () => {
  afterEach(cleanup);

  it('renders chips for all distinct tags (objects + links), sorted', () => {
    render(<Harness />);
    const labels = ['backend', 'frontend', 'storage', 'sync'].map((t) => screen.getByTestId(`tag-chip-${t}`).textContent);
    expect(labels).toEqual(['backend', 'frontend', 'storage', 'sync']);
  });

  it('chip click writes `hide tag` into the active view (round-trip)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('tag-chip-storage'));
    expect(out()).toContain('view "Default"'); // implicit → created on first toggle
    expect(out()).toContain('hide tag storage');
  });

  it('chip click on a named view writes into that view', () => {
    render(<Harness viewName="Roadmap" />);
    fireEvent.click(screen.getByTestId('tag-chip-sync'));
    expect(out()).toContain('hide tag sync');
    const roadmap = out().split('view "Roadmap" {')[1] ?? '';
    expect(roadmap).toContain('hide tag frontend');
    expect(roadmap).toContain('hide tag sync');
  });

  it('active chip reflects the view state (chip-active class)', () => {
    render(<Harness viewName="Roadmap" />);
    expect(screen.getByTestId('tag-chip-frontend').className).toContain('chip-active');
    expect(screen.getByTestId('tag-chip-storage').className).not.toContain('chip-active');
  });

  it('second chip click removes the hide tag line', () => {
    render(<Harness viewName="Roadmap" />);
    fireEvent.click(screen.getByTestId('tag-chip-frontend'));
    expect(out()).not.toContain('hide tag frontend');
  });

  it('add view creates "View 1", selects it, delete removes it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('view-add'));
    expect(out()).toContain('view "View 1"');
    expect(screen.getByTestId('view-out').textContent).toBe('View 1');
    fireEvent.click(screen.getByTestId('view-del'));
    expect(out()).not.toContain('view "View 1"');
    expect(screen.getByTestId('view-out').textContent).toBe('(default)');
  });

  it('view switch applies saved positions to the controller (session only, no text change)', () => {
    const ctrl = fakeCtrl();
    render(<Harness ctrl={ctrl} />);
    fireEvent.change(screen.getByTestId('view-select'), { target: { value: 'Roadmap' } });
    expect(screen.getByTestId('view-out').textContent).toBe('Roadmap');
    expect(ctrl.applyPositions).toHaveBeenCalledWith(expect.objectContaining({ api: { x: 10, y: 20 }, db: { x: 300, y: 40 } }));
    expect(out()).toBe(DOC); // no file change on switch
  });

  it('apply layout commits position lines to the file (explicit apply-to-file)', () => {
    const ctrl = fakeCtrl();
    render(<Harness ctrl={ctrl} viewName="Roadmap" />);
    fireEvent.click(screen.getByTestId('apply-layout'));
    expect(out()).toContain('position api (');
    expect(out()).toContain('position db (');
  });

  it('layout mode toggle flips saved→auto→saved in the view block', () => {
    render(<Harness viewName="Roadmap" />); // fixture Roadmap starts `layout saved`
    fireEvent.click(screen.getByTestId('layout-mode'));
    expect(out()).toContain('layout auto LR');
    fireEvent.click(screen.getByTestId('layout-mode'));
    expect(out()).toContain('layout saved');
    expect(out().match(/layout /g)).toHaveLength(1);
  });

  it('pin/hide act on the given selection ids', () => {
    render(<Harness viewName="Roadmap" selection={['api']} />);
    fireEvent.click(screen.getByTestId('pin-sel'));
    expect(out()).toContain('pin api');
    fireEvent.click(screen.getByTestId('hide-sel'));
    expect(out()).toContain('hide api');
  });

  it('null text renders the empty bar (no crash)', () => {
    render(<Harness text={null} />);
    expect(screen.getByTestId('viewbar').className).toContain('viewbar-empty');
  });
});
