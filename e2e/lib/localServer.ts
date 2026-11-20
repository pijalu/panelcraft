// SPDX-License-Identifier: GPL-3.0-only
// Real local-binary fixture for workspace-storage browser scenarios.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

export interface LocalWorkspaceServer {
  url: string;
  directory: string;
  stop(): Promise<void>;
}

async function availablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolveListen, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = listener.address();
  if (address === null || typeof address === 'string') throw new Error('no local TCP port');
  const { port } = address;
  await new Promise<void>((resolveClose) => listener.close(() => resolveClose()));
  return port;
}

async function waitUntilReady(url: string, process: ChildProcess, output: () => string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (process.exitCode !== null) throw new Error(`local server exited:\n${output()}`);
    try {
      const response = await fetch(`${url}/api/v1/workspace`);
      if (response.ok) return;
    } catch {
      // The listener may not be bound yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`local server did not become ready:\n${output()}`);
}

/** Build and start the actual CLI against an isolated temporary directory. */
export async function startLocalWorkspaceServer(depth = -1): Promise<LocalWorkspaceServer> {
  const work = mkdtempSync(join(tmpdir(), 'panelcraft-e2e-storage-'));
  const directory = join(work, 'workspace');
  mkdirSync(directory);
  const binary = join(work, process.platform === 'win32' ? 'panelcraft.exe' : 'panelcraft');
  const repository = resolve(import.meta.dirname, '../..');
  execFileSync('go', ['build', '-o', binary, './cmd/panelcraft'], { cwd: repository, stdio: 'pipe' });
  const port = await availablePort();
  const log = join(work, 'server.log');
  const child = spawn(binary, ['serve', '-addr', `127.0.0.1:${port}`, '-local', directory, '-depth', String(depth)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stream = createWriteStream(log);
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  const url = `http://127.0.0.1:${port}`;
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
    }
    stream.end();
    rmSync(work, { recursive: true, force: true });
  };
  try {
    await waitUntilReady(url, child, () => readFileSync(log, 'utf8'));
  } catch (error) {
    await stop();
    throw error;
  }
  return { url, directory, stop };
}
