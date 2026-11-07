// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
const distDir = join(webDir, 'dist');

/**
 * M7-WP3 (SPEC N8): emit the hand-rolled service worker with the hashed
 * precache manifest substituted (no vite-plugin-pwa — ADR-0004 stdlib-first:
 * ~40 lines of owned plugin vs a dependency). Runs in `closeBundle`, after
 * dist is final.
 */
function serviceWorker(): Plugin {
  return {
    name: 'panelcraft-sw',
    writeBundle() {
      emitSw();
    },
  };
}

function emitSw(): void {
  const index = join(distDir, 'index.html');
  if (!existsSync(index)) return;
  const assets: string[] = ['/index.html'];
  const assetsDir = join(distDir, 'assets');
  if (existsSync(assetsDir)) {
    for (const f of readdirSync(assetsDir)) {
      if (statSync(join(assetsDir, f)).isFile()) assets.push(`/assets/${f}`);
    }
  }
  const sw = readSwSource()
    .replace(/^export\s+(default\s+)?/gm, '') // strip module syntax
    .replace(/^\s*declare\s+const[^\n]*\n/gm, '') // strip TS-only decls
    .replace(/\s+as\s+unknown\s+as\s+ServiceWorkerGlobalScope/g, '') // strip TS casts
    .replace(/const PRECACHE: string\[\] =/, 'const PRECACHE =')
    .replace(/\(event: ExtendableEvent\)/g, '(event)')
    .replace(/\(event: FetchEvent\)/g, '(event)')
    .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(assets)); // LAST: real sites incl. doc comment
  writeFileSync(join(distDir, 'sw.js'), sw);
}

/** Read sw.ts as text — it is emitted as-is (self-contained, no bundler). */
function readSwSource(): string {
  return readFileSync(join(webDir, 'src', 'sw.ts'), 'utf8');
}

export default defineConfig({
  root: 'web',
  plugins: [preact(), serviceWorker()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
});
