// SPDX-License-Identifier: GPL-3.0-only
// Same-origin HTTP StoragePort. Revisions make stale writes explicit conflicts.
import {
  decodeStored, mapStoreError, StoreError,
  type StoragePort, type StoredWorkspace, type VersionStoragePort, type WorkspaceVersion,
} from './port';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiStorage implements StoragePort, VersionStoragePort {
  readonly kind = 'server' as const;
  readonly label: string;
  private revision: string | null = null;

  constructor(
    private readonly url: string,
    private readonly fetcher: Fetcher,
    private readonly backend: 'filesystem' | 'git' = 'filesystem',
  ) {
    this.label = backend === 'git' ? 'Git repository' : 'Server filesystem';
  }

  get versions(): VersionStoragePort | undefined {
    return this.backend === 'git' ? this : undefined;
  }

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

  async history(): Promise<WorkspaceVersion[]> {
    try {
      const response = await this.fetcher(`${this.url}/history`, { cache: 'no-store' });
      await this.check(response);
      return decodeVersions(await response.json());
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async show(id: string): Promise<StoredWorkspace> {
    try {
      const response = await this.fetcher(`${this.url}/history/${encodeURIComponent(id)}`, { cache: 'no-store' });
      await this.check(response);
      return decodeStored(await response.json());
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async restore(id: string): Promise<StoredWorkspace> {
    const revision = this.requireRevision();
    try {
      const response = await this.fetcher(`${this.url}/history/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
        headers: { 'X-PanelCraft-Storage': '1', 'If-Match': revision },
        cache: 'no-store',
      });
      await this.check(response);
      const workspace = decodeStored(await response.json());
      this.revision = this.nextRevision(response);
      return workspace;
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
function decodeVersions(raw: unknown): WorkspaceVersion[] {
  const versions = (raw as { versions?: unknown } | null)?.versions;
  if (!Array.isArray(versions)) throw new StoreError('corrupt', 'invalid version history response');
  return versions.map((version) => {
    if (typeof version?.id !== 'string' || typeof version?.message !== 'string' || typeof version?.savedAt !== 'number') {
      throw new StoreError('corrupt', 'invalid workspace version');
    }
    return { id: version.id, message: version.message, savedAt: version.savedAt };
  });
}
