// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// F-15 in-place rename overlay: Enter commits, Escape cancels, blur commits,
// the input is seeded with the current label, carries an accessible name and
// degrades to a chip above 200 % zoom.

import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { InlineRename, type RenameTarget } from './InlineRename';

afterEach(cleanup);

const target = (over: Partial<RenameTarget> = {}): RenameTarget => ({
  id: 'api',
  kind: 'system',
  name: 'API',
  left: 100,
  top: 80,
  width: 160,
  height: 60,
  zoom: 1,
  ...over,
});

describe('InlineRename (F-15)', () => {
  it('seeds the current label and exposes an accessible name', () => {
    render(<InlineRename target={target()} onCommit={() => {}} onCancel={() => {}} />);
    const input = screen.getByTestId('inline-rename') as HTMLInputElement;
    expect(input.value).toBe('API');
    expect(input.getAttribute('aria-label')).toBe('Rename system');
    expect(document.activeElement).toBe(input); // focused for typing
  });

  it('uses a humanised accessible name for compound kinds', () => {
    render(<InlineRename target={target({ kind: 'system_ext' })} onCommit={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('inline-rename').getAttribute('aria-label')).toBe('Rename system ext');
  });

  it('commits on Enter', () => {
    const commits: string[] = [];
    render(<InlineRename target={target()} onCommit={(v) => commits.push(v)} onCancel={() => {}} />);
    const input = screen.getByTestId('inline-rename') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Gateway' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(commits).toEqual(['Gateway']);
  });

  it('cancels on Escape without committing', () => {
    const commits: string[] = [];
    let cancelled = 0;
    render(
      <InlineRename target={target()} onCommit={(v) => commits.push(v)} onCancel={() => (cancelled += 1)} />,
    );
    const input = screen.getByTestId('inline-rename') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(commits).toEqual([]);
    expect(cancelled).toBe(1);
  });

  it('commits on blur (click elsewhere)', () => {
    const commits: string[] = [];
    render(<InlineRename target={target()} onCommit={(v) => commits.push(v)} onCancel={() => {}} />);
    const input = screen.getByTestId('inline-rename') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);
    expect(commits).toEqual(['Renamed']);
  });

  it('treats an unchanged label as a cancel (no no-op undo entry)', () => {
    const commits: string[] = [];
    let cancelled = 0;
    render(
      <InlineRename target={target()} onCommit={(v) => commits.push(v)} onCancel={() => (cancelled += 1)} />,
    );
    fireEvent.keyDown(screen.getByTestId('inline-rename'), { key: 'Enter' });
    expect(commits).toEqual([]);
    expect(cancelled).toBe(1);
  });

  it('treats a whitespace-only label as a cancel', () => {
    const commits: string[] = [];
    let cancelled = 0;
    render(
      <InlineRename target={target()} onCommit={(v) => commits.push(v)} onCancel={() => (cancelled += 1)} />,
    );
    const input = screen.getByTestId('inline-rename') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(commits).toEqual([]);
    expect(cancelled).toBe(1);
  });

  it('the unmount blur after Escape does not commit (regression)', () => {
    const commits: string[] = [];
    render(<InlineRename target={target()} onCommit={(v) => commits.push(v)} onCancel={() => {}} />);
    const input = screen.getByTestId('inline-rename') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input); // what the browser does when the input unmounts
    expect(commits).toEqual([]);
  });

  it('renders a chip above 200 % zoom, below the object', () => {
    render(<InlineRename target={target({ zoom: 2.4 })} onCommit={() => {}} onCancel={() => {}} />);
    const input = screen.getByTestId('inline-rename');
    expect(input.getAttribute('data-chip')).toBe('true');
    expect(input.classList.contains('inline-rename-chip')).toBe(true);
    expect((input as HTMLElement).style.top).toBe(`${80 + 60 + 6}px`);
  });
});
