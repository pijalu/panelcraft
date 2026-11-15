// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP08: the shell half of an “inspect this” gesture. The canvas only says
// what was asked for (it must not import Preact or the layout store); this hook
// selects the entity, makes the Properties panel truly visible and focuses its
// first useful field. Double-click, Enter and the context menu all land here.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CanvasController, PropertiesRequest } from './CanvasController';
import type { PanelId } from './uiLayout';

export interface PropertiesRequestHandle {
  /** Handle one request: select the entity, open the panel, queue the focus. */
  request: (request: PropertiesRequest) => void;
  /** Ref for the link Label field the request focuses. */
  linkLabelRef: { current: HTMLInputElement | null };
}

export interface PropertiesRequestOptions {
  ctrlRef: { current: CanvasController | null };
  openPanel: (panel: PanelId) => void;
  nameFieldRef: { current: HTMLInputElement | null };
  /** Selection identity: when it changes the panel has rendered, so focus can land. */
  selectionKey: string;
}

export function usePropertiesRequest(opts: PropertiesRequestOptions): PropertiesRequestHandle {
  const linkLabelRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<PropertiesRequest | null>(null);

  const request = (req: PropertiesRequest): void => {
    const ctrl = opts.ctrlRef.current;
    if (!ctrl) return;
    ctrl.setSelection(req.kind === 'object' ? [req.id] : [], req.kind === 'link' ? [req.id] : []);
    // A closed or collapsed panel must come back before it can take focus.
    opts.openPanel('props');
    setPending(req);
  };

  const { nameFieldRef, selectionKey } = opts;
  useEffect(() => {
    if (pending === null) return;
    const field = pending.kind === 'link' ? linkLabelRef.current : nameFieldRef.current;
    if (!field) return; // panel still rendering: this runs again when it lands
    field.focus(); // focus only — selecting would drop the existing value
    setPending(null);
  }, [pending, nameFieldRef, selectionKey]);

  return { request, linkLabelRef };
}
