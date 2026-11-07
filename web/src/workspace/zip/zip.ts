// SPDX-License-Identifier: GPL-3.0-only
// M3-WP3: owned ZIP container over CompressionStream/DecompressionStream
// (SPEC N9, ADR-0004). The headers/central directory are written and parsed by
// this module; deflate-raw/inflate-raw come from the platform streams. When
// the streams are unavailable (Safari < 16.4) the whole pack/unpack delegates
// to fflate, lazily imported behind the feature detect.
import { crc32 } from './crc32';
import { splitPath, FsError } from '../fs';

export interface ZipEntry {
  /** '/'-separated archive path; directories carry a trailing '/'. */
  name: string;
  /** File bytes, or null for directory entries. */
  data: Uint8Array | null;
}

export type ZipErrorCode = 'bad-zip' | 'crc-mismatch' | 'unsupported-method' | 'unsafe-name';

export class ZipError extends Error {
  constructor(
    readonly code: ZipErrorCode,
    /** Archive entry the error refers to (when known). */
    readonly entryName?: string,
    message?: string,
  ) {
    super(message ?? `zip: ${code}${entryName ? ` (${entryName})` : ''}`);
    this.name = 'ZipError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Feature detect: platform streams with the deflate-raw format present. */
export function hasNativeZip(): boolean {
  try {
    if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') return false;
    new CompressionStream('deflate-raw'); // format probe — throws when unsupported
    new DecompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let len = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    len += value.length;
  }
  const out = new Uint8Array(len);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

/** Drive a platform transform stream (Compression/DecompressionStream). */
async function pumpStream(
  xform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  data: Uint8Array,
): Promise<Uint8Array> {
  const writer = xform.writable.getWriter();
  await writer.write(data.slice());
  await writer.close();
  return streamToBytes(xform.readable);
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pumpStream(new CompressionStream('deflate-raw'), data);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return pumpStream(new DecompressionStream('deflate-raw'), data);
}

const EMPTY = new Uint8Array(0);

function dosDateTime(now: Date): { time: number; date: number } {
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
}

/** Normalize + validate an archive name; directory flag from trailing '/'. */
function safeName(name: string): string {
  let trimmed = name;
  const isDir = trimmed.endsWith('/');
  if (isDir) trimmed = trimmed.slice(0, -1);
  let clean: string;
  try {
    clean = splitPath(trimmed).join('/'); // throws on traversal / invalid names
  } catch (err) {
    throw new ZipError('unsafe-name', name, err instanceof FsError ? err.message : undefined);
  }
  if (!isDir && clean === '') throw new ZipError('unsafe-name', name, 'empty archive name');
  return isDir ? `${clean}/` : clean;
}

/** Pack entries into a ZIP (native deflate-raw path). */
async function packNative(entries: ZipEntry[], now: Date): Promise<Uint8Array> {
  const { time, date } = dosDateTime(now);
  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = safeName(entry.name);
    const nameBytes = encoder.encode(name);
    const isDir = entry.data === null;
    const raw = isDir ? EMPTY : (entry.data ?? EMPTY);
    const crc = isDir ? 0 : crc32(raw);
    let method = 0;
    let stored = raw;
    if (!isDir && raw.length > 0) {
      const deflated = await deflateRaw(raw);
      if (deflated.length < raw.length) {
        method = 8;
        stored = deflated;
      }
    }
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    lfh.set(nameBytes, 30);
    body.push(lfh, stored);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, isDir ? 0x10 : 0, true); // external attrs (DOS dir bit)
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += lfh.length + stored.length;
  }
  const cdStart = offset;
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);
  return concat([...body, ...central, eocd]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

function findEocd(bytes: Uint8Array): number {
  // EOCD is ≥22 bytes; scan backwards over a possible archive comment.
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  throw new ZipError('bad-zip', undefined, 'end-of-central-directory not found');
}

async function unpackNative(bytes: Uint8Array): Promise<ZipEntry[]> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  const count = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) {
      throw new ZipError('bad-zip', undefined, 'central directory entry signature mismatch');
    }
    const method = dv.getUint16(pos + 10, true);
    const crc = dv.getUint32(pos + 16, true);
    const csize = dv.getUint32(pos + 20, true);
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    const lfhOffset = dv.getUint32(pos + 42, true);
    const rawName = bytes.subarray(pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    if (dv.getUint32(lfhOffset, true) !== 0x04034b50) {
      throw new ZipError('bad-zip', undefined, 'local header signature mismatch');
    }
    const lfhNameLen = dv.getUint16(lfhOffset + 26, true);
    const lfhExtraLen = dv.getUint16(lfhOffset + 28, true);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const stored = bytes.subarray(dataStart, dataStart + csize);
    let data = stored;
    if (method === 8) data = await inflateRaw(stored);
    else if (method !== 0) throw new ZipError('unsupported-method', undefined, `method ${method}`);
    const actual = crc32(data);
    if (actual !== crc) {
      throw new ZipError('crc-mismatch', decoder.decode(rawName), `crc ${actual} ≠ ${crc}`);
    }
    out.push({ name: safeName(decoder.decode(rawName)), data: rawName[rawName.length - 1] === 0x2f ? null : data });
  }
  return out;
}

/* fflate fallback — lazily imported only when streams are absent. */
type Fflate = typeof import('fflate');
let fflatePromise: Promise<Fflate> | null = null;
function loadFflate(): Promise<Fflate> {
  fflatePromise ??= import('fflate');
  return fflatePromise;
}

async function packFflate(entries: ZipEntry[]): Promise<Uint8Array> {
  const { zipSync } = await loadFflate();
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = e.data ?? EMPTY;
  return zipSync(files);
}

async function unpackFflate(bytes: Uint8Array): Promise<ZipEntry[]> {
  const { unzipSync } = await loadFflate();
  const files = unzipSync(bytes);
  return Object.entries(files).map(([name, data]) => ({
    name,
    data: name.endsWith('/') ? null : data,
  }));
}

export async function packZip(entries: ZipEntry[]): Promise<Uint8Array> {
  return hasNativeZip() ? packNative(entries, new Date()) : packFflate(entries);
}

export async function unpackZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  return hasNativeZip() ? unpackNative(bytes) : unpackFflate(bytes);
}

/** Test seam: run pack/unpack with an explicit codec. */
export const nativeCodec = { pack: packNative, unpack: unpackNative };
export const fflateCodec = { pack: packFflate, unpack: unpackFflate };
