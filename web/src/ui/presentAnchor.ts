// SPDX-License-Identifier: GPL-3.0-only
// Dedicated presentation URL anchor. The whole URL policy lives here: a pure
// codec, a narrow History/location port, and one explicit transition table.
// The hash only ever carries an authored flow id — it is never document input,
// and FlowRunner knows nothing about URLs. A link addresses a flow inside the
// reader's own restored active file; another browser's local workspace cannot
// be shared by a link.
import { isPresenting } from './present';

const PARAM = '#present=';
const MAX_ID = 256;
/** Characters encodeURIComponent leaves alone, plus its % escapes. Raw '=',
 *  '&', '#', spaces and other fragment syntax mean the value was not produced
 *  by our encoder, so it is malformed. */
const RAW_ID = /^[A-Za-z0-9\-_.!~*'()%]+$/;
const PRESENT_ANCHOR = /^#present(?:=|$)/;

export type PresentStatus = 'idle' | 'playing' | 'paused' | 'ended';

function hasControl(chars: string): boolean {
  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Flow ids are short PDL identifiers. Keep the cap so a hostile fragment can
 *  never become an unbounded string in the shell. */
function validId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_ID && !hasControl(id) && id.trim() !== '';
}

/** Hash text for an authored flow id, or '' when the id is unusable. */
export function presentHash(flowId: string): string {
  return validId(flowId) ? `${PARAM}${encodeURIComponent(flowId)}` : '';
}

/** The authored flow id in a hash, or null when absent/malformed/foreign. */
export function readPresentId(hash: string): string | null {
  if (!hash.startsWith(PARAM)) return null;
  const raw = hash.slice(PARAM.length);
  if (raw === '' || !RAW_ID.test(raw)) return null;
  try {
    const id = decodeURIComponent(raw);
    return validId(id) ? id : null;
  } catch {
    return null; // bad percent escape
  }
}

/** True for a hash that claims the present anchor (even when malformed). */
export function isPresentAnchor(hash: string): boolean {
  return PRESENT_ANCHOR.test(hash);
}

/** The only browser surface the shell needs. Writes are silent, as
 *  pushState/replaceState are in a real browser; only user navigation notifies. */
export interface PresentHistoryPort {
  current(): string;
  push(hash: string): void;
  replace(hash: string): void;
  subscribe(listener: (hash: string) => void): () => void;
}

/** Real History/location adapter. Back and Forward fire hashchange and
 *  popstate for a fragment navigation; the duplicate notification is dropped
 *  here so the transition table sees one event per navigation. */
export function browserPresentHistory(win: Window): PresentHistoryPort {
  let notified = win.location.hash;
  let listeners: Array<(hash: string) => void> = [];
  const write = (op: 'push' | 'replace', hash: string): void => {
    const url = `${win.location.pathname}${win.location.search}${hash}`;
    if (op === 'push') win.history.pushState(null, '', url);
    else win.history.replaceState(null, '', url);
    notified = hash;
  };
  const notify = (): void => {
    const hash = win.location.hash;
    if (hash === notified) return;
    notified = hash;
    for (const listener of listeners) listener(hash);
  };
  return {
    current: () => win.location.hash,
    push: (hash) => write('push', hash),
    replace: (hash) => write('replace', hash),
    subscribe(listener) {
      listeners = [...listeners, listener];
      win.addEventListener('hashchange', notify);
      win.addEventListener('popstate', notify);
      return () => {
        listeners = listeners.filter((x) => x !== listener);
        win.removeEventListener('hashchange', notify);
        win.removeEventListener('popstate', notify);
      };
    },
  };
}

/** State of the shell's anchor coordination. `runningId` prevents a hash echo
 *  from restarting the flow; `anchor` records whether we own the fragment. */
export interface AnchorState {
  ready: boolean;
  activePath: string | null;
  status: PresentStatus;
  runningId: string | null;
  anchor: boolean;
}

export const INITIAL_ANCHOR: AnchorState = {
  ready: false,
  activePath: null,
  status: 'idle',
  runningId: null,
  anchor: false,
};

export type AnchorEvent =
  | { type: 'ready'; hash: string; path: string | null }
  | { type: 'hash'; hash: string }
  | { type: 'present'; flowId: string | null }
  | { type: 'status'; status: PresentStatus }
  | { type: 'file'; path: string | null; hash: string };

export interface AnchorEffects {
  /** Resolve this authored id in the active file, then start playback. */
  start?: string;
  /** Leave presentation (the runner owns the actual stop). */
  exit?: boolean;
  write?: { op: 'push' | 'replace'; hash: string };
}

export interface Transition {
  state: AnchorState;
  effects: AnchorEffects;
}

const none = (state: AnchorState): Transition => ({ state, effects: {} });

/** Adopt a valid anchor: playback is starting from the current URL, so there
 *  is deliberately no history write (a fresh load/reload adds no entry). The
 *  player publishes its status on the next tick, so mark it playing now: an
 *  immediate Back must still be recognised as leaving a presentation. */
function adopt(state: AnchorState, id: string): Transition {
  return {
    state: { ...state, runningId: id, anchor: true, status: 'playing' },
    effects: { start: id },
  };
}

/** Drop our fragment with replace, so Back never lands on a stale anchor. */
function clear(state: AnchorState, exit = false): Transition {
  return {
    state: { ...state, runningId: null, anchor: false, ...(exit ? { status: 'idle' } : {}) },
    effects: { ...(exit ? { exit: true } : {}), write: { op: 'replace', hash: '' } },
  };
}

/** One hash value, interpreted as a navigation into or out of presentation. */
function onHash(state: AnchorState, hash: string, authored: (id: string) => boolean): Transition {
  if (!state.ready) return none(state); // ready will read the current hash later
  const id = readPresentId(hash);
  if (id !== null && authored(id)) {
    if (state.runningId === id && isPresenting(state.status)) return none(state);
    return adopt(state, id);
  }
  if (id === null && !isPresentAnchor(hash) && isPresenting(state.status)) {
    return {
      state: { ...state, runningId: null, anchor: false, status: 'idle' },
      effects: { exit: true },
    };
  }
  if (id === null && !isPresentAnchor(hash)) return none(state); // a foreign anchor is not ours
  if (isPresenting(state.status)) return clear(state, true);
  return clear(state);
}

function onStatus(state: AnchorState, status: PresentStatus): Transition {
  if (status === state.status) return none(state);
  const next: AnchorState = {
    ...state,
    status,
    ...(status === 'idle' ? { runningId: null } : {}),
  };
  if ((status === 'ended' || status === 'idle') && state.anchor) {
    return {
      state: { ...next, anchor: false },
      effects: { write: { op: 'replace', hash: '' } },
    };
  }
  return none(next);
}

function onFile(state: AnchorState, path: string | null, hash: string): Transition {
  if (path === state.activePath) return none(state);
  const next: AnchorState = { ...state, activePath: path };
  // A cross-file `goto` changes the active file *while playing*; that is part
  // of this presentation, so its anchor stays. Any other switch is external.
  if (isPresenting(state.status)) return none(next);
  if (isPresentAnchor(hash)) return clear({ ...next });
  return { state: { ...next, runningId: null }, effects: {} };
}

/** The single transition table. `authored` answers whether an id names a flow
 *  with an authored id in the active file — derived/title-only flows are not
 *  addressable links. Pure: callers apply the effects through their ports. */
export function anchorTransition(
  state: AnchorState,
  event: AnchorEvent,
  authored: (id: string) => boolean,
): Transition {
  switch (event.type) {
    case 'ready': {
      if (state.ready) return none(state);
      const next: AnchorState = { ...state, ready: true, activePath: event.path };
      return onHash(next, event.hash, authored);
    }
    case 'hash':
      return onHash(state, event.hash, authored);
    case 'present': {
      if (event.flowId === null || presentHash(event.flowId) === '') {
        return { state: { ...state, runningId: null }, effects: {} };
      }
      return {
        state: { ...state, runningId: event.flowId, anchor: true, status: 'playing' },
        effects: { write: { op: 'push', hash: presentHash(event.flowId) } },
      };
    }
    case 'status':
      return onStatus(state, event.status);
    case 'file':
      return onFile(state, event.path, event.hash);
  }
}
