// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// CX-04: the visual picker is a real radio group — accessible names, checked
// state, per-option test ids and previews must all be present, and a value
// outside the presets (custom width) must not fake a selection.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { VisualPicker, type VisualOption } from './VisualPicker';

const OPTIONS: VisualOption[] = [
  { value: 'solid', label: 'Solid', preview: <svg data-testid="preview-solid" /> },
  { value: 'dashed', label: 'Dashed', preview: <svg data-testid="preview-dashed" /> },
  { value: 'dotted', label: 'Dotted', preview: <svg data-testid="preview-dotted" /> },
];

describe('VisualPicker (CX-04)', () => {
  afterEach(cleanup);
  it('renders one labelled radio per option inside a named group', () => {
    render(<VisualPicker id="line" label="Line" value="dashed" options={OPTIONS} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Line' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['solid', 'dashed', 'dotted']);
    // Every option keeps a text name for assistive tech and a tooltip.
    for (const label of ['Solid', 'Dashed', 'Dotted']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy();
    }
    expect(screen.getByTestId('line-dashed').getAttribute('title')).toBe('Dashed');
    // Previews are decorative: the name is the radio label, not the graphic.
    expect(screen.getByTestId('line-dashed').querySelector('.visual-option-preview')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('preview-dashed')).toBeTruthy();
  });

  it('marks exactly the current value as checked', () => {
    render(<VisualPicker id="line" label="Line" value="dashed" options={OPTIONS} onChange={() => {}} />);
    expect((screen.getByRole('radio', { name: 'Dashed' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Solid' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: 'Dotted' }) as HTMLInputElement).checked).toBe(false);
  });

  it('reports the chosen value and leaves a custom value unselected', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <VisualPicker id="width" label="Weight" value="1.5" options={OPTIONS} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('width-dotted'));
    expect(onChange).toHaveBeenCalledWith('dotted');
    // A custom width that is not a preset selects nothing rather than
    // silently pretending one of the presets is active.
    rerender(<VisualPicker id="width" label="Weight" value="2.5" options={OPTIONS} onChange={onChange} />);
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false);
  });
});
