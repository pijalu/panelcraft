// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
// C4 drill-down + embedded source, end to end at the shell layer (IR v10, SPEC
// drill-down and source rules): the trail opens a subordinate diagram, the breadcrumbs walk back,
// the parent boundary is announced, and the source dialog shows text instead of
// running it.
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from '../workspace/workspace';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import type { Doc } from '../engine/model/types';
import { DrillBar } from './DrillBar';
import { SourceViewer } from './SourceViewer';
import { useDrillLayer } from './useDrilldown';

const CONTEXT = `pcd 1.0
title "Shop"
system shop "Webshop" {
  drilldown "../containers/shop.pcd"
  source {
    language "go"
    text "func main() {"
    text "<script>alert(1)</script>"
    text "}"
  }
}
`;

const CONTAINERS = `pcd 1.0
title "Shop containers"
level container
container api "API" {
  drilldown "../components/api.pcd"
}
`;

const COMPONENTS = `pcd 1.0
title "API components"
level component
component handler "Handler"
`;

function makeManager(): WorkspaceManager {
  const manager = new WorkspaceManager({ skipWelcome: true });
  manager.createFileAt('systems/shop.pcd', CONTEXT);
  manager.createFileAt('containers/shop.pcd', CONTAINERS);
  manager.createFileAt('components/api.pcd', COMPONENTS);
  manager.openFile('systems/shop.pcd');
  return manager;
}

/** One shell-layer harness: the trail hook + the chrome it feeds. */
function Harness(props: { manager: WorkspaceManager; objectId: string }) {
  const layer = useDrillLayer({
    activePath: props.manager.activePath,
    manager: props.manager,
    version: 1,
    revision: 1,
    ctrlRef: { current: null },
    commitDoc: (doc: Doc) => props.manager.saveText(props.manager.activePath ?? '', printDoc(doc)),
    openFile: (path) => props.manager.openFile(path),
  });
  return (
    <div>
      <DrillBar drill={layer.drill} />
      <button
        type="button"
        data-testid="drill"
        onClick={() => layer.drill.drill(layer.drill.primary?.id ?? props.objectId)}
      >
        drill
      </button>
    </div>
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(cleanup);

describe('drill-down navigation', () => {
  it('opens the child diagram and walks back through the breadcrumbs', async () => {
    const manager = makeManager();
    render(<Harness manager={manager} objectId="shop" />);
    // A root file has no trail chrome: nothing to go back to.
    expect(screen.queryByTestId('drill-crumbs')).toBeNull();

    fireEvent.click(screen.getByTestId('drill'));
    await act(async () => {});
    expect(manager.activePath).toBe('containers/shop.pcd');
    const nav = screen.getByTestId('drill-crumbs');
    expect(nav.textContent).toContain('Back to shop.pcd');
    expect(screen.getByTestId('parent-context').textContent).toContain('Webshop');
  });

  it('keeps the context and explains a broken relation instead of opening it', async () => {
    const manager = makeManager();
    manager.saveText('systems/shop.pcd', CONTEXT.replace('../containers/shop.pcd', '../containers/gone.pcd'));
    render(<Harness manager={manager} objectId="shop" />);
    fireEvent.click(screen.getByTestId('drill'));
    await act(async () => {});
    expect(manager.activePath).toBe('systems/shop.pcd');
    expect(screen.getByTestId('drill-notice').textContent).toContain('not in this workspace');
  });

  it('refuses to re-enter a diagram already in the trail (cycle)', async () => {
    const manager = makeManager();
    manager.saveText('containers/shop.pcd', CONTAINERS.replace('../components/api.pcd', '../systems/shop.pcd'));
    render(<Harness manager={manager} objectId="shop" />);
    fireEvent.click(screen.getByTestId('drill'));
    await act(async () => {});
    fireEvent.click(screen.getByTestId('drill'));
    await act(async () => {});
    expect(screen.getByTestId('drill-notice').textContent).toContain('already open');
  });
});

describe('embedded source viewer', () => {
  const obj = parsePDL(CONTEXT).doc?.objects.find((o) => o.id === 'shop');

  it('shows source as text and never as markup', () => {
    if (obj === undefined) throw new Error('fixture object missing');
    render(<SourceViewer obj={obj} onSave={() => undefined} onClose={() => undefined} />);
    const read = screen.getByTestId('source-read');
    expect(read.textContent).toContain('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(read.tagName).toBe('PRE');
  });

  it('saves edited text as one line list', () => {
    if (obj === undefined) throw new Error('fixture object missing');
    let saved: { language?: string; lines: string[] } | null = null;
    render(<SourceViewer obj={obj} onSave={(next) => { saved = next; }} onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId('source-edit'));
    const editor = screen.getByTestId('source-editor') as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: 'const a = 1;\nconst b = 2;' } });
    fireEvent.input(screen.getByTestId('source-language'), { target: { value: 'ts' } });
    fireEvent.click(screen.getByTestId('source-save'));
    expect(saved).toEqual({ language: 'ts', lines: ['const a = 1;', 'const b = 2;'] });
  });
});
