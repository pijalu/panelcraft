// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { ApiStorage } from './api';
import { createAppStorage } from './selection';
import { MemoryStorage } from './memory';
import { newStoredWorkspace } from './port';

function response(status: number, body = '', etag?: string): Response {
  const headers = new Headers();
  if (etag) headers.set('ETag', etag);
  return new Response(status === 204 ? null : body, { status, headers });
}

function loaded(): { storage: ApiStorage; fetcher: ReturnType<typeof vi.fn>; workspace: ReturnType<typeof newStoredWorkspace> } {
  const workspace = newStoredWorkspace('server');
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response(200, JSON.stringify(workspace), '"one"'))
    .mockResolvedValue(response(204, '', '"two"'));
  return { storage: new ApiStorage('/api/v1/workspace', fetcher), fetcher, workspace };
}

describe('ApiStorage', () => {
  it('loads and saves with optimistic revisions and no caching', async () => {
    const { storage, fetcher, workspace } = loaded();
    expect(await storage.load()).toEqual(workspace);
    await storage.save(workspace);
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/v1/workspace', { cache: 'no-store' });
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/v1/workspace', expect.objectContaining({
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-PanelCraft-Storage': '1',
        'If-Match': '"one"',
      },
      cache: 'no-store',
    }));
    await storage.clear();
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: 'DELETE', headers: { 'X-PanelCraft-Storage': '1', 'If-Match': '"two"' } });
  });

  it('maps a stale revision to a conflict without reporting success', async () => {
    const workspace = newStoredWorkspace();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(200, JSON.stringify(workspace), '"one"'))
      .mockResolvedValueOnce(response(409, 'changed externally'));
    const storage = new ApiStorage('/api/v1/workspace', fetcher);
    await storage.load();
    await expect(storage.save(workspace)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('requires a revision from the server', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(200, JSON.stringify(newStoredWorkspace())));
    const storage = new ApiStorage('/api/v1/workspace', fetcher);
    await expect(storage.load()).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('application storage selection', () => {
  it('uses the advertised server backend without a discovery request', async () => {
    const element = { getAttribute: () => 'filesystem' };
    const document = { querySelector: vi.fn(() => element) } as unknown as Document;
    const fetcher = vi.fn();
    const storage = await createAppStorage({ document, fetcher, factory: undefined });
    expect(storage).toBeInstanceOf(ApiStorage);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses browser storage on static hosting and never probes the API', async () => {
    const document = { querySelector: vi.fn(() => null) } as unknown as Document;
    const fetcher = vi.fn();
    const storage = await createAppStorage({ document, fetcher, factory: undefined });
    expect(storage).toBeInstanceOf(MemoryStorage);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
