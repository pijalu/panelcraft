// SPDX-License-Identifier: GPL-3.0-only
// Shell panel slots (F-10): sidebar / palette / properties either render their
// panel or the rail that replaces it when collapsed. Extracted from App so the
// shell stays readable and every slot is independently testable.
import type { ComponentChildren } from 'preact';
import { PanelRail } from './PanelChrome';
import { Palette } from './Palette';
import { PropertiesPanel, type HierarchyProps } from './PropertiesPanel';
import { DepsPanel } from './deps/DepsPanel';
import { FlowPanel, type FlowPanelProps } from './flows/FlowPanel';
import { propTarget } from './flows/flowTargets';
import { PALETTE_ORDER, type CanvasController, type DiagramLink, type DiagramObject } from './CanvasController';
import type { IconDecl, Kind } from '../engine/model/types';
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
  activeId: string | null;
  ctrl: CanvasController | null;
  /** F-11 section expand state + toggler (persisted with the layout). */
  sections: Record<string, boolean>;
  onToggleSection: (section: string) => void;
  /** IR v9: icons declared in the open file + the manager trigger. */
  projectIcons?: IconDecl[];
  onManageIcons?: () => void;
  /** IR v10: decomposition + embedded source of the selected element. */
  hierarchy?: HierarchyProps;
  /**
   * Step or flow properties. They replace the object/link fields while a flow is
   * being edited; a canvas selection still wins, so the panel has one owner.
   */
  flow?: FlowPanelProps | null;
}

/** Properties + dependencies column (or its rail). */
export function PropsSlot(props: PropsSlotProps) {
  return slot(
    props.ui.layout.panels.props === 'collapsed',
    'props',
    'properties',
    () => props.ui.togglePanel('props'),
    <>
      <PropertiesTarget {...props} />
      <DepsPanel
        text={props.depsText}
        filePath={props.activePath}
        activeId={props.activeId}
        ctrl={props.ctrl}
        onPick={(id) => props.ctrl?.reveal(id)}
      />
    </>,
  );
}

/**
 * One owner for the column: the canvas selection wins while it is non-empty,
 * then a selected flow or step, then the empty state.
 */
function PropertiesTarget(props: PropsSlotProps) {
  const target = propTarget({
    object: props.obj,
    link: props.link,
    doc: props.flow?.doc ?? null,
    selection: props.flow?.selection ?? null,
  });
  if (target.kind === 'flow' && props.flow !== null && props.flow !== undefined) {
    return <FlowPanel {...props.flow} />;
  }
  return (
    <PropertiesPanel
      obj={target.kind === 'object' ? target.object : null}
      link={target.kind === 'link' ? target.link : null}
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
      projectIcons={props.projectIcons}
      onManageIcons={props.onManageIcons}
      hierarchy={props.hierarchy}
    />
  );
}
