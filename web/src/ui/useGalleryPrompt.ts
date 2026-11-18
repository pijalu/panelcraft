// SPDX-License-Identifier: GPL-3.0-only
// Template gallery prompt: the gallery is a question asked once per file.
//
// An empty canvas alone cannot answer it. A brand-new file already holds the
// canvas projection of a blank document (`pcd 1.0`), so "the file stores text"
// and "the user authored something" are different facts — and the second is the
// one the question depends on. This hook owns that fact for the session: the
// file key whose gallery the user answered, kept until the app is reloaded.
import { useState } from 'preact/hooks';
import { galleryVisible } from './EmptyState';

export interface GalleryPrompt {
  /** Whether the gallery should cover the canvas for `key` right now. */
  visible(key: string | null, objectCount: number, codeText: string): boolean;
  /** The user chose a starting point: never ask about `key` again this session. */
  answer(key: string | null): void;
}

export function useGalleryPrompt(): GalleryPrompt {
  const [answered, setAnswered] = useState<readonly string[]>([]);
  const keyOf = (key: string | null): string => key ?? '';
  return {
    visible: (key, objectCount, codeText) =>
      !answered.includes(keyOf(key)) && galleryVisible(objectCount, codeText),
    answer: (key) =>
      setAnswered((current) => (current.includes(keyOf(key)) ? current : [...current, keyOf(key)])),
  };
}
