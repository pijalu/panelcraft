// SPDX-License-Identifier: GPL-3.0-only
// M5-WP5 unit tests — play bar transport UI over the real FlowRunner with
// injected fake ports (same harness as useFlowPlayer.test). Asserts buttons
// drive the executor and the ARIA narration hook renders the beat title.
// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { useFlowPlayer } from './useFlowPlayer';
import { PlayBar } from './PlayBar';

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
  conclusion "done"
}
`;

function Harness() {
  const player = useFlowPlayer({
    textOf: () => DOC,
    openFile: () => {},
    animator: { play: () => {}, stop: () => {}, pause: () => {}, resume: () => {}, settle: () => {} },
    camera: { focus: () => {}, save: () => {}, restoreSaved: () => {} },
    clock: { now: () => 0, delay: () => 0, cancel: () => {} },
    currentViewport: () => ({ x: 0, y: 0, k: 1 }),
  });
  return (
    <div>
      <button type="button" data-testid="boot" onClick={() => player.start('main.pcd', 'main')} />
      <PlayBar player={player} />
    </div>
  );
}

describe('PlayBar transport (M5-WP5)', () => {
  afterEach(cleanup);

  it('renders nothing while idle', () => {
    render(<Harness />);
    expect(screen.queryByTestId('playbar')).toBeNull();
  });

  it('shows narration, progress, and pauses via toggle', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('boot'));
    expect(screen.getByTestId('pb-narration').textContent).toBe('start');
    expect(screen.getByTestId('pb-narration').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByTestId('pb-progress').textContent).toBe('1/5');
    expect(screen.getByTestId('playbar').getAttribute('data-status')).toBe('playing');
    fireEvent.click(screen.getByTestId('pb-toggle'));
    expect(screen.getByTestId('playbar').getAttribute('data-status')).toBe('paused');
    fireEvent.click(screen.getByTestId('pb-toggle'));
    expect(screen.getByTestId('playbar').getAttribute('data-status')).toBe('playing');
  });

  it('steps forward/backward and restarts', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('boot'));
    fireEvent.click(screen.getByTestId('pb-step-fwd'));
    expect(screen.getByTestId('pb-progress').textContent).toBe('2/5');
    expect(screen.getByTestId('pb-narration').textContent).toBe('order');
    fireEvent.click(screen.getByTestId('pb-step-back'));
    expect(screen.getByTestId('pb-progress').textContent).toBe('1/5');
    fireEvent.click(screen.getByTestId('pb-step-fwd'));
    fireEvent.click(screen.getByTestId('pb-step-fwd')); // onto the alt chooser
    fireEvent.click(screen.getByTestId('pb-step-fwd')); // past it (branch step)
    expect(screen.getByTestId('pb-progress').textContent).toBe('4/5');
    fireEvent.click(screen.getByTestId('pb-restart'));
    expect(screen.getByTestId('pb-progress').textContent).toBe('1/5');
    expect(screen.getByTestId('pb-narration').textContent).toBe('start');
  });

  it('offers alt choices when paused on a chooser and applies the pick', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('boot'));
    fireEvent.click(screen.getByTestId('pb-step-fwd'));
    fireEvent.click(screen.getByTestId('pb-step-fwd')); // alt chooser
    expect(screen.getByTestId('playbar').getAttribute('data-status')).toBe('paused');
    expect(screen.getByTestId('pb-choice-0').textContent).toBe('fast');
    expect(screen.getByTestId('pb-choice-1').textContent).toBe('slow');
    fireEvent.click(screen.getByTestId('pb-choice-1'));
    expect(screen.queryByTestId('pb-choice-0')).toBeNull();
    expect(screen.getByTestId('pb-progress').textContent).toBe('4/5');
    expect(screen.getByTestId('pb-narration').textContent).toBe('Web');
  });

  it('exit returns to idle (bar unmounts)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('boot'));
    fireEvent.click(screen.getByTestId('pb-exit'));
    expect(screen.queryByTestId('playbar')).toBeNull();
  });
});

// UX08-WP13 — the transport shows the step description next to the narration.
const DOC_DESC = `pcd 1.0

person a "Ada"
system b "Web"

a -> b as ab

flow "Main" as main {
  intro "start" presentation {
    description "what this walkthrough explains"
  }
  a -> b : "order"
}
`;

function DescHarness() {
  const player = useFlowPlayer({
    textOf: () => DOC_DESC,
    openFile: () => {},
    animator: { play: () => {}, stop: () => {}, pause: () => {}, resume: () => {}, settle: () => {} },
    camera: { focus: () => {}, save: () => {}, restoreSaved: () => {} },
    clock: { now: () => 0, delay: () => 0, cancel: () => {} },
    currentViewport: () => ({ x: 0, y: 0, k: 1 }),
  });
  return (
    <div>
      <button type="button" data-testid="boot-desc" onClick={() => player.start('main.pcd', 'main')} />
      <PlayBar player={player} />
    </div>
  );
}

describe('PlayBar step description (UX08-WP13)', () => {
  afterEach(cleanup);

  it('renders the step description under the narration title', () => {
    render(<DescHarness />);
    fireEvent.click(screen.getByTestId('boot-desc'));
    expect(screen.getByTestId('pb-narration').textContent).toBe('start');
    expect(screen.getByTestId('pb-description').textContent).toBe('what this walkthrough explains');
  });

  it('hides the description element for steps without prose', () => {
    render(<DescHarness />);
    fireEvent.click(screen.getByTestId('boot-desc'));
    fireEvent.click(screen.getByTestId('pb-step-fwd'));
    expect(screen.getByTestId('pb-narration').textContent).toBe('order');
    expect(screen.queryByTestId('pb-description')).toBeNull();
  });
});
