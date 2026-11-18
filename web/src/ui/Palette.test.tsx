// SPDX-License-Identifier: GPL-3.0-only
// One press on a palette item must add exactly one element. The button used to
// run two add paths for the same press: the pointer-down handler started a drag
// whose pointer-up always reported a drop, and the click that follows reported a
// place — so a plain click added the shape twice (once at the pointer, once at
// the default position).
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Palette } from './Palette';
import type { Kind } from '../engine/model/types';

function setup(): { place: ReturnType<typeof vi.fn>; drop: ReturnType<typeof vi.fn>; button: HTMLElement } {
  const place = vi.fn();
  const drop = vi.fn();
  render(<Palette kinds={['container' as Kind, 'datastore' as Kind]} onPlace={place} onDragDrop={drop} />);
  return { place, drop, button: screen.getByTestId('palette-datastore') };
}

describe('palette press', () => {
  afterEach(cleanup);

  it('a press without movement places once and reports no drop', () => {
    const { place, drop, button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 41, clientY: 40 });
    fireEvent.click(button);
    expect(drop).not.toHaveBeenCalled();
    expect(place).toHaveBeenCalledTimes(1);
    expect(place).toHaveBeenCalledWith('datastore');
  });

  it('a press that moves reports the drop once and does not also place', () => {
    const { place, drop, button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 220, clientY: 180 });
    fireEvent.pointerUp(window, { clientX: 220, clientY: 180 });
    fireEvent.click(button);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(drop).toHaveBeenCalledWith('datastore', expect.objectContaining({ clientX: 220 }));
    expect(place).not.toHaveBeenCalled();
  });

  it('a drag leaves no ghost behind and the next press places again', () => {
    const { place, drop, button } = setup();
    fireEvent.pointerDown(button, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 200 });
    expect(document.querySelector('.pc-palette-ghost')).toBeNull();
    fireEvent.pointerDown(button, { button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 });
    fireEvent.click(button);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(place).toHaveBeenCalledTimes(1);
  });

  it('the keyboard path still places without any pointer event', () => {
    const { place, drop, button } = setup();
    fireEvent.click(button);
    expect(drop).not.toHaveBeenCalled();
    expect(place).toHaveBeenCalledTimes(1);
  });
});
