// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// F-11 properties panel: collapsible sections (persisted state) and the
// controls that were missing — custom key-value properties, style overrides
// and the link direction toggle. Every control must call the controller patch
// with exactly the field it edits.

import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { PropertiesPanel } from './PropertiesPanel';
import type { CanvasController, DiagramObject } from './CanvasController';

afterEach(cleanup);

const obj = (over: Partial<DiagramObject> = {}): DiagramObject => ({
  id: 'api',
  kind: 'system',
  x: 0,
  y: 0,
  w: 160,
  h: 60,
  name: 'API',
  ...over,
});

interface Patch {
  id: string;
  patch: Record<string, unknown>;
}

function mountObject(over: Partial<DiagramObject> = {}, sections: Record<string, boolean> = {}) {
  const patches: Patch[] = [];
  const toggles: string[] = [];
  const onChange = ((id: string, patch: Record<string, unknown>) => {
    patches.push({ id, patch });
  }) as CanvasController['updateObject'];
  render(
    <PropertiesPanel
      obj={obj(over)}
      link={null}
      onChangeObject={onChange}
      onChangeLink={() => {}}
      sections={sections}
      onToggleSection={(s) => toggles.push(s)}
    />,
  );
  return { patches, toggles };
}

describe('sections (F-11)', () => {
  it('renders the four sections with their persisted expanded state', () => {
    mountObject({}, { advanced: true, metadata: false });
    for (const id of ['identity', 'metadata', 'style', 'advanced']) {
      expect(screen.getByTestId(`section-${id}`)).not.toBeNull();
    }
    expect(screen.getByTestId('section-toggle-identity').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('section-toggle-metadata').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('section-toggle-advanced').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps a collapsed section body out of the DOM (and reports the toggle)', () => {
    const { toggles } = mountObject({}, { metadata: false });
    expect(screen.queryByTestId('prop-description')).toBeNull();
    fireEvent.click(screen.getByTestId('section-toggle-metadata'));
    expect(toggles).toEqual(['metadata']);
  });
});

describe('object controls (F-11)', () => {
  it('name, description, technology and tags patch the object', () => {
    const { patches } = mountObject({}, { advanced: false });
    fireEvent.input(screen.getByTestId('prop-name'), { target: { value: 'Gateway' } });
    fireEvent.input(screen.getByTestId('prop-description'), { target: { value: 'edge' } });
    fireEvent.input(screen.getByTestId('prop-technology'), { target: { value: 'Go' } });
    fireEvent.input(screen.getByTestId('prop-tags'), { target: { value: 'core, pci' } });
    expect(patches.map((p) => p.patch)).toEqual([
      { name: 'Gateway' },
      { description: 'edge' },
      { technology: 'Go' },
      { tags: ['core', 'pci'] },
    ]);
  });

  it('custom properties can be added, edited and removed', () => {
    const { patches } = mountObject({ properties: [{ key: 'owner', value: 'core' }] });
    fireEvent.input(screen.getByTestId('prop-prop-value-0'), { target: { value: 'platform' } });
    fireEvent.click(screen.getByTestId('prop-prop-add'));
    fireEvent.click(screen.getByTestId('prop-prop-del-0'));
    expect(patches[0]?.patch).toEqual({ properties: [{ key: 'owner', value: 'platform' }] });
    expect(patches[1]?.patch).toEqual({
      properties: [{ key: 'owner', value: 'core' }, { key: 'key2', value: '' }],
    });
    expect(patches[2]?.patch).toEqual({ properties: [] });
  });

  it('style overrides patch fill/stroke/text individually', () => {
    const { patches } = mountObject({ style: { fill: '#111111' } });
    fireEvent.input(screen.getByTestId('prop-style-stroke'), { target: { value: '#ff0000' } });
    expect(patches[0]?.patch).toEqual({ style: { fill: '#111111', stroke: '#ff0000' } });
    fireEvent.input(screen.getByTestId('prop-style-icon'), { target: { value: 'cloud' } });
    expect(patches[1]?.patch).toEqual({ style: { fill: '#111111', icon: 'cloud' } });
  });

  it('the dashed checkbox still patches the object', () => {
    const { patches } = mountObject();
    fireEvent.click(screen.getByTestId('prop-dashed'));
    expect(patches[0]?.patch).toEqual({ dashed: true });
  });
});

describe('link controls (F-11/F-12)', () => {
  it('bidir and the arrow model patch the link', () => {
    const patches: Record<string, unknown>[] = [];
    render(
      <PropertiesPanel
        obj={null}
        link={{ id: 'L1', from: 'a', to: 'b' }}
        onChangeObject={() => {}}
        onChangeLink={((_id: string, patch: Record<string, unknown>) => {
          patches.push(patch);
        }) as CanvasController['updateLink']}
      />,
    );
    fireEvent.click(screen.getByTestId('link-bidir'));
    fireEvent.change(screen.getByTestId('link-head'), { target: { value: 'diamond' } });
    expect(patches[0]).toEqual({ bidir: true });
    expect(patches[1]).toEqual({ head: 'diamond' });
  });
});
