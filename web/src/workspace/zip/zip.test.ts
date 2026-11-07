// SPDX-License-Identifier: GPL-3.0-only
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  packZip, unpackZip, hasNativeZip,
  nativeCodec, fflateCodec, type ZipEntry,
} from './zip';
import { crc32 } from './crc32';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function entries(...defs: Array<[string, string | null]>): ZipEntry[] {
  return defs.map(([name, data]) => ({ name, data: data === null ? null : enc(data) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('crc32', () => {
  it('matches known IEEE CRC-32 vectors', () => {
    expect(crc32(enc(''))).toBe(0);
    expect(crc32(enc('123456789'))).toBe(0xcbf43926); // canonical check value
    expect(crc32(enc('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('ZIP round-trip (native path)', () => {
  it('round-trips nested dirs, unicode names, empty dirs and files', async () => {
    const zip = await packZip(entries(
      ['docs/', null],
      ['docs/guide/über.pcd', 'sys "a"'],
      ['empty/', null],
      ['empty/.keep', ''],
      ['root.pcd', 'x'.repeat(200)], // compressible
    ));
    const out = await unpackZip(zip);
    const byName = new Map(out.map((e) => [e.name, e.data]));
    expect(byName.get('docs/guide/über.pcd')).toBeDefined();
    expect(dec(byName.get('docs/guide/über.pcd')!)).toBe('sys "a"');
    expect(byName.get('root.pcd')).toHaveLength(200);
    expect(byName.has('docs/')).toBe(true);
    expect(byName.has('empty/')).toBe(true);
    expect(byName.get('empty/.keep')).toHaveLength(0);
    expect(out.filter((e) => e.data === null).map((e) => e.name).sort())
      .toEqual(['docs/', 'empty/']);
  });

  it('deflate actually compresses (method 8, smaller archive)', async () => {
    const zip = await packZip(entries(['big.txt', 'ab'.repeat(2000)]));
    // 4000 B payload + headers must compress far below the raw size.
    expect(zip.length).toBeLessThan(1500);
  });

  it('unzipSync-produced archives (fflate) unpack via the native reader', async () => {
    const fflate = await import('fflate');
    const zip = fflate.zipSync({
      'a/b.pcd': enc('content-a'),
      'dir/': new Uint8Array(0),
      'dir/nested.pcd': enc('content-b'),
    });
    const out = await unpackZip(zip);
    const byName = new Map(out.map((e) => [e.name, e.data]));
    expect(dec(byName.get('a/b.pcd')!)).toBe('content-a');
    expect(byName.has('dir/')).toBe(true);
    expect(dec(byName.get('dir/nested.pcd')!)).toBe('content-b');
  });

  it('native reader reads archives the native writer wrote via codec seam', async () => {
    const zip = await nativeCodec.pack(entries(['x/y.pcd', 'v']), new Date(2025, 0, 1));
    expect(dec((await nativeCodec.unpack(zip)).find((e) => e.name === 'x/y.pcd')!.data!))
      .toBe('v');
  });
});

describe('ZIP failure paths', () => {
  it('detects CRC corruption', async () => {
    const zip = await packZip(entries(['a.pcd', 'precious content']));
    const corrupt = Uint8Array.from(zip);
    const idx = 30 + 'a.pcd'.length; // first file's data start (fixed 30-byte LFH)
    corrupt[idx] = (corrupt[idx] ?? 0) ^ 0xff;
    await expect(unpackZip(corrupt)).rejects.toMatchObject({ name: 'ZipError', code: 'crc-mismatch' });
  });

  it('rejects garbage input', async () => {
    await expect(unpackZip(enc('not a zip at all'))).rejects.toMatchObject({ name: 'ZipError' });
    await expect(unpackZip(enc(''))).rejects.toMatchObject({ code: 'bad-zip' });
  });

  it('rejects traversal names on unpack (zip-slip)', async () => {
    // Hand-craft an archive whose entry name contains ".." — build with fflate
    // (which does not validate) to bypass the writer's own guard.
    const fflate = await import('fflate');
    const evil = fflate.zipSync({ '../evil.pcd': enc('bad') });
    await expect(unpackZip(evil)).rejects.toMatchObject({ name: 'ZipError', code: 'unsafe-name' });
  });

  it('rejects unsafe names at pack time too', async () => {
    await expect(packZip(entries(['../up.pcd', 'x']))).rejects.toMatchObject({ code: 'unsafe-name' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { name: 'a\\b.pcd', data: enc('x') } as any;
    await expect(packZip([bad])).rejects.toMatchObject({ code: 'unsafe-name' });
  });
});

describe('fflate fallback (feature detect)', () => {
  it('hasNativeZip() is true in this environment', () => {
    expect(hasNativeZip()).toBe(true);
  });

  it('packs/unpacks via fflate when streams are absent', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    expect(hasNativeZip()).toBe(false);
    const zip = await packZip(entries(
      ['svc/', null],
      ['svc/main.pcd', 'sys "m"'],
    ));
    expect(zip.length).toBeGreaterThan(0);
    const out = await unpackZip(zip);
    const byName = new Map(out.map((e) => [e.name, e.data]));
    expect(byName.has('svc/')).toBe(true);
    expect(dec(byName.get('svc/main.pcd')!)).toBe('sys "m"');
  });

  it('fflate codec seam is symmetric', async () => {
    const zip = await fflateCodec.pack(entries(['f/ünïcode.pcd', 'ü']) );
    const out = await fflateCodec.unpack(zip);
    expect(out[0]?.name).toBe('f/ünïcode.pcd');
    expect(dec(out[0]!.data!)).toBe('ü');
  });
});
