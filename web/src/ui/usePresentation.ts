// SPDX-License-Identifier: GPL-3.0-only
// Presentation mode state (F-16): presentation is explicit (a Present button),
// stays active only while a flow is playing, and ends with the flow.
import { useLayoutEffect, useState } from 'preact/hooks';
import type { FlowPlayerApi } from './flows/useFlowPlayer';
import { isPresenting } from './present';
import { usePresentKeys } from './usePresentKeys';

export interface PresentationHandle {
  /** True while the presentation shell should replace the editor chrome. */
  presenting: boolean;
  /** Enter presentation mode (the dock takes over). */
  start(): void;
}

export function usePresentation(player: FlowPlayerApi): PresentationHandle {
  const [present, setPresent] = useState(false);
  const presenting = present && isPresenting(player.state.status);
  usePresentKeys(player, presenting);
  // Clear the shell flag with the status render, not in a deferred effect:
  // rapid history navigation may already have started the next presentation.
  useLayoutEffect(() => {
    if (!isPresenting(player.state.status)) setPresent(false);
  }, [player.state.status]);
  return { presenting, start: () => setPresent(true) };
}
