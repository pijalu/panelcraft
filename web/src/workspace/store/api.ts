// SPDX-License-Identifier: GPL-3.0-only
// Same-origin HTTP StoragePort. Revisions make stale writes explicit conflicts.
import { decodeStored, mapStoreError, StoreError, type StoragePort, type StoredWorkspace } from './port';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiStorage implements StoragePort {
  readonly kind = 'server' as const;
  readonly label = 'Server filesystem';
  private revision: string | null = null;

  constructor(private readonly url: string, private readonly fetcher: Fetcher) {}

  async load(): Promise<StoredWorkspace> {
    try {
      const response = await this.fetcher(this.url, { cache: 'no-store' });
      await this.check(response);
      this.revision = response.headers.get('ETag');
      if (this.revision === null) throw new StoreError('unavailable', 'server omitted the workspace revision');
      return decodeStored(await response.json());
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async save(workspace: StoredWorkspace): Promise<void> {
    const revision = this.requireRevision();
    try {
      const response = await this.fetcher(this.url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-PanelCraft-Storage': '1',
          'If-Match': revision,
        },
        body: JSON.stringify(workspace),
        cache: 'no-store',
      });
      await this.check(response);
      this.revision = this.nextRevision(response);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async clear(): Promise<void> {
    const revision = this.requireRevision();
    try {
      const response = await this.fetcher(this.url, {
        method: 'DELETE',
        headers: { 'X-PanelCraft-Storage': '1', 'If-Match': revision },
        cache: 'no-store',
      });
      await this.check(response);
      this.revision = this.nextRevision(response);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async estimate(): Promise<number | null> {
    return null;
  }

  private requireRevision(): string {
    if (this.revision === null) throw new StoreError('unavailable', 'workspace must be loaded before it can be changed');
    return this.revision;
  }

  private nextRevision(response: Response): string {
    const revision = response.headers.get('ETag');
    if (revision === null) throw new StoreError('unavailable', 'server omitted the new workspace revision');
    return revision;
  }

  private async check(response: Response): Promise<void> {
    if (response.ok) return;
    const message = (await response.text()).trim() || `workspace request failed (${response.status})`;
    if (response.status === 409) throw new StoreError('conflict', message);
    throw new StoreError('unavailable', message);
  }
}
