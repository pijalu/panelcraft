// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { defineConfig, transformWithOxc, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), 'web');
const distDir = join(webDir, 'dist');

/**
 * M7-WP3 (SPEC N8) + UX08-WP04: emit the hand-rolled service worker with a
 * scope-relative precache manifest and a content-hash cache identity (no
 * vite-plugin-pwa — ADR-0004 stdlib-first: ~50 lines of owned plugin).
 * Runs in `writeBundle`, after dist is final.
 */
function serviceWorker(): Plugin {
  return {
    name: 'panelcraft-sw',
    async writeBundle(options) {
      // Emit beside the bundle that was actually written: `--outDir`/`--base`
      // overrides (sub-path hosting checks) must not drop the worker into dist.
      await emitSw(options.dir ?? distDir);
    },
  };
}

/** Every file the shell needs offline, as scope-relative URLs. */
function precacheEntries(dist: string): string[] {
  const entries = ['index.html', 'manifest.webmanifest'];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else entries.push(`${prefix}${name}`);
    }
  };
  walk(join(dist, 'assets'), 'assets/');
  walk(join(dist, 'icons'), 'icons/');
  return entries.map((entry) => `./${entry}`);
}

async function emitSw(dir: string): Promise<void> {
  const index = join(dir, 'index.html');
  if (!existsSync(index)) return;
  const precache = precacheEntries(dir);
  // Cache identity is derived from the emitted file list, so a new build always
  // gets a new cache name and `activate` can drop the previous shell.
  const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
  // Transpile instead of pattern-stripping: the worker is TypeScript with real
  // annotations, and a regex stripper silently emitted invalid JS.
  const { code } = await transformWithOxc(readSwSource(), 'sw.ts', {
    lang: 'ts',
    target: 'es2022',
  });
  const sw = code
    .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(precache))
    .replaceAll('__SHELL_VERSION__', JSON.stringify(version));
  // The worker is emitted at the bundle root, so a sub-path build serves it at
  // <base>/sw.js and its scope-relative URLs resolve inside that scope.
  writeFileSync(join(dir, 'sw.js'), sw);
}

/** Read sw.ts as text — it is emitted as-is (self-contained, no bundler). */
function readSwSource(): string {
  return readFileSync(join(webDir, 'src', 'sw.ts'), 'utf8');
}

/** Whatever revision this bundle was built from, as the CI job knows it. */
interface SourceIdentity {
  sha: string;
  ref: string;
}

/** The commit being built: the CI SHA when present, else the local HEAD. */
function sourceIdentity(): SourceIdentity {
  const git = (args: string[]): string => {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  };
  const sha = process.env.GITHUB_SHA ?? git(['rev-parse', 'HEAD']);
  const ref = process.env.GITHUB_REF_NAME ?? git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return { sha: sha === '' ? 'unknown' : sha, ref: ref === '' ? 'unknown' : ref };
}

/** Hashed bundle files, so a served bundle can be matched to the built one. */
function bundleFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string, prefix: string): void => {
    if (!existsSync(current)) return;
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else files.push(`${prefix}${name}`);
    }
  };
  walk(dir, '');
  return files;
}

/**
 * Deployment provenance (release gate for the hosted site): stamp the built
 * bundle with the commit it came from and the hash of every emitted file, so a
 * served page can be matched against the build instead of being trusted because
 * a deploy job went green.
 *
 * Two halves, both derived from the same `SourceIdentity`:
 *   - `build-info.json` in the bundle root — the machine-readable record the
 *     hosted evidence step downloads and compares;
 *   - `<meta name="panelcraft-build">` in index.html — the identity a browser
 *     (and the hosted smoke suite) can read without an extra request.
 *
 * `build-info.json` is written after the service worker's precache manifest is
 * computed on purpose: a file that names the build must never be served from a
 * previous build's cache.
 */
function buildInfo(): Plugin {
  const identity = sourceIdentity();
  const short = identity.sha.slice(0, 7);
  return {
    name: 'panelcraft-build-info',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta name="panelcraft-build" content="${short}" />`,
      );
    },
    writeBundle(options) {
      const dir = options.dir ?? distDir;
      const files = bundleFiles(dir);
      const assets: Record<string, string> = {};
      for (const file of files) {
        if (file === 'build-info.json') continue;
        assets[file] = createHash('sha256').update(readFileSync(join(dir, file))).digest('hex');
      }
      writeFileSync(
        join(dir, 'build-info.json'),
        `${JSON.stringify(
          { schema: 1, sha: identity.sha, shortSha: short, ref: identity.ref, builtAt: new Date().toISOString(), assets },
          null,
          2,
        )}\n`,
      );
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [preact(), serviceWorker(), buildInfo()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
});
