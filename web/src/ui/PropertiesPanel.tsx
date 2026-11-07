// SPDX-License-Identifier: GPL-3.0-only
// Properties panel (M2-WP7, FR-C6): object name/description/technology/tags +
// link type/label/dashed. Every change is an undoable ValueChange (WP8).
import type { Ref } from 'preact';
import type { CanvasController } from './CanvasController';
import type { DiagramLink, DiagramObject } from './CanvasController';

interface PropertiesPanelProps {
  obj: DiagramObject | null;
  link: DiagramLink | null;
  nameFieldRef?: Ref<HTMLInputElement>;
  onChangeObject: CanvasController['updateObject'];
  onChangeLink: CanvasController['updateLink'];
}

const LINK_TYPES = [
  'uses',
  'includes',
  'requests',
  'returns',
  'publishes',
  'subscribes',
  'reads',
  'writes',
  'data',
];

export function PropertiesPanel({ obj, link, nameFieldRef, onChangeObject, onChangeLink }: PropertiesPanelProps) {
  if (obj) {
    return (
      <aside class="properties" data-testid="properties">
        <h2 class="panel-title">Properties</h2>
        <label class="field">
          <span class="field-label">Name</span>
          <input
            ref={nameFieldRef}
            data-testid="prop-name"
            value={obj.name ?? ''}
            onInput={(e) => onChangeObject(obj.id, { name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          <span class="field-label">Kind</span>
          <input value={obj.kind} disabled />
        </label>
        <label class="field">
          <span class="field-label">Description</span>
          <textarea
            data-testid="prop-description"
            rows={3}
            value={obj.description ?? ''}
            onInput={(e) => onChangeObject(obj.id, { description: (e.target as HTMLTextAreaElement).value })}
          />
        </label>
        <label class="field">
          <span class="field-label">Technology</span>
          <input
            data-testid="prop-technology"
            value={obj.technology ?? ''}
            onInput={(e) => onChangeObject(obj.id, { technology: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          <span class="field-label">Tags (comma-separated)</span>
          <input
            data-testid="prop-tags"
            value={(obj.tags ?? []).join(', ')}
            onInput={(e) =>
              onChangeObject(obj.id, {
                tags: (e.target as HTMLInputElement).value
                  .split(',')
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0),
              })
            }
          />
        </label>
        <label class="field field-checkbox">
          <input
            type="checkbox"
            data-testid="prop-dashed"
            checked={obj.dashed === true}
            onChange={(e) => onChangeObject(obj.id, { dashed: (e.target as HTMLInputElement).checked })}
          />
          <span class="field-label">Dashed border</span>
        </label>
      </aside>
    );
  }
  if (link) {
    return (
      <aside class="properties" data-testid="properties">
        <h2 class="panel-title">Link</h2>
        <label class="field">
          <span class="field-label">Type</span>
          <select
            data-testid="link-type"
            value={link.type}
            onChange={(e) => onChangeLink(link.id, { type: (e.target as HTMLSelectElement).value })}
          >
            {LINK_TYPES.map((t) => (
              <option key={t} value={t} selected={t === link.type}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Label</span>
          <input
            data-testid="link-label"
            value={link.label ?? ''}
            onInput={(e) => onChangeLink(link.id, { label: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field field-checkbox">
          <input
            type="checkbox"
            data-testid="link-dashed"
            checked={link.dashed === true}
            onChange={(e) => onChangeLink(link.id, { dashed: (e.target as HTMLInputElement).checked })}
          />
          <span class="field-label">Dashed</span>
        </label>
      </aside>
    );
  }
  return (
    <aside class="properties" data-testid="properties">
      <h2 class="panel-title">Properties</h2>
      <p class="muted panel-empty">Select an object or link to edit its properties.</p>
    </aside>
  );
}
