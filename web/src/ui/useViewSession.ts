// SPDX-License-Identifier: GPL-3.0-only
// Per-file view session state (F-14 refs + F-15 rename commit port).
// Extracted so `App` stays inside the function-length gate.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Doc } from '../engine/model/types';

export interface ViewSession {
  viewName: string | undefined;
  setViewName: (name: string | undefined) => void;
  /** Ref mirror for the apply port (loads stored view positions, FR-V4). */
  viewNameRef: { current: string | undefined };
  /** Port the canvas uses to persist geometry out-of-band (F-14). */
  commitDocRef: { current: ((doc: Doc) => void) | null };
}

export function useViewSession(activePath: string | null): ViewSession {
  const viewNameRef = useRef<string | undefined>(undefined);
  const commitDocRef = useRef<((doc: Doc) => void) | null>(null);
  const [viewName, setViewName] = useState<string | undefined>(undefined);
  // Views are per-file session state: switching files resets to Default.
  useEffect(() => setViewName(undefined), [activePath]);
  useEffect(() => {
    viewNameRef.current = viewName;
  }, [viewName]);
  return { viewName, setViewName, viewNameRef, commitDocRef };
}
