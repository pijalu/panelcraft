// SPDX-License-Identifier: GPL-3.0-only
// Canvas hover info card (F-25): name + technology/description/tags.
import type { ComponentChildren } from 'preact';
import { hoverDetail, type HoverInfo } from './hoverInfo';

export function HoverCard(props: { info: HoverInfo | null }): ComponentChildren {
  if (props.info === null) return null;
  const detail = hoverDetail(props.info);
  return (
    <div class="hover-card" data-testid="hover-card" role="tooltip">
      <span class="hover-name">{props.info.name}</span>
      <span class="hover-kind">{props.info.kind.replace('_', ' ')}</span>
      {detail !== null && <span class="hover-detail">{detail}</span>}
    </div>
  );
}
