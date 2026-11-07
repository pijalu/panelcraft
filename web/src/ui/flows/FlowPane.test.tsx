// SPDX-License-Identifier: GPL-3.0-only
// M5-WP4 unit tests — flow editor pane: flow list + play, step tree,
// per-type inspectors, structural ops. All edits asserted through the
// retext round-trip (the onChangeText payload re-parses).
// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { parsePDL } from '../../engine/format/parser';
import { FlowPane, type FlowPaneProps } from './FlowPane';

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
function Harness() {
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
  };
  return (
    <div>
      <FlowPane {...props} />
      <pre data-testid="text-out">{text}</pre>
    </div>
  );
}

function mount() {
  render(<Harness />);
  const out = (): string => screen.getByTestId('text-out').textContent ?? '';
  return { out };
}

afterEach(cleanup);

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

  it('adds a step of the chosen kind at the end', () => {
    const { out } = mount();
    fireEvent.click(screen.getByTestId('flow-row-main'));
    const kindSel = screen.getByTestId('step-add-kind') as HTMLSelectElement;
    fireEvent.change(kindSel, { target: { value: 'process' } });
    fireEvent.click(screen.getByTestId('step-add'));
    const doc = parsePDL(out()).doc;
    const steps = doc?.flows[0]?.steps ?? [];
    expect(steps.at(-1)?.type).toBe('process');
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
