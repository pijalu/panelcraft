// SPDX-License-Identifier: GPL-3.0-only
// SearchDialog component tests (M6-WP5).
// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { SearchDialog, type SearchDialogProps } from './SearchDialog';
import type { SearchEntry } from './searchIndex';

const ENTRIES: SearchEntry[] = [
  { kind: 'file', path: 'checkout/checkout.pcd', label: 'checkout/checkout.pcd' },
  { kind: 'object', path: 'checkout/checkout.pcd', id: 'api', label: 'Checkout API', sub: 'api' },
  { kind: 'flow', path: 'checkout/checkout.pcd', id: 'buy', label: 'Buy', sub: 'buy' },
  { kind: 'object', path: 'billing.pcd', id: 'inv', label: 'Invoicing', sub: 'inv' },
];

function Harness(props: Partial<SearchDialogProps> = {}) {
  const picked: SearchEntry[] = [];
  let closed = false;
  const all: SearchDialogProps = { entries: ENTRIES, onPick: (e) => picked.push(e), onClose: () => (closed = true), ...props };
  render(<SearchDialog {...all} />);
  return { picked: () => picked, closed: () => closed };
}

function rows(): number {
  return screen.queryAllByTestId(/^search-row-/).length;
}

describe('SearchDialog', () => {
  afterEach(cleanup);

  it('renders all entries with empty query (stable order)', () => {
    Harness();
    expect(rows()).toBe(ENTRIES.length);
    expect(screen.getByTestId('search-row-0').textContent).toContain('checkout/checkout.pcd');
  });

  it('typing filters + re-ranks (object first for "api"-ish query)', () => {
    Harness();
    fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'checkout' } });
    expect(rows()).toBeGreaterThan(0);
    expect(screen.getByTestId('search-row-0').textContent).toContain('Checkout API');
  });

  it('shows the empty state when nothing matches', () => {
    Harness();
    fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'qqqq' } });
    expect(rows()).toBe(0);
    expect(screen.getByText('no matches')).toBeDefined();
  });

  it('ArrowDown/ArrowUp move selection with wrap-around; Enter picks', () => {
    const h = Harness();
    const input = screen.getByTestId('search-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('search-row-1').className).toContain('search-row-active');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getByTestId('search-row-0').className).toContain('search-row-active');
    fireEvent.keyDown(input, { key: 'ArrowUp' }); // wrap to last
    expect(screen.getByTestId('search-row-3').className).toContain('search-row-active');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.picked()[0]).toMatchObject({ id: 'inv' }); // billing.pcd object, last row
    expect(h.closed()).toBe(true);
  });

  it('Escape closes without picking; click on a row picks it', () => {
    const h = Harness();
    fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Escape' });
    expect(h.closed()).toBe(true);
    expect(h.picked()).toHaveLength(0);
    cleanup();
    const h2 = Harness();
    fireEvent.click(screen.getByTestId('search-row-2'));
    expect(h2.picked()[0]).toMatchObject({ id: 'buy' });
  });

  it('query change resets selection to the first row', () => {
    Harness();
    const input = screen.getByTestId('search-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.input(input, { target: { value: 'inv' } });
    expect(screen.getByTestId('search-row-0').className).toContain('search-row-active');
    expect(rows()).toBe(1);
  });
});
