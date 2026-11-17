// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
// The one icon-write command: moving the control into Identity must not duplicate
// or lose the patch behaviour that clears a stale `style { icon … }` override.
import { describe, expect, it } from 'vitest';
import { writeObjectIcon } from './iconCommands';
import type { DiagramObject } from './CanvasController';

const obj = (over: Partial<DiagramObject> = {}): DiagramObject => ({
  id: 'api', kind: 'system', x: 0, y: 0, w: 160, h: 60, ...over,
});

describe('writeObjectIcon', () => {
  it('writes the object icon when there is no stale style override', () => {
    expect(writeObjectIcon(obj({ icon: 'db' }), 'cloud')).toEqual({ icon: 'cloud' });
  });

  it('clears a stale style override in the same patch', () => {
    expect(writeObjectIcon(obj({ style: { fill: '#111', icon: 'cloud' } }), 'db')).toEqual({
      style: { fill: '#111', icon: undefined },
      icon: 'db',
    });
  });

  it('clears both fields when the author picks no icon', () => {
    expect(writeObjectIcon(obj({ icon: 'db', style: { icon: 'cloud' } }), undefined)).toEqual({
      style: { icon: undefined },
      icon: undefined,
    });
  });

  it('leaves other style keys untouched when clearing the override', () => {
    expect(writeObjectIcon(obj({ style: { fill: '#f00', stroke: '#0f0', icon: 'db' } }), undefined)).toEqual({
      style: { fill: '#f00', stroke: '#0f0', icon: undefined },
      icon: undefined,
    });
  });
});
