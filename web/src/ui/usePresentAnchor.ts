// SPDX-License-Identifier: GPL-3.0-only
// Shell-side coordination for the presentation anchor. All URL policy lives in
// presentAnchor.ts; this hook only supplies facts (workspace readiness, active
// file, player status) and applies effects through the narrow history port and
// the player API. FlowRunner remains URL-agnostic.
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import {
  anchorTransition,
  browserPresentHistory,
  INITIAL_ANCHOR,
  type AnchorEvent,
  type PresentHistoryPort,
} from './presentAnchor';
import { parsePDL } from '../engine/format/parser';
import type { FlowPlayerApi } from './flows/useFlowPlayer';

export interface PresentAnchorDeps {
  ready: boolean;
  activePath: string | null;
  textOf(path: string): string | null;
  player: FlowPlayerApi;
  /** Start a flow in the active file and enter presentation mode. */
  startFlow(flowId: string): void;
  /** Injectable for tests; defaults to the real History/location port. */
  history?: PresentHistoryPort;
}

export interface PresentAnchorHandle {
  /** Explicit Present: add a history entry for an authored flow id. */
  present(flowId: string | null): void;
}

/** Only an authored id is a stable address. Titles and the derived default
 *  flow are intentionally not linkable. */
export function authoredFlowId(text: string | null, id: string): boolean {
  if (text === null) return false;
  try {
    const { doc } = parsePDL(text);
    return doc !== null && doc.flows.some((flow) => flow.id === id);
  } catch {
    return false;
  }
}

export function usePresentAnchor(deps: PresentAnchorDeps): PresentAnchorHandle {
  const history = useMemo(() => deps.history ?? browserPresentHistory(window), [deps.history]);
  const latest = useRef(deps);
  latest.current = deps;
  const state = useRef(INITIAL_ANCHOR);
  const readySent = useRef(false);

  const dispatch = useCallback(
    (event: AnchorEvent): void => {
      const d = latest.current;
      const authored = (id: string): boolean =>
        d.activePath === null ? false : authoredFlowId(d.textOf(d.activePath), id);
      const next = anchorTransition(state.current, event, authored);
      state.current = next.state;
      if (next.effects.start !== undefined) d.startFlow(next.effects.start);
      if (next.effects.exit === true) d.player.exit();
      if (next.effects.write !== undefined) {
        const { op, hash } = next.effects.write;
        if (op === 'push') history.push(hash);
        else history.replace(hash);
      }
    },
    [history],
  );

  // Direct load / reload: wait for storage and the document, then read the URL.
  useEffect(() => {
    if (!deps.ready || readySent.current) return;
    readySent.current = true;
    dispatch({ type: 'ready', hash: history.current(), path: deps.activePath });
  }, [deps.ready, deps.activePath, dispatch, history]);

  useEffect(() => {
    dispatch({ type: 'status', status: deps.player.state.status });
  }, [deps.player.state.status, dispatch]);

  useEffect(() => {
    dispatch({ type: 'file', path: deps.activePath, hash: history.current() });
  }, [deps.activePath, dispatch, history]);

  useEffect(() => history.subscribe((hash) => dispatch({ type: 'hash', hash })), [history, dispatch]);

  return { present: (flowId) => dispatch({ type: 'present', flowId }) };
}
