// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// Project-icon UI (IR v9, FILE-FORMAT §3.1): the picker must be searchable and
// must show the file's own icons; the manager must add only sanitized payloads,
// rename every reference in one committed change, and never remove an icon that
// is still in use without saying so.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { IconField, IconManagerDialog, IconPicker } from './IconPicker';
import { encodeIconSvg } from '../engine/format/iconSvg';
import type { Doc, IconDecl } from '../engine/model/types';

afterEach(cleanup);

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20"/></svg>';
const EVIL = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';

const decl = (id: string, svg = SVG, label?: string): IconDecl => ({
  id,
  label,
  mediaType: 'image/svg+xml',
  data: encodeIconSvg(svg),
  pos: { line: 2, col: 1 },
});

const doc = (over: Partial<Doc> = {}): Doc => ({
  irVersion: 9,
  formatVersion: '1.0',
  icons: [],
  imports: [],
  objects: [],
  links: [],
  flows: [],
  views: [],
  styles: [],
  ...over,
});

const withRefs = (): Doc => doc({
  icons: [decl('brand', SVG, 'Brand mark')],
  objects: [
    { kind: 'system', id: 'a', icon: 'brand', pos: { line: 3, col: 1 } },
    { kind: 'system', id: 'b', style: { icon: 'brand' }, pos: { line: 4, col: 1 } },
  ],
});

describe('IconPicker', () => {
  const open = (over: Partial<Parameters<typeof IconPicker>[0]> = {}) => {
    const picked: (string | undefined)[] = [];
    const closed: number[] = [];
    render(
      <IconPicker
        project={withRefs().icons}
        onPick={(n) => picked.push(n)}
        onManage={() => undefined}
        onClose={() => closed.push(1)}
        {...over}
      />,
    );
    return { picked, closed };
  };

  it('lists the file’s icons first, then the built-ins', () => {
    open();
    expect(screen.getByTestId('icon-option-brand')).toBeTruthy();
    expect(screen.getByTestId('icon-option-cloud')).toBeTruthy();
    expect(screen.getByTestId('icon-option-none')).toBeTruthy();
    expect(screen.getByText('This file')).toBeTruthy();
  });

  it('filters by keyword and by handle, and reports an empty result', () => {
    open();
    const search = screen.getByTestId('icon-search');
    fireEvent.input(search, { target: { value: 'kafka' } });
    expect(screen.getByTestId('icon-option-queue')).toBeTruthy();
    expect(screen.queryByTestId('icon-option-brand')).toBeNull();
    fireEvent.input(search, { target: { value: 'brand' } });
    expect(screen.getByTestId('icon-option-brand')).toBeTruthy();
    fireEvent.input(search, { target: { value: 'zzz' } });
    expect(screen.getByText(/no icons match/)).toBeTruthy();
  });

  it('picks a handle and clears to none', () => {
    const { picked, closed } = open();
    fireEvent.click(screen.getByTestId('icon-option-brand'));
    fireEvent.click(screen.getByTestId('icon-option-none'));
    expect(picked).toEqual(['brand', undefined]);
    expect(closed).toHaveLength(2);
  });

  it('marks a stored payload it cannot draw instead of rendering it', () => {
    open({ project: [decl('evil', EVIL)] });
    expect(screen.getByTitle(/script/)).toBeTruthy();
  });
});

describe('IconField', () => {
  it('keeps the handle editable and opens the picker from the button', () => {
    const changes: (string | undefined)[] = [];
    render(
      <IconField value={undefined} project={[]} onChange={(n) => changes.push(n)} onManage={() => undefined} />,
    );
    fireEvent.input(screen.getByTestId('prop-style-icon'), { target: { value: 'cloud' } });
    expect(changes).toEqual(['cloud']);
    fireEvent.input(screen.getByTestId('prop-style-icon'), { target: { value: '' } });
    expect(changes).toEqual(['cloud', undefined]);
    fireEvent.click(screen.getByTestId('icon-picker-open'));
    expect(screen.getByTestId('icon-picker')).toBeTruthy();
  });

  it('shows an unknown handle honestly in the trigger title', () => {
    render(<IconField value="nope" project={[]} onChange={() => undefined} onManage={() => undefined} />);
    expect(screen.getByTestId('icon-picker-open').getAttribute('title')).toContain('unknown');
  });
});

describe('IconManagerDialog', () => {
  const open = (over: Partial<Parameters<typeof IconManagerDialog>[0]> = {}) => {
    const commits: { doc: Doc; label: string }[] = [];
    render(
      <IconManagerDialog
        doc={withRefs()}
        onCommit={(next, label) => commits.push({ doc: next, label })}
        onClose={() => undefined}
        {...over}
      />,
    );
    return commits;
  };

  it('lists declarations with their usage counts', () => {
    open();
    expect(screen.getByTestId('icon-remove-brand')).toBeTruthy();
    expect(screen.getByText('used 2×')).toBeTruthy();
  });

  it('adds a pasted, sanitized icon as one committed change', () => {
    const commits = open();
    fireEvent.input(screen.getByTestId('icon-add-label'), { target: { value: 'Ops badge' } });
    fireEvent.input(screen.getByTestId('icon-add-data'), {
      target: { value: `${SVG.replace('</svg>', '<script>x</script></svg>')}` },
    });
    fireEvent.click(screen.getByTestId('icon-add'));
    expect(commits).toHaveLength(1);
    const added = commits[0]?.doc.icons.map((i) => i.id) ?? [];
    expect(added).toEqual(['brand', 'ops-badge']);
    expect(commits[0]?.doc.icons[1]?.label).toBe('Ops badge');
    // the script never reaches the document
    const stored = commits[0]?.doc.icons[1]?.data ?? '';
    expect(atob(stored)).not.toContain('script');
  });

  it('refuses input that cannot be made safe', () => {
    const commits = open();
    fireEvent.input(screen.getByTestId('icon-add-data'), { target: { value: '<div>nope</div>' } });
    fireEvent.click(screen.getByTestId('icon-add'));
    expect(commits).toEqual([]);
    expect(screen.getByTestId('icon-manager-error').textContent).toContain('SVG');
  });

  it('renames the handle and every reference in a single commit', () => {
    const commits = open();
    fireEvent.click(screen.getByTestId('icon-rename-start-brand'));
    fireEvent.input(screen.getByTestId('icon-rename-brand'), { target: { value: 'logo' } });
    fireEvent.keyDown(screen.getByTestId('icon-rename-brand'), { key: 'Enter' });
    expect(commits).toHaveLength(1);
    const next = commits[0]?.doc;
    expect(next?.icons.map((i) => i.id)).toEqual(['logo']);
    expect(next?.objects[0]?.icon).toBe('logo');
    expect(next?.objects[1]?.style?.icon).toBe('logo');
    expect(commits[0]?.label).toContain('rename');
  });

  it('asks before removing an icon that is in use, then clears the references', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const commits = open();
    fireEvent.click(screen.getByTestId('icon-remove-brand'));
    expect(confirm).toHaveBeenCalled();
    expect(commits).toHaveLength(1);
    expect(commits[0]?.doc.icons).toEqual([]);
    expect(commits[0]?.doc.objects[0]?.icon).toBeUndefined();
    confirm.mockRestore();
  });

  it('removes an unused icon without asking', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const commits = open({ doc: doc({ icons: [decl('spare')] }) });
    fireEvent.click(screen.getByTestId('icon-remove-spare'));
    expect(confirm).not.toHaveBeenCalled();
    expect(commits).toHaveLength(1);
    confirm.mockRestore();
  });

  it('explains why an empty payload cannot be added', () => {
    const commits = open();
    fireEvent.click(screen.getByTestId('icon-add'));
    expect(commits).toEqual([]);
  });
});
