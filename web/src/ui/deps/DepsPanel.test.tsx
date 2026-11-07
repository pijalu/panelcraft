// SPDX-License-Identifier: GPL-3.0-only
// DepsPanel component tests (M6-WP4): list rendering, click-through,
// fade ownership wiring on a stub controller.
// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { DepsPanel, type DepsPanelProps } from './DepsPanel';
import type { CanvasController } from '../CanvasController';

const TEXT = `pcd 1.0
system api "API"
system db "DB"
system auth "Auth"
system cache "Cache"
api -> db : "queries"
auth -> api : "validates"
db -> cache : "sync"
`;

function stubCtrl(): CanvasController {
  return {
    setFaded: vi.fn(),
  } as unknown as CanvasController;
}

function Harness(props: Partial<DepsPanelProps> = {}) {
  const picked: string[] = [];
  const ctrl = stubCtrl();
  const all: DepsPanelProps = {
    text: TEXT,
    viewName: undefined,
    activeId: 'api',
    ctrl,
    onPick: (id) => picked.push(id),
    ...props,
  };
  render(<DepsPanel {...all} />);
  return { picked: () => picked, ctrl };
}

describe('DepsPanel', () => {
  afterEach(cleanup);

  it('renders incoming/outgoing rows for the selected object', () => {
    Harness();
    expect(screen.getByTestId('deps-incoming').textContent).toContain('auth');
    expect(screen.getByTestId('deps-outgoing').textContent).toContain('db');
    expect(screen.getByTestId('deps-panel').textContent).toContain('API');
  });

  it('shows the hint when nothing is selected', () => {
    Harness({ activeId: null });
    expect(screen.getByText('select an object to see its dependencies')).toBeDefined();
    expect(screen.queryByTestId('deps-incoming')).toBeNull();
  });

  it('click-through picks the peer id', () => {
    const h = Harness();
    fireEvent.click(screen.getByText('auth'));
    expect(h.picked()).toEqual(['auth']);
    fireEvent.click(screen.getByText('db'));
    expect(h.picked()).toEqual(['auth', 'db']);
  });

  it('focus fade: non-peers and non-adjacent links fade', () => {
    const h = Harness({ activeId: 'api' });
    expect(h.ctrl.setFaded).toHaveBeenCalledWith(new Set(['cache']), new Set(['db-cache']));
  });

  it('no file → clears fade (canvas may outlive the file)', () => {
    const h = Harness({ text: null });
    expect(screen.queryByTestId('deps-panel')).toBeNull();
    expect(h.ctrl.setFaded).toHaveBeenCalledWith(new Set(), new Set());
  });

  it('unknown selection falls through to the view fade (no hidden tags → nothing fades)', () => {
    const h = Harness({ activeId: 'ghost' });
    expect(h.ctrl.setFaded).toHaveBeenCalledWith(new Set(), new Set());
  });
});
