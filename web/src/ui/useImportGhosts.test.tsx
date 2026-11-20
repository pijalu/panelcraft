// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { renderHook } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { useImportGhosts } from './useImportGhosts';
import { WorkspaceManager } from '../workspace/workspace';
import type { CanvasController } from './CanvasController';

describe('import ghost lifecycle', () => {
  it('clears ghosts when a backend switch makes a previously active path stale', () => {
    const manager = new WorkspaceManager({ skipWelcome: true });
    manager.createFileAt('old.pcd', 'pcd 1.0\nsystem old "Old"\n');
    const setGhosts = vi.fn();
    const ctrlRef = { current: { setGhosts } as unknown as CanvasController };
    const { rerender } = renderHook(({ version }) => useImportGhosts(
      manager,
      true,
      'old.pcd',
      version,
      ctrlRef,
    ), { initialProps: { version: 0 } });

    manager.removePath('old.pcd');
    expect(() => rerender({ version: 1 })).not.toThrow();
    expect(setGhosts).toHaveBeenLastCalledWith([]);
  });
});
