// SPDX-License-Identifier: GPL-3.0-only
// The shared field widgets: one layout per field kind and one auto-grow rule for
// every multiline field, so short and long prose do not share one arbitrary
// height and no prose control keeps a different width or label alignment.
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { fireEvent } from '@testing-library/preact';
import {
  Field,
  TEXTAREA_MAX_PX,
  TEXTAREA_MIN_PX,
  TextArea,
  applyAutoGrow,
  autoGrowSize,
} from './fields';

const mount = (node: preact.ComponentChild): HTMLDivElement => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(node, host);
  });
  return host;
};

const stubScrollHeight = (el: HTMLElement, value: number): void => {
  Object.defineProperty(el, 'scrollHeight', { value, configurable: true });
};

describe('auto-grow sizing rule', () => {
  it('keeps a stable minimum height for little text', () => {
    expect(autoGrowSize(0)).toEqual({ height: TEXTAREA_MIN_PX, scroll: false });
    expect(autoGrowSize(8)).toEqual({ height: TEXTAREA_MIN_PX, scroll: false });
  });

  it('grows with the content and includes the field border', () => {
    expect(autoGrowSize(120)).toEqual({ height: 120, scroll: false });
    // scrollHeight excludes the border, so a 2px total border adds to the box.
    expect(autoGrowSize(120, 2)).toEqual({ height: 122, scroll: false });
  });

  it('caps a very long value at the maximum and scrolls instead', () => {
    const long = autoGrowSize(TEXTAREA_MAX_PX * 4);
    expect(long.height).toBe(TEXTAREA_MAX_PX);
    expect(long.scroll).toBe(true);
  });

  it('treats a missing measurement as empty rather than throwing', () => {
    expect(autoGrowSize(Number.NaN)).toEqual({ height: TEXTAREA_MIN_PX, scroll: false });
  });
});

describe('applying the rule to a live textarea', () => {
  const area = (): HTMLTextAreaElement => {
    const el = document.createElement('textarea');
    document.body.appendChild(el);
    return el;
  };

  it('sets the measured height and hides the scrollbar', () => {
    const el = area();
    stubScrollHeight(el, 90);
    applyAutoGrow(el);
    expect(el.style.height).toBe('90px');
    expect(el.style.overflowY).toBe('hidden');
  });

  it('clamps a long value to the maximum and scrolls', () => {
    const el = area();
    stubScrollHeight(el, 900);
    applyAutoGrow(el);
    expect(el.style.height).toBe(`${TEXTAREA_MAX_PX}px`);
    expect(el.style.overflowY).toBe('auto');
  });

  it('is a no-op when the field is not mounted yet', () => {
    expect(() => applyAutoGrow(null)).not.toThrow();
  });
});

describe('field variants', () => {
  it('stacks the label, one hint line, then a full-width control', () => {
    const host = mount(
      <TextArea label="Purpose" hint="What this explains" value={'line one\nline two'} testid="t" onInput={() => {}} variant="stacked" />,
    );
    const field = host.querySelector('.flow-field-stacked')!;
    expect(field).not.toBeNull();
    // Label and hint come before the control, so the hint never floats away.
    const leading = [...field.children].slice(0, 2).map((child) => child.className);
    expect(leading).toEqual(['flow-field-label', 'flow-field-hint']);
    expect(field.lastElementChild!.tagName).toBe('TEXTAREA');
    // The hint is stated once, in the same place, for every stacked field.
    expect(field.querySelector('.flow-field-hint')!.textContent).toBe('What this explains');
    const textarea = field.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.getAttribute('placeholder')).toBeNull();
    expect(textarea.value).toBe('line one\nline two');
  });

  it('keeps the compact row for an inline field, with its hint as a placeholder', () => {
    const host = mount(<TextArea label="Notes" hint="Markdown" value="" testid="t2" onInput={() => {}} />);
    const field = host.querySelector('.flow-field')!;
    expect(field.classList.contains('flow-field-stacked')).toBe(false);
    expect(field.querySelector('.flow-field-hint')).toBeNull();
    const textarea = field.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.getAttribute('placeholder')).toBe('Markdown');
  });

  it('shows a single-line stacked field with the same label and hint order', () => {
    const onInput = vi.fn();
    const host = mount(
      <Field label="Flow name" hint="Shown in the flow list" value="Checkout" testid="t3" onInput={onInput} variant="stacked" />,
    );
    const field = host.querySelector('.flow-field-stacked')!;
    const leading = [...field.children].slice(0, 2).map((child) => child.className);
    expect(leading).toEqual(['flow-field-label', 'flow-field-hint']);
    expect(field.lastElementChild!.tagName).toBe('INPUT');
    const input = field.querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('placeholder')).toBeNull();
    fireEvent.input(input, { target: { value: 'Refund' } });
    expect(onInput).toHaveBeenCalledWith('Refund');
  });
});

describe('multiline growth while typing', () => {
  it('grows when the user types more lines and shrinks when they clear it', () => {
    const onInput = vi.fn();
    const host = mount(<TextArea label="Notes" hint="Markdown" value="" testid="grow" onInput={onInput} variant="stacked" />);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    stubScrollHeight(textarea, TEXTAREA_MIN_PX);
    // The draft owns the value only while the field is focused, so type the way
    // a user does: focus first, then input.
    act(() => {
      textarea.focus();
      fireEvent.input(textarea, { target: { value: 'one' } });
    });
    expect(textarea.style.height).toBe(`${TEXTAREA_MIN_PX}px`);

    stubScrollHeight(textarea, 160);
    act(() => {
      fireEvent.input(textarea, { target: { value: 'one\ntwo\nthree\nfour' } });
    });
    expect(textarea.style.height).toBe('160px');
    expect(onInput).toHaveBeenCalledWith('one\ntwo\nthree\nfour');

    stubScrollHeight(textarea, 0);
    act(() => {
      fireEvent.input(textarea, { target: { value: '' } });
    });
    expect(textarea.style.height).toBe(`${TEXTAREA_MIN_PX}px`);
  });

  it('measures a value restored from the document, not only typed text', () => {
    const host = mount(<TextArea label="Notes" hint="Markdown" value="first" testid="restore" onInput={() => {}} variant="stacked" />);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    stubScrollHeight(textarea, 200);
    // The document wins while the field is not being typed in (undo, file load).
    act(() => {
      render(<TextArea label="Notes" hint="Markdown" value={'first\nsecond\nthird'} testid="restore" onInput={() => {}} variant="stacked" />, host);
    });
    expect(textarea.value).toBe('first\nsecond\nthird');
    expect(textarea.style.height).toBe('200px');
  });

  it('keeps the local draft while typing so a slow file round-trip cannot drop it', () => {
    const onInput = vi.fn();
    const host = mount(<TextArea label="Notes" hint="Markdown" value="" testid="draft" onInput={onInput} variant="stacked" />);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      fireEvent.input(textarea, { target: { value: 'typing' } });
    });
    // The written document lags behind the keystroke; the draft keeps the text.
    act(() => {
      render(<TextArea label="Notes" hint="Markdown" value="" testid="draft" onInput={onInput} variant="stacked" />, host);
    });
    expect(textarea.value).toBe('typing');
  });
});

describe('growing a field never edits the document', () => {
  it('applies a height without writing through onInput', () => {
    const onInput = vi.fn();
    const host = mount(<TextArea label="Notes" hint="Markdown" value={'a\nb\nc'} testid="noswrite" onInput={onInput} variant="stacked" />);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    stubScrollHeight(textarea, 180);
    // A restored value, a width change and a resize all re-measure the field;
    // none of them is an edit, so the document (and its undo stack) is untouched.
    act(() => {
      render(<TextArea label="Notes" hint="Markdown" value={'a\nb\nc\nd'} testid="noswrite" onInput={onInput} variant="stacked" />, host);
      applyAutoGrow(textarea);
    });
    expect(textarea.style.height).toBe('180px');
    expect(onInput).not.toHaveBeenCalled();
  });
});
