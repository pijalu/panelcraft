// SPDX-License-Identifier: GPL-3.0-only
// M3-WP4 download adapter (FR-W4): push a Blob/text to the browser as a file
// download via an object-URL anchor. Isolated for test seams.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Text convenience wrapper (utf-8). */
export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Read a File as text (import path). */
export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

/** Read a File as bytes (zip import path). */
export function readFileAsBytes(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf));
}
