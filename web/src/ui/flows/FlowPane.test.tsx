// SPDX-License-Identifier: GPL-3.0-only
// M5-WP4 unit tests — flow editor pane: flow list + play, step tree,
// per-type inspectors, structural ops. All edits asserted through the
// retext round-trip (the onChangeText payload re-parses).
// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { parsePDL } from '../../engine/format/parser';
import { FlowPane, type FlowCanvasContext, type FlowPaneProps } from './FlowPane';
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

/** Harness: keeps the document text in state, like App does via the machine. */
function Harness({ canvas }: { canvas?: FlowCanvasContext } = {}) {
  const [text, setText] = useState(DOC);
  const played: string[] = [];
  const props: FlowPaneProps = {
    textOf: () => text,
    activePath: 'main.pcd',
    version: 1,
    onChangeText: (t) => setText(t),
    onPlay: (k) => {
      played.push(k);
    },
    ...(canvas === undefined ? {} : { canvas }),
  };
  return (
    <div>
      <FlowPane {...props} />
      <pre data-testid="text-out">{text}</pre>
    </div>
  );
}

function mount(canvas?: FlowCanvasContext) {
  render(<Harness canvas={canvas} />);
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
    render(
      <FlowPane
        textOf={() => DOC}
        activePath="main.pcd"
        version={1}
        onChangeText={() => {}}
        onPlay={(k) => {
          played.push(k);
        }}
      />,
    );
    expect(screen.getByTestId('flow-row-main').textContent).toContain('Main');
    // BUG-07: a truncated title must still be readable on hover/focus.
    expect(screen.getByTestId('flow-row-main').getAttribute('title')).toBe('Main');
    fireEvent.click(screen.getByTestId('flow-play-main'));
    expect(played).toEqual(['main']);
  });

  it('shows a muted hint when no file is active', () => {
    render(
      <FlowPane
        textOf={() => DOC}
        activePath={null}
        version={1}
        onChangeText={() => {}}
        onPlay={() => {}}
      />,
    );
    expect(screen.getByTestId('flow-error').textContent).toContain('Open a file');
  });

  it('shows a muted hint when the active file has parse errors', () => {
    render(
      <FlowPane
        textOf={() => 'pcd 1.0\n nonsense !!!'}
        activePath="main.pcd"
        version={1}
        onChangeText={() => {}}
        onPlay={() => {}}
      />,
    );
    expect(screen.getByTestId('flow-error').textContent).toContain('parse errors');
  });

  it('adds a flow and selects it', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-add'));
    expect(out()).toContain('flow "New flow" as flow2');
    fireEvent.click(screen.getByTestId('flow-row-flow2'));
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
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

  it('edits a goto target flow id', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-8')); // goto
    const f = screen.getByTestId('insp-goto-flow') as HTMLInputElement;
    expect(f.value).toBe('refund');
    fireEvent.input(f, { target: { value: 'refund2' } });
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
    const { out } = mount(canvas);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1')); // msg a -> b
    // Start from a wrong pair, then repair it through the canvas controls.
    fireEvent.input(screen.getByTestId('insp-from'), { target: { value: 'b' } });
    fireEvent.click(screen.getByTestId('insp-pick-link'));
    expect(out()).toContain('a -> b : "order"');
    fireEvent.click(screen.getByTestId('insp-pick-to'));
    expect(out()).toContain('a -> b : "order"');
  });

  it('targets a process step from the canvas selection', () => {
    const { out } = mount(canvas);
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-7')); // process a inside alt branch
    fireEvent.click(screen.getByTestId('insp-pick-target'));
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
    render(
      <FlowPane
        textOf={() => text}
        activePath="main.pcd"
        version={1}
        onChangeText={(t) => {
          text = t;
        }}
        onPlay={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('flow-row-f'));
    expect((screen.getByTestId('add-msg') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('flow-needs-link').textContent).toContain('connector');
    expect(text).toBe(noLinks);
  });

  it('reports card summaries and highlights canvas participants', () => {
    const highlights: (string[] | null)[] = [];
    const props: FlowPaneProps = {
      textOf: () => DOC,
      activePath: 'main.pcd',
      version: 1,
      onChangeText: () => {},
      onPlay: () => {},
      canvas,
      onHighlight: (ids) => highlights.push(ids),
    };
    render(<FlowPane {...props} />);
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
  let version = 0;
  function Host() {
    const [, bump] = useState(0);
    return (
      <div>
        <FlowPane
          textOf={() => text}
          activePath="main.pcd"
          version={version}
          onChangeText={(t) => {
            text = t;
            version += 1;
            bump(version);
          }}
          onPlay={(k) => played.push(k)}
          {...(canvas === undefined ? {} : { canvas })}
        />
        <pre data-testid="text-out">{text}</pre>
      </div>
    );
  }
  render(<Host />);
  return { out: () => screen.getByTestId('text-out').textContent ?? '' };
}

describe('FlowPane guided authoring (UX08-WP12)', () => {
  it('starts authoring from a blank file (no header yet)', () => {
    const { out } = mountDoc('');
    expect(screen.getByTestId('flow-empty')).not.toBeNull();
    fireEvent.click(screen.getByTestId('flow-add'));
    expect(out()).toContain('pcd 1.0');
    expect(out()).toContain('flow "New flow" as flow1');
  });

  it('explains flows and offers New flow when the document has none', () => {
    mountDoc(FRESH);
    expect(screen.getByTestId('flow-empty').textContent).toContain('guided walkthrough');
    const add = screen.getByTestId('flow-add');
    expect(add.textContent).toBe('New flow');
    fireEvent.click(add);
    expect(screen.queryByTestId('flow-empty')).toBeNull();
    expect(screen.getByTestId('flow-steps')).not.toBeNull();
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

  it('adds notes, an introduction and a conclusion in one click', () => {
    const { out } = mountDoc(FRESH);
    fireEvent.click(screen.getByTestId('flow-add'));
    fireEvent.click(screen.getByTestId('add-intro'));
    fireEvent.click(screen.getByTestId('add-note'));
    fireEvent.click(screen.getByTestId('add-conclusion'));
    expect(out()).toContain('intro "New intro"');
    expect(out()).toContain('info "Note"');
    expect(out()).toContain('conclusion "Summary"');
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

  it('describes a step and shows the description on its card', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    fireEvent.click(screen.getByTestId('step-1'));
    fireEvent.input(screen.getByTestId('insp-description'), { target: { value: 'pay by card' } });
    expect(out()).toContain('description "pay by card"');
    expect(screen.getByTestId('step-desc-1').textContent).toContain('pay by card');
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

function ViewHarness() {
  const [text, setText] = useState(DOC);
  return (
    <div>
      <FlowPane
        textOf={() => text}
        activePath="main.pcd"
        version={1}
        onChangeText={(t) => setText(t)}
        onPlay={() => {}}
        currentView={() => VIEW}
      />
      <pre data-testid="text-out">{text}</pre>
    </div>
  );
}

function mountWithView(): { out: () => string } {
  render(<ViewHarness />);
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
