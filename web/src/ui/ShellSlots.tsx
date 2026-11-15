// SPDX-License-Identifier: GPL-3.0-only
// Shell panel slots (F-10): sidebar / palette / properties either render their
// panel or the rail that replaces it when collapsed. Extracted from App so the
// shell stays readable and every slot is independently testable.
import type { ComponentChildren } from 'preact';
import { PanelRail } from './PanelChrome';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { DepsPanel } from './deps/DepsPanel';
import { PALETTE_ORDER, type CanvasController, type DiagramLink, type DiagramObject } from './CanvasController';
import type { Kind } from '../engine/model/types';
import type { UiLayoutHandle } from './useUiLayout';
import type { ImportError } from '../engine/model/imports';
import { s, type StringKey } from './strings';

/** Collapsed-rail or panel, chosen from the layout. */
export function slot(
  collapsed: boolean,
  id: 'sidebar' | 'flows' | 'palette' | 'props',
  label: StringKey,
  onExpand: () => void,
  content: ComponentChildren,
): ComponentChildren {
  return collapsed ? (
    <PanelRail id={id} labelKey={label} onExpand={onExpand} />
  ) : (
    content
  );
}

/** F-20: import problems (missing file, cycle, escape) surfaced in the shell. */
export function ImportBanner(props: { errors: ImportError[] }): ComponentChildren {
  if (props.errors.length === 0) return null;
  return (
    <p class="import-banner" data-testid="import-errors" role="status">
      {props.errors.length} {s('import problem')}{props.errors.length === 1 ? '' : s('s')}{s(":")}{' '}
      {props.errors.map((e) => e.message).join(' · ')}
    </p>
  );
}

export interface PaletteSlotProps {
  ui: UiLayoutHandle;
  onPlace: (kind: Kind) => void;
  onDragDrop: (kind: Kind, e: PointerEvent) => void;
}

/** Shape palette (or its rail). */
export function PaletteSlot({ ui, onPlace, onDragDrop }: PaletteSlotProps) {
  return slot(
    ui.layout.panels.palette === 'collapsed',
    'palette',
    'shapes',
    () => ui.togglePanel('palette'),
    <Palette
      kinds={PALETTE_ORDER}
      onPlace={onPlace}
      onDragDrop={onDragDrop}
      onCollapse={() => ui.togglePanel('palette')}
    />,
  );
}

export interface PropsSlotProps {
  ui: UiLayoutHandle;
  obj: DiagramObject | null;
  link: DiagramLink | null;
  nameFieldRef: { current: HTMLInputElement | null };
  /** UX08-WP08: link Label field for the “inspect this link” focus. */
  linkLabelRef: { current: HTMLInputElement | null };
  onChangeObject: CanvasController['updateObject'];
  onChangeLink: CanvasController['updateLink'];
  /** UX08-WP09: Start/End perimeter anchors and the route reset commands. */
  onChangeAnchor: CanvasController['setLinkAnchor'];
  onResetRoute: (id: string) => void;
  onResetBends: (id: string) => void;
  onFit: () => void;
  depsText: string | null;
  activePath: string | null;
  viewName: string | undefined;
  activeId: string | null;
  ctrl: CanvasController | null;
  /** F-11 section expand state + toggler (persisted with the layout). */
  sections: Record<string, boolean>;
  onToggleSection: (section: string) => void;
}

/** Properties + dependencies column (or its rail). */
export function PropsSlot(props: PropsSlotProps) {
  return slot(
    props.ui.layout.panels.props === 'collapsed',
    'props',
    'properties',
    () => props.ui.togglePanel('props'),
    <>
      <PropertiesPanel
        obj={props.obj}
        link={props.link}
        nameFieldRef={props.nameFieldRef}
        linkLabelRef={props.linkLabelRef}
        onChangeObject={props.onChangeObject}
        onChangeLink={props.onChangeLink}
        onChangeAnchor={props.onChangeAnchor}
        onResetRoute={props.onResetRoute}
        onResetBends={props.onResetBends}
        onFit={props.onFit}
        onCollapse={() => props.ui.togglePanel('props')}
        sections={props.sections}
        onToggleSection={props.onToggleSection}
      />
      <DepsPanel
        text={props.depsText}
        filePath={props.activePath}
        viewName={props.viewName}
        activeId={props.activeId}
        ctrl={props.ctrl}
        onPick={(id) => props.ctrl?.reveal(id)}
      />
    </>,
  );
}
