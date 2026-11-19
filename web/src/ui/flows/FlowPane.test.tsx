// SPDX-License-Identifier: GPL-3.0-only
// M5-WP4 unit tests — flow editor pane: flow list + play, step tree,
// per-type inspectors, structural ops. All edits asserted through the
// retext round-trip (the onChangeText payload re-parses).
// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { parsePDL } from '../../engine/format/parser';
import type { FlowCanvasContext } from './FlowPane';
import { FlowHarness } from './flowHarness';
import { downloadText } from '../download';

vi.mock('../download', () => ({ downloadText: vi.fn() }));

const DOC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start"
  a -> b : "order"
  alt "how?" {
    "fast" { a -> b : "rush" }
    "slow" { process b }
  }
  par "both" {
    { info "one" }
    { process a }
  }
  goto "other.pcd#refund" return here
  conclusion "done"
}
`;

const OTHER_DOC = `pcd 1.0

system s "Service"

flow "Refund" as refund {
  intro "start"
  process s
}

flow "Refund two" as refund2 {
  intro "start"
  process s
}
`;

interface MountOpts {
  files?: string[];
  otherDoc?: string;
  doc?: string;
}

/** Mount both flow surfaces over one document, like the shell does. */
function mount(canvas?: FlowCanvasContext, opts: MountOpts = {}) {
  render(
    <FlowHarness
      doc={opts.doc ?? DOC}
      otherDoc={opts.otherDoc ?? OTHER_DOC}
      {...(canvas === undefined ? {} : { canvas })}
      {...(opts.files === undefined ? {} : { files: opts.files })}
    />,
  );
  const out = (): string => screen.getByTestId('text-out').textContent ?? '';
  return { out };
}

afterEach(cleanup);

describe('FlowPane sequence export (M6-WP7)', () => {
  it('downloads the selected flow as .seq.mmd', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('flow-export-seq'));
    expect(downloadText).toHaveBeenCalledWith(expect.stringContaining('sequenceDiagram'), 'main.seq.mmd');
    expect(vi.mocked(downloadText).mock.calls[0]?.[0]).toContain('a->>b: order');
  });
});

describe('FlowPane Markdown documentation (UX08-WP14)', () => {
  const last = (): [string, string] => {
    const call = vi.mocked(downloadText).mock.calls.at(-1);
    return [String(call?.[0]), String(call?.[1])];
  };

  it('downloads the selected flow as .md with names, ids and nesting', () => {
    vi.mocked(downloadText).mockClear();
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('flow-export-doc'));
    const [text, name] = last();
    expect(name).toBe('main.main.md');
    expect(text).toContain('# Main');
    expect(text).toContain('1. **Intro** — start');
    expect(text).toContain('2. **Message** — Ada `a` → Web `b`: order');
    expect(text).toContain('   - **Branch "fast"**');
    expect(text).toContain('6. **Conclusion** — done');
  });

  it('downloads every flow as one .md outline', () => {
    vi.mocked(downloadText).mockClear();
    mount();
    fireEvent.click(screen.getByTestId('flow-export-docs'));
    const [text, name] = last();
    expect(name).toBe('main.flows.md');
    expect(text).toContain('# Flows');
    expect(text).toContain('## Main');
  });

  it('leaves the document text untouched', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-export-docs'));
    expect(out()).toBe(DOC);
  });
});

describe('FlowPane flow list (M5-WP4)', () => {
  it('lists flows and starts playback on ▶', () => {
    const played: string[] = [];
    render(<FlowHarness doc={DOC} onPlay={(k) => { played.push(k); }} />);
    expect(screen.getByTestId('flow-row-main').textContent).toContain('Main');
    // BUG-07: a truncated title must still be readable on hover/focus.
    expect(screen.getByTestId('flow-row-main').getAttribute('title')).toBe('Main');
    fireEvent.click(screen.getByTestId('flow-play-main'));
    expect(played).toEqual(['main']);
  });

  it('shows a muted hint when no file is active', () => {
    render(<FlowHarness doc={DOC} activePath={null} />);
    expect(screen.getByTestId('flow-error').textContent).toContain('Open a file');
  });

  it('shows a muted hint when the active file has parse errors', () => {
    render(<FlowHarness doc={'pcd 1.0\n nonsense !!!'} />);
    expect(screen.getByTestId('flow-error').textContent).toContain('parse errors');
  });

  it('adds a flow and selects it', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-add'));
    expect(out()).toContain('flow "New flow" as flow2');
    fireEvent.click(screen.getByTestId('flow-row-flow2'));
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
    expect(screen.getByTestId('step-0').textContent).toContain('Ada');
  });

  it('hides and restores a connection without removing it from the diagram', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-add'));
    // Hiding a connection is a property of the chosen step, so it lives in the
    // panel: select the step, then hide it.
    fireEvent.click(screen.getByTestId('step-0'));
    fireEvent.click(screen.getByTestId('hide-connection-0'));
    expect(screen.getByTestId('flow-hidden-links').textContent).toContain('Ada');
    expect(screen.queryByTestId('step-0')).toBeNull();
    expect(out()).toContain('a -> b as ab');
    fireEvent.click(screen.getByTestId('show-flow-link-0'));
    expect(screen.queryByTestId('flow-hidden-links')).toBeNull();
    expect(screen.getByTestId('step-0').textContent).toContain('Ada');
  });
});

describe('FlowPane step editing (M5-WP4)', () => {
  it('renders the step tree with nesting and titles', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    // 8 top steps + 2 alt-branch steps + 2 par-lane steps = 12 flat rows
    expect(screen.getByTestId('step-0').textContent).toContain('start');
    expect(screen.getByTestId('step-1').textContent).toContain('order');
    expect(screen.getByTestId('step-3').textContent).toContain('rush');
    expect(screen.getByTestId('step-6').textContent).toContain('one');
  });

  it('edits a msg step through the inspector (label round-trips)', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1')); // msg "order"
    const input = screen.getByTestId('insp-label') as HTMLInputElement;
    expect(input.value).toBe('order');
    fireEvent.input(input, { target: { value: 'place order' } });
    expect(out()).toContain('a -> b : "place order"');
  });

  it('edits an alt branch label in place', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-2')); // alt "how?"
    const b0 = screen.getByTestId('insp-branch-0') as HTMLInputElement;
    expect(b0.value).toBe('fast');
    fireEvent.input(b0, { target: { value: 'rush' } });
    expect(out()).toContain('"rush" {');
  });

  it('moves a step up (reorder round-trips through retext)', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1')); // msg
    fireEvent.click(screen.getByTestId('step-up'));
    const doc = parsePDL(out()).doc;
    const first = doc?.flows[0]?.steps[0];
    expect(first?.type).toBe('msg');
  });

  it('removes a step', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-0')); // intro "start"
    fireEvent.click(screen.getByTestId('step-remove'));
    expect(out()).not.toContain('intro "start"');
  });

  it('adds a note step at the end', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('add-note'));
    const doc = parsePDL(out()).doc;
    const steps = doc?.flows[0]?.steps ?? [];
    expect(steps.at(-1)?.type).toBe('info');
  });

  it('appends a branch to an alt step', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-2')); // alt
    fireEvent.click(screen.getByTestId('insp-branch-add'));
    expect(out()).toContain('"option 3" {');
  });

  it('adds a lane to a par step', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-5')); // par "both"
    fireEvent.click(screen.getByTestId('insp-lane-add'));
    const doc = parsePDL(out()).doc;
    const par = doc?.flows[0]?.steps[3];
    expect(par?.type === 'par' ? par.lanes.length : 0).toBe(3);
  });

  it('edits a goto target flow id from the dependent flow list', () => {
    const { out } = mount(undefined, { files: ['other.pcd'], otherDoc: OTHER_DOC });
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-8')); // goto
    const f = screen.getByTestId('insp-goto-flow') as HTMLSelectElement;
    expect(f.tagName).toBe('SELECT');
    expect(f.value).toBe('refund');
    fireEvent.change(f, { target: { value: 'refund2' } });
    expect(out()).toContain('goto "other.pcd#refund2" return here');
  });

  it('converts a step kind via the inspector select', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-0')); // intro
    fireEvent.change(screen.getByTestId('step-kind'), { target: { value: 'info' } });
    expect(out()).toContain('info "Note"');
  });
});

describe('FlowPane canvas-assisted editing (FLOW-01)', () => {
  const canvas = { objects: ['b'], link: { id: 'ab', from: 'a', to: 'b' } };

  it('targets a message step from the selected connector and objects', () => {
    const wrong = DOC.replace('a -> b : "order"', 'b -> a : "order"');
    const { out } = mount(canvas, { doc: wrong });
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1')); // msg, initially b -> a
    expect(out()).toContain('b -> a : "order"');
    // Endpoints come from the diagram's own shapes, never from typed ids: the
    // panel offers the closed set, and a pick clears a stale connector reference.
    const to = screen.getByTestId('insp-to') as HTMLSelectElement;
    expect(Array.from(to.options).map((o) => o.value)).toEqual(['', 'a', 'b']);
    fireEvent.change(screen.getByTestId('insp-from'), { target: { value: 'a' } });
    expect(out()).toContain('a -> a : "order"');
    fireEvent.change(to, { target: { value: 'b' } });
    expect(out()).toContain('a -> b : "order"');
  });

  it('targets a process step from the diagram shapes', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-7')); // process a inside alt branch
    fireEvent.change(screen.getByTestId('insp-target'), { target: { value: 'b' } });
    expect(out()).toContain('process b');
  });

  it('seeds a new message step from the selected connector and never invents one', () => {
    const { out } = mount(canvas);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('add-msg'));
    expect(out()).toContain('a -> b');
    expect(screen.queryByTestId('flow-needs-link')).toBeNull();
  });

  it('refuses to add a message step when no connector is selected', () => {
    // A pair written without a matching link would be a validation error, so
    // the editor explains the requirement instead of inventing the link.
    const noLinks = 'pcd 1.0\nsystem a "A"\nsystem b "B"\nflow "F" as f {\n  intro "x"\n}\n';
    let text = noLinks;
    render(<FlowHarness doc={noLinks} onWrite={(t) => { text = t; }} />);
    fireEvent.click(screen.getByTestId('flow-row-f'));
    expect((screen.getByTestId('add-msg') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('flow-needs-link').textContent).toContain('connector');
    expect(text).toBe(noLinks);
  });

  it('reports card summaries and highlights canvas participants', () => {
    const highlights: (string[] | null)[] = [];
    render(<FlowHarness doc={DOC} canvas={canvas} onHighlight={(ids) => highlights.push(ids)} />);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    expect(screen.getByTestId('step-summary-1').textContent).toContain('Ada → Web');
    expect(screen.getByTestId('step-1').getAttribute('aria-current')).toBe('true');
    expect(highlights.at(-1)).toEqual(['a', 'b']);
    // A block step has no participants, so the highlight clears.
    fireEvent.click(screen.getByTestId('step-2'));
    expect(highlights.at(-1)).toBeNull();
  });
});

const FRESH = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab
`;

/** Harness with a caller-supplied document (the WP12 authoring path). */
function mountDoc(initial: string, canvas?: FlowCanvasContext, played: string[] = []) {
  let text = initial;
  render(
    <FlowHarness
      doc={initial}
      onWrite={(t) => { text = t; }}
      onPlay={(k) => played.push(k)}
      {...(canvas === undefined ? {} : { canvas })}
    />,
  );
  return { out: () => text };
}

describe('FlowPane guided authoring (UX08-WP12)', () => {
  it('starts authoring from a blank file (no header yet)', () => {
    const { out } = mountDoc('');
    expect(screen.getByTestId('flow-empty')).not.toBeNull();
    fireEvent.click(screen.getByTestId('flow-add'));
    expect(out()).toContain('pcd 1.0');
    expect(out()).toContain('flow "New flow" as flow1');
  });

  it('offers an element-backed default and New flow without connections', () => {
    mountDoc('pcd 1.0\n\nperson a "Ada"\nsystem b "Web"\n');
    expect(screen.getByTestId('flow-row-default').textContent).toBe('Default flow');
    expect(screen.getByTestId('step-title-0').textContent).toBe('Ada');
    expect(screen.getByTestId('step-title-1').textContent).toBe('Web');
    fireEvent.click(screen.getByTestId('flow-add'));
    expect(screen.getByTestId('flow-row-default')).not.toBeNull();
    expect(screen.getByTestId('flow-row-flow1').textContent).toBe('New flow');
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
  });

  it('offers the derived default flow for a link-only document without writing it', () => {
    const { out } = mountDoc(FRESH);
    // Item 10: connections alone make the diagram presentable.
    expect(screen.queryByTestId('flow-empty')).toBeNull();
    expect(screen.getByTestId('flow-derived-hint')).not.toBeNull();
    expect(screen.getByTestId('flow-row-default').textContent).toBe('Default flow');
    expect(screen.getByTestId('step-number-0').textContent).toBe('1');
    // Everything above is presentation only: the file is untouched.
    expect(out()).toBe(FRESH);
    expect(out()).not.toContain('flow');
  });

  it('copies the derived flow once and selects the custom copy on the first edit', () => {
    const { out } = mountDoc(FRESH);
    fireEvent.click(screen.getByTestId('step-0'));
    fireEvent.click(screen.getByTestId('step-remove'));
    expect(out()).toContain('flow "Custom flow" as flow1');
    // The custom copy is selected; the independent live default remains listed.
    expect(screen.queryByTestId('flow-derived-hint')).toBeNull();
    expect(screen.getByTestId('flow-row-default')).not.toBeNull();
    expect(screen.getByTestId('flow-row-flow1').textContent).toBe('Custom flow');
    expect(out().match(/flow /g) ?? []).toHaveLength(1);
  });

  it('names the flow and records its purpose', () => {
    const { out } = mountDoc(FRESH);
    fireEvent.click(screen.getByTestId('flow-add'));
    fireEvent.input(screen.getByTestId('flow-title'), { target: { value: 'Checkout' } });
    fireEvent.input(screen.getByTestId('flow-description'), { target: { value: 'Paying for an order' } });
    expect(out()).toContain('flow "Checkout" as flow1');
    expect(out()).toContain('description "Paying for an order"');
  });

  it('adds a process step from the single selected shape', () => {
    const { out } = mountDoc(FRESH, { objects: ['b'], link: null });
    fireEvent.click(screen.getByTestId('flow-add'));
    expect((screen.getByTestId('add-process') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('add-process'));
    expect(out()).toContain('process b');
    // No connector is selected, so the message action explains itself instead.
    expect(screen.getByTestId('flow-needs-link').textContent).toContain('connector');
    expect(screen.queryByTestId('flow-needs-shape')).toBeNull();
  });

  it('disables the process action until exactly one shape is selected', () => {
    mountDoc(FRESH, { objects: ['a', 'b'], link: null });
    fireEvent.click(screen.getByTestId('flow-add'));
    expect((screen.getByTestId('add-process') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('flow-needs-shape').textContent).toContain('one shape');
  });

  it('frames a flow with prose and adds a note from the list', () => {
    const { out } = mountDoc(FRESH);
    fireEvent.click(screen.getByTestId('flow-add'));
    fireEvent.input(screen.getByTestId('flow-intro'), { target: { value: 'Welcome' } });
    fireEvent.click(screen.getByTestId('add-note'));
    fireEvent.input(screen.getByTestId('flow-conclusion'), { target: { value: 'That is all' } });
    // The introduction is created at the front, the conclusion at the end: the
    // order a reader follows, without the author placing either one.
    const steps = parsePDL(out()).doc?.flows[0]?.steps ?? [];
    // Front and back, whatever else the flow holds in between.
    expect(steps[0]?.type).toBe('intro');
    expect(steps.at(-1)?.type).toBe('conclusion');
    expect(steps.some((step) => step.type === 'info')).toBe(true);
    expect(out()).toContain('intro "Welcome"');
    expect(out()).toContain('info "Note"');
    expect(out()).toContain('conclusion "That is all"');
  });

  it('keeps block steps behind Advanced step', () => {
    const { out } = mountDoc(FRESH);
    fireEvent.click(screen.getByTestId('flow-add'));
    const advanced = screen.getByTestId('advanced-steps');
    expect(advanced.querySelector('summary')?.textContent).toContain('Advanced');
    for (const id of ['add-alt', 'add-par', 'add-goto']) {
      expect(advanced.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }
    fireEvent.click(screen.getByTestId('add-par'));
    expect(out()).toContain('par "In parallel"');
  });
});

describe('FlowPane step cards (UX08-WP12)', () => {
  it('numbers the cards and names the shapes instead of their ids', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    expect(screen.getByTestId('step-number-0').textContent).toBe('1');
    expect(screen.getByTestId('step-number-1').textContent).toBe('2');
    expect(screen.getByTestId('step-summary-1').textContent).toContain('Ada → Web');
  });

  it('inherits element content and clears per-flow overrides back to inheritance', () => {
    const source = `pcd 1.0
person a "Ada" { description "Customer actor" }
system b "Web"
a -> b : "uses" as ab
flow "Main" as main {
  a -> b
  process a
}
`;
    const { out } = mount(undefined, { doc: source });
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-0'));
    expect((screen.getByTestId('insp-label') as HTMLInputElement).value).toBe('uses');
    expect(screen.getByTestId('insp-label-inherited').textContent).toContain('Inherited');
    fireEvent.input(screen.getByTestId('insp-label'), { target: { value: 'flow label' } });
    expect(out()).toContain('a -> b : "uses" as ab');
    expect(out()).toContain('a -> b : "flow label"');

    fireEvent.click(screen.getByTestId('step-1'));
    expect((screen.getByTestId('insp-description') as HTMLTextAreaElement).value).toBe('Customer actor');
    fireEvent.input(screen.getByTestId('insp-description'), { target: { value: 'Custom for this flow' } });
    expect(out()).toContain('description "Custom for this flow"');
    fireEvent.input(screen.getByTestId('insp-description'), { target: { value: '' } });
    fireEvent.blur(screen.getByTestId('insp-description'));
    expect(out()).not.toContain('Custom for this flow');
    expect((screen.getByTestId('insp-description') as HTMLTextAreaElement).value).toBe('Customer actor');
  });

  it('describes a step without lengthening its row', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    fireEvent.input(screen.getByTestId('insp-description'), { target: { value: 'pay by card' } });
    expect(out()).toContain('description "pay by card"');
    // The list stays a list: prose lives in the panel, so the row keeps its
    // number, kind and participants only.
    expect(screen.getByTestId('step-1').textContent).not.toContain('pay by card');
  });

  it('explains a step that points at a shape the diagram does not have', () => {
    const broken = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start"
  a -> ghost : "oops"
}
`;
    mountDoc(broken);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    expect(screen.getByTestId('step-warn-1').textContent).toContain('ghost');
    expect(screen.queryByTestId('step-warn-0')).toBeNull();
  });

  it('presents the edited flow from the pane', () => {
    const played: string[] = [];
    mountDoc(DOC, undefined, played);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('flow-present'));
    expect(played).toEqual(['main']);
  });

  // BUG-01: a process card must show what the step does, not just which shape it
  // touches — the shape name already has its own line in the summary.
  it('shows the process text on the card and the shape name once', () => {
    mountDoc(`pcd 1.0

person a "Ada"
system b "API core"

a -> b as ab

flow "Main" as main {
  process b "settles"
}
`);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    expect(screen.getByTestId('step-title-0').textContent).toBe('settles');
    expect(screen.getByTestId('step-summary-0').textContent).toBe('API core');
    const card = screen.getByTestId('step-row-0').textContent ?? '';
    expect(card.match(/API core/g)?.length ?? 0).toBe(1);
  });

  it('reorders with the keyboard (Alt+ArrowUp)', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.keyDown(screen.getByTestId('step-1'), { key: 'ArrowUp', altKey: true });
    const doc = parsePDL(out()).doc;
    expect(doc?.flows[0]?.steps[0]?.type).toBe('msg');
  });
});

// UX08-WP13 — per-step Presentation inspector: camera mode, "use current view",
// zoom and duration. Everything is asserted through the printed document.
const VIEW = { x: 420, y: 180, k: 1.5 };

function mountWithView(): { out: () => string } {
  render(<FlowHarness doc={DOC} view={() => VIEW} />);
  fireEvent.click(screen.getByTestId('flow-row-main'));
  fireEvent.click(screen.getByTestId('step-0'));
  return { out: () => screen.getByTestId('text-out').textContent ?? '' };
}

describe('FlowPane presentation inspector (UX08-WP13)', () => {
  it('writes a hold camera and removes it again for automatic', () => {
    const h = mountWithView();
    fireEvent.change(screen.getByTestId('insp-camera'), { target: { value: 'hold' } });
    expect(h.out()).toContain('camera hold');
    fireEvent.change(screen.getByTestId('insp-camera'), { target: { value: 'auto' } });
    expect(h.out()).not.toContain('camera');
  });

  it('records the current view as a focus camera with zoom', () => {
    const h = mountWithView();
    fireEvent.change(screen.getByTestId('insp-camera'), { target: { value: 'focus' } });
    expect(h.out()).toContain('camera focus (420, 180) zoom 1.5');
    // re-recording after panning updates the coordinates
    fireEvent.click(screen.getByTestId('insp-camera-here'));
    expect(h.out()).toContain('camera focus (420, 180)');
  });

  it('edits the transition duration inside the documented 0-300 ms range', () => {
    const h = mountWithView();
    fireEvent.change(screen.getByTestId('insp-camera'), { target: { value: 'focus' } });
    fireEvent.change(screen.getByTestId('insp-duration'), { target: { value: '120' } });
    expect(h.out()).toContain('duration 120');
    // out-of-range input is clamped, never written as an invalid document
    fireEvent.change(screen.getByTestId('insp-duration'), { target: { value: '900' } });
    expect(h.out()).toContain('duration 300');
    expect(h.out()).not.toContain('duration 900');
  });
});

describe('known-value step targets (property hierarchy)', () => {
  const selectGoto = (): void => {
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-8'));
  };

  it('goto file and flow are closed selects with dependent options', () => {
    const { out } = mount(undefined, { files: ['main.pcd', 'other.pcd'], otherDoc: OTHER_DOC });
    selectGoto();
    const file = screen.getByTestId('insp-goto-file') as HTMLSelectElement;
    const flow = screen.getByTestId('insp-goto-flow') as HTMLSelectElement;
    expect(file.tagName).toBe('SELECT');
    expect(flow.tagName).toBe('SELECT');
    expect(Array.from(file.options).map((o) => o.value)).toEqual(['', 'main.pcd', 'other.pcd']);
    expect(file.value).toBe('other.pcd');
    expect(Array.from(flow.options).map((o) => o.value)).toEqual(['default', 'refund', 'refund2']);
    // changing the file re-derives the flow choices from that file
    fireEvent.change(file, { target: { value: 'main.pcd' } });
    expect(out()).toContain('goto "main.pcd#refund"');
    expect(Array.from(flow.options).map((o) => o.value)).toContain('main');
  });

  it('keeps an unresolved goto target visible with diagnostics', () => {
    mount(undefined, { files: [], doc: DOC.replace('other.pcd#refund', 'missing.pcd#ghost') });
    selectGoto();
    const file = screen.getByTestId('insp-goto-file') as HTMLSelectElement;
    const flow = screen.getByTestId('insp-goto-flow') as HTMLSelectElement;
    expect(file.value).toBe('missing.pcd');
    expect(screen.getByTestId('insp-goto-file-unresolved').textContent).toContain('missing.pcd');
    expect(flow.value).toBe('ghost');
    expect(screen.getByTestId('insp-goto-flow-unresolved').textContent).toContain('ghost');
  });

  it('process target is a closed select over the diagram shapes', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-7')); // process a
    const target = screen.getByTestId('insp-target') as HTMLSelectElement;
    expect(target.tagName).toBe('SELECT');
    expect(Array.from(target.options).map((o) => o.value)).toEqual(['', 'a', 'b']);
    expect(target.value).toBe('a');
    fireEvent.change(target, { target: { value: 'b' } });
    expect(out()).toContain('process b');
  });

  it('keeps an unresolved process target with a diagnostic', () => {
    mount(undefined, { doc: DOC.replace('process a', 'process ghost') });
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-7'));
    const target = screen.getByTestId('insp-target') as HTMLSelectElement;
    expect(target.value).toBe('ghost');
    expect(screen.getByTestId('insp-target-unresolved').textContent).toContain('ghost');
  });

  it('message endpoints are chosen from the diagram, never typed', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1')); // msg a -> b
    const from = screen.getByTestId('insp-from') as HTMLSelectElement;
    const to = screen.getByTestId('insp-to') as HTMLSelectElement;
    expect(from.tagName).toBe('SELECT');
    expect(to.tagName).toBe('SELECT');
    expect(from.value).toBe('a');
    expect(to.value).toBe('b');
    // An unknown id cannot be entered: the domain is the diagram's shapes.
    expect(Array.from(from.options).map((o) => o.value)).toEqual(['', 'a', 'b']);
  });
});

describe('FlowPane notes + presentation flag', () => {
  it('edits one multiline block and persists the presentation flag', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.input(screen.getByTestId('flow-notes'), { target: { value: '# Notes\n\n- **bold** item' } });
    fireEvent.click(screen.getByTestId('flow-present-notes'));
    expect(out()).toContain('description {\n    text "# Notes"\n    text ""\n    text "- **bold** item"\n  }');
    expect(out()).toContain('  presentation\n');
    // The two forms are atomic: typing notes replaces a legacy one-line summary.
    expect(out()).not.toContain('description "');
  });

  it('loads authored notes and the flag into the editor', () => {
    const { out } = mount(undefined, {
      doc: `pcd 1.0\nflow "Notes" as n {\n  description {\n    text "# Heading"\n    text "body"\n  }\n  presentation\n  info "one"\n}\n`,
    });
    fireEvent.click(screen.getByTestId('flow-row-n'));
    expect((screen.getByTestId('flow-notes') as HTMLTextAreaElement).value).toBe('# Heading\nbody');
    expect((screen.getByTestId('flow-present-notes') as HTMLInputElement).checked).toBe(true);
    fireEvent.input(screen.getByTestId('flow-notes'), { target: { value: '' } });
    expect(out()).not.toContain('description {');
    expect(out()).toContain('presentation');
  });
});

const STYLE_DOC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab {
  style {
    sparks 2
    speed 2
  }
}

flow "Main" as main {
  intro "start"
  a -> b : "order"
  conclusion "done"
}
`;

const selectMessage = (doc?: string): string => {
  mount(undefined, { doc: doc ?? STYLE_DOC });
  fireEvent.click(screen.getByTestId('flow-row-main'));
  fireEvent.click(screen.getByTestId('step-1'));
  return screen.getByTestId('text-out').textContent ?? '';
};

describe('StepInspector selected message properties', () => {
  it('edits the resolved connector style and keeps the change across a reload', () => {
    const before = selectMessage();
    expect(before).toContain('sparks 2');
    const count = screen.getByTestId('insp-sparks') as HTMLInputElement;
    const speed = screen.getByTestId('insp-speed') as HTMLInputElement;
    expect(count.value).toBe('2');
    expect(speed.value).toBe('2');
    fireEvent.input(count, { target: { value: '4' } });
    fireEvent.input(speed, { target: { value: '0.5' } });
    const after = screen.getByTestId('text-out').textContent ?? '';
    expect(after).toContain('sparks 4');
    expect(after).toContain('speed 0.5');
    expect(after).not.toContain('sparks 2');
    const reloaded = parsePDL(after).doc;
    expect(reloaded?.links[0]?.style?.sparks).toBe(4);
    expect(reloaded?.links[0]?.style?.speed).toBe(0.5);
  });

  it('shows the shared link scope and documents the 1–8 / 0.25–4× bounds', () => {
    selectMessage();
    expect(screen.getByTestId('insp-shared-style').textContent).toContain('every step');
    const count = screen.getByTestId('insp-sparks') as HTMLInputElement;
    const speed = screen.getByTestId('insp-speed') as HTMLInputElement;
    expect(count.min).toBe('1');
    expect(count.max).toBe('8');
    expect(speed.min).toBe('0.25');
    expect(speed.max).toBe('4');
  });

  it('ignores out-of-range and non-integer spark input', () => {
    const before = selectMessage();
    fireEvent.input(screen.getByTestId('insp-sparks'), { target: { value: '9' } });
    expect(screen.getByTestId('text-out').textContent).toBe(before);
    fireEvent.input(screen.getByTestId('insp-sparks'), { target: { value: '1.5' } });
    expect(screen.getByTestId('text-out').textContent).toBe(before);
    fireEvent.input(screen.getByTestId('insp-speed'), { target: { value: '0.1' } });
    expect(screen.getByTestId('text-out').textContent).toBe(before);
  });

  it('shows one link style on every step that resolves to that link', () => {
    const shared = STYLE_DOC.replace(
      '  a -> b : "order"\n',
      '  a -> b : "order"\n  a -> b : "confirm"\n',
    );
    selectMessage(shared);
    fireEvent.input(screen.getByTestId('insp-sparks'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('step-2'));
    expect((screen.getByTestId('insp-sparks') as HTMLInputElement).value).toBe('5');
    expect(screen.getByTestId('insp-label')).not.toBeNull();
  });

});

describe('StepInspector message link resolution and kind fields', () => {
  it('keeps a connector reference while the endpoints still match it', () => {
    const refs = STYLE_DOC.replace(
      'a -> b as ab {\n  style {\n    sparks 2\n    speed 2\n  }\n}',
      'a -> b as L1 {\n  style {\n    sparks 2\n  }\n}\nb -> a as L2 {\n  style {\n    sparks 3\n  }\n}',
    ).replace('a -> b : "order"', 'a -> b : "order" as L1');
    mount(undefined, { doc: refs });
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    expect((screen.getByTestId('insp-sparks') as HTMLInputElement).value).toBe('2');
    // Two connectors join these shapes; the reference picks which one the step
    // animates, and switching it reaches the other connector's shared style.
    fireEvent.change(screen.getByTestId('insp-link'), { target: { value: 'L2' } });
    const after = screen.getByTestId('text-out').textContent ?? '';
    expect(after).toContain('a -> b : "order" as L2');
    expect((screen.getByTestId('insp-sparks') as HTMLInputElement).value).toBe('3');
  });

  it('disables the spark controls with a reason for an unknown link reference', () => {
    const broken = STYLE_DOC.replace('a -> b : "order"', 'a -> b : "order" as ghost');
    const before = selectMessage(broken);
    const count = screen.getByTestId('insp-sparks') as HTMLInputElement;
    const speed = screen.getByTestId('insp-speed') as HTMLInputElement;
    expect(count.disabled).toBe(true);
    expect(speed.disabled).toBe(true);
    expect(screen.getByTestId('insp-spark-reason').textContent).toContain('ghost');
    fireEvent.input(count, { target: { value: '8' } });
    expect(screen.getByTestId('text-out').textContent).toBe(before);
  });

  it('disables the spark controls with a reason when the endpoints are ambiguous', () => {
    const ambiguous = STYLE_DOC.replace(
      'a -> b as ab {\n  style {\n    sparks 2\n    speed 2\n  }\n}',
      'a -> b as L1 {\n  style {\n    sparks 2\n  }\n}\nb -> a as L2',
    );
    selectMessage(ambiguous);
    expect((screen.getByTestId('insp-sparks') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('insp-spark-reason').textContent).toContain('Several connectors');
  });

  it('edits a derived flow connector style without materialising the flow', () => {
    const derived = `pcd 1.0\nperson a "Ada"\nsystem b "Web"\na -> b as ab {\n  style {\n    sparks 2\n  }\n}\n`;
    mount(undefined, { doc: derived });
    fireEvent.click(screen.getByTestId('flow-row-default'));
    fireEvent.click(screen.getByTestId('step-0'));
    expect((screen.getByTestId('insp-sparks') as HTMLInputElement).value).toBe('2');
    fireEvent.input(screen.getByTestId('insp-sparks'), { target: { value: '5' } });
    const after = screen.getByTestId('text-out').textContent ?? '';
    expect(after).toContain('sparks 5');
    expect(after).not.toContain('flow ');
    expect(screen.getByTestId('flow-derived-hint')).not.toBeNull();
  });

  it('uses kind-correct fields and offers shared animation only for messages', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    const selectStep = (id: string): void => {
      fireEvent.click(screen.getByTestId(id));
    };
    selectStep('step-0'); // intro
    expect((screen.getByTestId('insp-text') as HTMLInputElement).value).toBe('start');
    expect(screen.queryByTestId('insp-label')).toBeNull();
    expect(screen.queryByTestId('insp-shared-style')).toBeNull();
    expect(screen.getByTestId('insp-description')).not.toBeNull();
    expect(screen.getByTestId('insp-camera-block')).not.toBeNull();
    selectStep('step-1'); // msg
    expect((screen.getByTestId('insp-label') as HTMLInputElement).value).toBe('order');
    expect(screen.getByTestId('insp-shared-style')).not.toBeNull();
    selectStep('step-2'); // alt
    expect((screen.getByTestId('insp-alt-label') as HTMLInputElement).value).toBe('how?');
    expect(screen.queryByTestId('insp-shared-style')).toBeNull();
    selectStep('step-5'); // par
    expect((screen.getByTestId('insp-par-label') as HTMLInputElement).value).toBe('both');
    selectStep('step-7'); // process inside alt
    expect((screen.getByTestId('insp-process-note') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('insp-label')).toBeNull();
    expect(screen.queryByTestId('insp-shared-style')).toBeNull();
    selectStep('step-8'); // goto
    expect(screen.queryByTestId('insp-label')).toBeNull();
    expect(screen.queryByTestId('insp-shared-style')).toBeNull();
  });
});

describe('Flow Steps browser feedback and input responsiveness', () => {
  it('keeps one inspector wrapper for the selected step', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    expect(screen.getByTestId('step-inspector').className).toContain('flow-inspector');
    expect(screen.getByTestId('insp-label')).not.toBeNull();
  });

  it('commits a delay edit when the value settles, not on every keystroke', async () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    const input = screen.getByTestId('step-delay-1') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '1500' } });
    expect(out()).not.toContain('delay 1500');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(out()).toContain('delay 1500');
  });

  it('writes the settled delay once, not again when the field is left', async () => {
    const writes: string[] = [];
    render(<FlowHarness doc={DOC} onWrite={(t) => writes.push(t)} />);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    const input = screen.getByTestId('step-delay-1') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '1500' } });
    await new Promise((resolve) => setTimeout(resolve, 200)); // quiet period commits
    fireEvent.blur(input, { target: { value: '1500' } });
    await new Promise((resolve) => setTimeout(resolve, 200)); // a stale timer must not re-fire
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('delay 1500');
  });

  it('leaving the delay field untouched writes nothing', () => {
    const writes: string[] = [];
    render(<FlowHarness doc={DOC} onWrite={(t) => writes.push(t)} />);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    const input = screen.getByTestId('step-delay-1') as HTMLInputElement;
    fireEvent.blur(input, { target: { value: '' } });
    expect(writes).toHaveLength(0);
  });
});
describe('per-step advance trigger editor', () => {
  it('exposes the advance trigger and writes click-driven steps explicitly', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-0'));
    const select = screen.getByTestId('insp-advance') as HTMLSelectElement;
    expect(select.value).toBe('end');
    fireEvent.change(select, { target: { value: 'click' } });
    expect(out()).toContain('advance click');
    fireEvent.change(screen.getByTestId('insp-advance'), { target: { value: 'end' } });
    expect(out()).not.toContain('advance click');
  });
});

describe('shared stacked field layout', () => {
  /** Every prose field of the open Flow properties panel. */
  const PROSE = ['flow-title', 'flow-description', 'flow-notes', 'flow-intro', 'flow-conclusion'];

  it('gives flow name, purpose, notes, intro and conclusion one stacked layout', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    for (const testid of PROSE) {
      const control = screen.getByTestId(testid);
      const field = control.closest('.flow-field');
      expect(field, `${testid} sits in a field row`).not.toBeNull();
      // One layout: label above the control, so nothing keeps the inline
      // label-beside-control measure in the prose panel.
      expect(field!.classList.contains('flow-field-stacked'), `${testid} is stacked`).toBe(true);
      expect(field!.lastElementChild, `${testid} control is last`).toBe(control);
      expect(field!.querySelector('.flow-field-label')!.textContent, `${testid} label first`).toBeTruthy();
    }
  });

  it('puts the step Description in the same stacked layout', () => {
    mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-0'));
    const control = screen.getByTestId('insp-description');
    const field = control.closest('.flow-field');
    expect(field!.classList.contains('flow-field-stacked')).toBe(true);
    expect(field!.lastElementChild).toBe(control);
  });

  it('grows the notes field with its content and keeps the written text', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    const notes = screen.getByTestId('flow-notes') as HTMLTextAreaElement;
    Object.defineProperty(notes, 'scrollHeight', { value: 200, configurable: true });
    fireEvent.focus(notes);
    fireEvent.input(notes, { target: { value: 'one\ntwo\nthree\nfour\nfive' } });
    expect(notes.style.height).toBe('200px');
    expect(out()).toContain('text "five"');
  });
});

describe('framing-row editor buttons', () => {
  it('opens the flow and asks for the matching field from both framing rows', () => {
    const asked: [string, string][] = [];
    render(
      <FlowHarness
        onEditFraming={(key, kind) => asked.push([key, kind])}
      />,
    );
    fireEvent.click(screen.getByTestId('flow-row-main'));
    // Row 1 is the introduction, the last row the conclusion.
    fireEvent.click(screen.getByTestId('step-frame-0'));
    const rows = screen.getAllByTestId(/^step-frame-/);
    fireEvent.click(rows[rows.length - 1]!);
    expect(asked).toEqual([['main', 'intro'], ['main', 'conclusion']]);
  });

  it('leaves ordinary row selection on Step properties', () => {
    render(<FlowHarness onEditFraming={() => {}} />);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-0'));
    // Selecting the framing step still shows the step inspector, not the flow.
    expect(screen.getByTestId('step-panel')).not.toBeNull();
    expect(screen.queryByTestId('flow-properties')).toBeNull();
  });

  it('offers the row button only when a handler is wired', () => {
    render(<FlowHarness />);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    expect(screen.queryAllByTestId(/^step-frame-/)).toHaveLength(0);
  });
});

describe('framing field focus hand-off', () => {
  const focused = (): string | null => {
    const el = document.activeElement;
    return el instanceof HTMLElement ? (el.dataset['testid'] ?? null) : null;
  };

  for (const kind of ['intro', 'conclusion'] as const) {
    it(`moves focus to the ${kind} field on request`, () => {
      const { rerender } = render(<FlowHarness selection={{ flow: 'main', step: [] }} />);
      // No request yet: the panel is open and nothing stole focus.
      expect(focused()).toBeNull();
      rerender(<FlowHarness selection={{ flow: 'main', step: [] }} focusField={{ kind, nonce: 1 }} />);
      expect(focused()).toBe(`flow-${kind}`);
      expect((screen.getByTestId(`flow-${kind}`) as HTMLTextAreaElement).selectionStart)
        .toBe((screen.getByTestId(`flow-${kind}`) as HTMLTextAreaElement).value.length);
    });
  }

  it('refocuses after the request counter changes', () => {
    const { rerender } = render(<FlowHarness selection={{ flow: 'main', step: [] }} focusField={{ kind: 'intro', nonce: 1 }} />);
    (screen.getByTestId('flow-conclusion') as HTMLTextAreaElement).focus();
    expect(focused()).toBe('flow-conclusion');
    rerender(<FlowHarness selection={{ flow: 'main', step: [] }} focusField={{ kind: 'intro', nonce: 2 }} />);
    expect(focused()).toBe('flow-intro');
  });
});
