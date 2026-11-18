// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// F-11 properties panel: collapsible sections (persisted state) and the
// controls that were missing — custom key-value properties, style overrides
// and the link direction toggle. Every control must call the controller patch
// with exactly the field it edits.

import { describe, expect, it, afterEach } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/preact';
import { PropertiesPanel, type HierarchyProps } from './PropertiesPanel';
import type { CanvasController, DiagramObject } from './CanvasController';

afterEach(cleanup);

const section = (id: string): HTMLElement | null => document.querySelector(`[data-testid="section-${id}"]`);
const hierarchy = (): HierarchyProps => ({
  target: null,
  candidates: [],
  onSet: () => {},
  onOpen: () => {},
  hasSource: false,
  onOpenSource: () => {},
});

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

function mountObject(over: Partial<DiagramObject> = {}, sections: Record<string, boolean> = {}, h?: HierarchyProps) {
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
      {...(h === undefined ? {} : { hierarchy: h })}
    />,
  );
  return { patches, toggles };
}

describe('sections (F-11)', () => {
  it('renders every section with its persisted expanded state', () => {
    mountObject({}, { advanced: true, metadata: false }, hierarchy());
    for (const id of ['identity', 'style', 'metadata', 'hierarchy', 'advanced']) {
      expect(section(id)).not.toBeNull();
    }
    expect(screen.getByTestId('section-toggle-identity').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('section-toggle-metadata').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('section-toggle-advanced').getAttribute('aria-expanded')).toBe('true');
  });

  it('orders Identity → Style → Metadata → Decomposition → Advanced and puts Icon in Identity', () => {
    mountObject({}, {}, hierarchy());
    const ids = Array.from(document.querySelectorAll('section.prop-section'))
      .map((el) => (el as HTMLElement).dataset.testid?.replace('section-', ''));
    expect(ids).toEqual(['identity', 'style', 'metadata', 'hierarchy', 'advanced']);
    expect(section('identity')?.querySelector('[data-testid="prop-style-icon"]')).not.toBeNull();
    expect(section('style')?.querySelector('[data-testid="prop-style-icon"]')).toBeNull();
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
  });

  it('writes the icon from the single picker to the object', () => {
    const { patches } = mountObject({ style: { fill: '#111111' } });
    fireEvent.click(screen.getByTestId('prop-style-icon'));
    fireEvent.click(screen.getByTestId('icon-option-cloud'));
    expect(patches[0]?.patch).toEqual({ icon: 'cloud' });
  });

  it('clears a stale style override in one patch when picking no icon', () => {
    const { patches } = mountObject({ icon: 'db', style: { icon: 'cloud' } });
    // the trigger shows the icon that is actually drawn (the override)
    expect(screen.getByTestId('prop-style-icon').textContent).toContain('cloud');
    fireEvent.click(screen.getByTestId('prop-style-icon'));
    fireEvent.click(screen.getByTestId('icon-option-none'));
    expect(patches[0]?.patch).toEqual({ style: { icon: undefined }, icon: undefined });
  });

  it('shows the object icon in the trigger even without a style override', () => {
    mountObject({ icon: 'db' });
    expect(screen.getByTestId('prop-style-icon').textContent).toContain('db');
  });

  it('patches integer stacking and restores Auto without inventing a value', () => {
    const { patches } = mountObject({ z: -2 });
    const input = screen.getByTestId('prop-z') as HTMLInputElement;
    // Preact drives the controlled property; the attribute stays empty.
    expect(input.value).toBe('-2');
    expect(input.getAttribute('placeholder')).toBe('Auto');
    expect(input.step).toBe('1');
    fireEvent.input(input, { target: { value: '3' } });
    fireEvent.input(input, { target: { value: '' } });
    fireEvent.input(input, { target: { value: '1.5' } });
    expect(patches.map((p) => p.patch)).toEqual([{ z: 3 }, { z: undefined }]);
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
    fireEvent.click(screen.getByTestId('link-allow-overlap'));
    fireEvent.click(screen.getByTestId('link-head-diamond'));
    fireEvent.click(screen.getByTestId('link-line-dotted'));
    fireEvent.click(screen.getByTestId('link-width-preset-3'));
    fireEvent.click(screen.getByTestId('link-route-curved'));
    fireEvent.click(screen.getByTestId('link-route-orthogonal'));
    fireEvent.input(screen.getByTestId('link-sparks'), { target: { value: '4' } });
    fireEvent.input(screen.getByTestId('link-speed'), { target: { value: '2' } });
    fireEvent.input(screen.getByTestId('link-sparks'), { target: { value: '9' } });
    fireEvent.input(screen.getByTestId('link-speed'), { target: { value: '0' } });
    fireEvent.input(screen.getByTestId('link-sparks'), { target: { value: '1' } });
    fireEvent.input(screen.getByTestId('link-speed'), { target: { value: '1' } });
    expect(patches[0]).toEqual({ bidir: true });
    expect(patches[1]).toEqual({ allowOverlap: true });
    expect(patches[2]).toEqual({ head: 'diamond' });
    expect(patches[3]).toEqual({ line: 'dotted' });
    expect(patches[4]).toEqual({ width: 3 });
    expect(patches[5]).toEqual({ route: 'curved' });
    expect(patches[6]).toEqual({ route: undefined });
    // FLOW-02: bounded values are written, out-of-range input is ignored,
    // and a value equal to the default clears the field.
    expect(patches[7]).toEqual({ sparks: 4 });
    expect(patches[8]).toEqual({ speed: 2 });
    expect(patches[9]).toEqual({ sparks: undefined });
    expect(patches[10]).toEqual({ speed: undefined });
  });
});
