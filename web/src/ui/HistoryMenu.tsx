// SPDX-License-Identifier: GPL-3.0-only
// History affordance (F-24): the last N actions across canvas and code, with
// surface badges and undo/redo routed to the surface that owns the action.
import type { ComponentChildren } from 'preact';
import type { HistoryEntry } from './historyFeed';
import { CloseIcon } from './icons';
import { s } from './strings';

export interface HistoryMenuProps {
  entries: HistoryEntry[];
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

export function HistoryMenu(props: HistoryMenuProps): ComponentChildren {
  return (
    <div class="history-menu" data-testid="history-menu" role="dialog" aria-label={s("History")}>
      <div class="history-head">
        <span class="panel-title">{s("History")}</span>
        <button
          type="button"
          class="icon-btn"
          data-testid="history-close"
          aria-label={s("Close history")}
          onClick={props.onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div class="history-actions">
        <button
          type="button"
          class="ghost-btn"
          data-testid="history-undo"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          {s("Undo")}{' '}</button>
        <button
          type="button"
          class="ghost-btn"
          data-testid="history-redo"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          {s("Redo")}{' '}</button>
      </div>
      {props.entries.length === 0 ? (
        <p class="history-empty" data-testid="history-empty">
          {s("Nothing yet — move something on the canvas or edit the code.")}{' '}</p>
      ) : (
        <ol class="history-list" data-testid="history-list">
          {props.entries.map((e) => (
            <li key={e.seq} class="history-row" data-surface={e.surface}>
              <span class="history-badge" aria-hidden="true">
                {e.surface === 'canvas' ? '◇' : '</>'}
              </span>
              <span class="history-label">{e.label}</span>
              <span class="sr-only">{e.surface === 'canvas' ? s('canvas') : s('code')} {s("action")}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
