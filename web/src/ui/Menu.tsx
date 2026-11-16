// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: one owned menu/popover primitive used by the application menu and
// the panel action menus. Keyboard contract: trigger `aria-haspopup="menu"`,
// roving `menuitem` focus with arrows/Home/End, ArrowRight/Left for submenus,
// Escape and outside pointer dismiss, Tab closes, focus returns to the trigger.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  availableMenuHeight,
  clampMenuPosition,
  edgeIndex,
  isInside,
  MENU_MARGIN,
  needsScroll,
  placeMenu,
  placeSubmenu,
  rovingIndex,
} from './menuModel';
import { CheckIcon, SubmenuIcon } from './icons';

export interface MenuActionEntry {
  kind: 'item';
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** `menuitemradio` shows the active choice (theme, private mode). */
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
  checked?: boolean;
  testId?: string;
}

export interface MenuSubmenuEntry {
  kind: 'submenu';
  id: string;
  label: string;
  items: MenuEntry[];
  disabled?: boolean;
  testId?: string;
}

export interface MenuSeparatorEntry {
  kind: 'separator';
  id: string;
}

export type MenuEntry = MenuActionEntry | MenuSubmenuEntry | MenuSeparatorEntry;

export interface MenuProps {
  id: string;
  /** Accessible name; also the visible trigger label unless `trigger` is set. */
  label: string;
  items: MenuEntry[];
  testId: string;
  class?: string;
  /** Optional custom trigger content (icons). */
  trigger?: ComponentChildren;
  onOpenChange?: (open: boolean) => void;
}



function menuElements(list: HTMLDivElement | null): HTMLElement[] {
  if (list === null) return [];
  return Array.from(list.querySelectorAll<HTMLElement>('[data-menu-index]'))
    .filter((el) => el.closest('[role="menu"]') === list)
    .sort((a, b) => Number(a.dataset.menuIndex) - Number(b.dataset.menuIndex));
}

function focusAt(list: HTMLDivElement | null, index: number): void {
  if (index < 0) return;
  const target = menuElements(list)[index];
  if (target === undefined) return;
  target.focus();
  // Keyboard focus must never sit outside the visible scroll window.
  target.scrollIntoView?.({ block: 'nearest' });
}

function activeIndex(list: HTMLDivElement | null): number {
  const active = document.activeElement;
  return menuElements(list).findIndex((el) => el === active);
}

interface MenuListProps {
  id: string;
  label: string;
  items: MenuEntry[];
  testId?: string;
  onClose: () => void;
  onBack?: () => void;
  autoFocus: boolean;
  style?: Record<string, string>;
  listRef?: { current: HTMLDivElement | null };
  depth: number;
}

/** One menu level. Nested levels are rendered as `role="menu"` submenus. */
function MenuList(props: MenuListProps): ComponentChildren {
  const localRef = useRef<HTMLDivElement | null>(null);
  const listRef = props.listRef ?? localRef;
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [scrolls, setScrolls] = useState(false);
  const keyboardSub = useRef(false);
  const list = (): HTMLDivElement | null => listRef.current ?? localRef.current;

  useLayoutEffect(() => {
    // A list taller than its box scrolls internally; the class adds the visible
    // overflow cue so a cut-off command looks scrollable rather than missing.
    const root = list();
    if (root === null) return;
    setScrolls(needsScroll(root.scrollHeight, root.clientHeight));
  }, [props.items]);

  useLayoutEffect(() => {
    if (!props.autoFocus) return;
    // Land on the first *enabled* action: focusing a disabled button is a no-op
    // and would leave focus on the trigger (panel menus start with e.g. a
    // disabled "Dock left").
    //
    // This must be a layout effect: the popover is already in the DOM and
    // answering hover/focus once the commit finishes, so a deferred effect ran
    // a frame later and stole focus back from a user (or a test driver) who had
    // already moved into the list — Enter then activated the first item instead
    // of the one under focus.
    const root = list();
    const enabled = menuElements(root).map((el) => !(el as HTMLButtonElement).disabled);
    focusAt(root, edgeIndex(enabled, 'first'));
  }, [props.autoFocus]);

  const move = (delta: number): void => {
    const root = list();
    const enabled = menuElements(root).map((el) => !(el as HTMLButtonElement).disabled);
    focusAt(root, rovingIndex(enabled, activeIndex(root), delta));
  };

  const jump = (edge: 'first' | 'last'): void => {
    const root = list();
    const enabled = menuElements(root).map((el) => !(el as HTMLButtonElement).disabled);
    focusAt(root, edgeIndex(enabled, edge));
  };

  const openSubmenu = (id: string): void => {
    keyboardSub.current = true;
    setOpenSub(id);
  };

  const openSubmenuForActive = (): boolean => {
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? Number(active.dataset.menuIndex) : Number.NaN;
    const entry = Number.isInteger(index) ? props.items[index] : undefined;
    if (entry?.kind !== 'submenu' || entry.disabled === true || entry.items.length === 0) return false;
    openSubmenu(entry.id);
    return true;
  };

  const moves: Record<string, () => void> = {
    ArrowDown: () => move(1),
    ArrowUp: () => move(-1),
    Home: () => jump('first'),
    End: () => jump('last'),
    ArrowLeft: () => props.onBack?.(),
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key;
    if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') event.preventDefault();
      props.onClose();
      return;
    }
    if (key === 'ArrowRight') {
      if (openSubmenuForActive()) event.preventDefault();
      return;
    }
    const command = moves[key];
    if (command === undefined) return;
    if (key === 'ArrowLeft' && props.depth === 0) return;
    event.preventDefault();
    command();
  };

  return (
    <div
      id={props.id}
      ref={listRef}
      data-testid={props.testId}
      class={`${props.depth === 0 ? 'menu-popover' : 'menu-submenu-popover'}${scrolls ? ' menu-scrolls' : ''}`}
      role="menu"
      aria-label={props.label}
      style={props.style}
      onKeyDown={onKeyDown}
    >
      {props.items.map((entry, index) => renderEntry(entry, {
        index,
        openSub,
        onClose: props.onClose,
        onToggleSub: (id) => {
          keyboardSub.current = false;
          setOpenSub((current) => (current === id ? null : id));
        },
        onBack: () => {
          setOpenSub(null);
          const index = props.items.findIndex((it) => it.kind === 'submenu' && it.id === openSub);
          window.requestAnimationFrame?.(() => focusAt(list(), index));
        },
        subAutoFocus: keyboardSub.current,
        depth: props.depth + 1,
      }))}
    </div>
  );
}

interface EntryContext {
  index: number;
  openSub: string | null;
  onClose: () => void;
  onToggleSub: (id: string) => void;
  onBack: () => void;
  subAutoFocus: boolean;
  depth: number;
}

function renderEntry(entry: MenuEntry, ctx: EntryContext): ComponentChildren {
  if (entry.kind === 'separator') return <div key={entry.id} role="separator" class="menu-separator" />;
  if (entry.kind === 'submenu') return <SubmenuRow key={entry.id} entry={entry} ctx={ctx} />;
  return renderItem(entry, ctx);
}

/**
 * One submenu row. Placement is measured, not assumed: the surface opens beside
 * its row, flips to the left when the right-hand side has no room, is clamped
 * vertically and sized to the space it actually has (item 7). A fixed
 * `left: 100%` positioning pushed deep menus off-screen.
 */
function SubmenuRow(props: { entry: MenuSubmenuEntry; ctx: EntryContext }): ComponentChildren {
  const { entry, ctx } = props;
  const open = ctx.openSub === entry.id;
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return undefined;
    }
    const place = (): void => {
      const row = rowRef.current?.getBoundingClientRect();
      const size = popRef.current?.getBoundingClientRect();
      if (row === undefined || size === undefined) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const placed = placeSubmenu(
        { left: row.left, top: row.top, right: row.right, bottom: row.bottom },
        { width: size.width, height: size.height },
        viewport,
      );
      setPlacement({
        left: placed.left,
        top: placed.top,
        maxHeight: availableMenuHeight(placed.top, viewport),
      });
    };
    place();
    // A resize or a scrolled canvas moves the row under the open submenu.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <div class="menu-submenu" role="none">
      <button
        type="button"
        role="menuitem"
        class="menu-item"
        ref={rowRef}
        data-menu-index={ctx.index}
        data-testid={entry.testId}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={entry.disabled === true}
        onClick={() => ctx.onToggleSub(entry.id)}
      >
        <span class="menu-item-label">{entry.label}</span>
        <span class="menu-item-chevron">
          <SubmenuIcon />
        </span>
      </button>
      {open && (
        <MenuList
          id={`${entry.id}-menu`}
          label={entry.label}
          items={entry.items}
          onClose={ctx.onClose}
          onBack={ctx.onBack}
          autoFocus={ctx.subAutoFocus}
          depth={ctx.depth}
          listRef={popRef}
          style={{
            position: 'fixed',
            left: `${placement?.left ?? 0}px`,
            top: `${placement?.top ?? 0}px`,
            ...(placement === null
              ? { visibility: 'hidden' }
              : { maxHeight: `${Math.max(120, placement.maxHeight)}px` }),
          }}
        />
      )}
    </div>
  );
}

function renderItem(entry: MenuActionEntry, ctx: EntryContext): ComponentChildren {
  const role = entry.role ?? 'menuitem';
  return (
    <button
      key={entry.id}
      type="button"
      role={role}
      class="menu-item"
      data-menu-index={ctx.index}
      data-testid={entry.testId}
      disabled={entry.disabled === true}
      aria-checked={role === 'menuitem' ? undefined : entry.checked === true}
      onClick={() => {
        entry.onSelect();
        ctx.onClose();
      }}
    >
      {role === 'menuitem' ? null : (
        <span class="menu-item-check">{entry.checked === true && <CheckIcon />}</span>
      )}
      <span class="menu-item-label">{entry.label}</span>
    </button>
  );
}

export interface FloatingMenuProps {
  id: string;
  label: string;
  /** Viewport point the surface opens from (pointer position or trigger box). */
  anchor: { left: number; top: number };
  items: MenuEntry[];
  onClose: () => void;
  testId?: string;
}

/**
 * A menu opened at an arbitrary viewport point — the same surface, placement,
 * keyboard and dismissal rules as the trigger-anchored menus, so a context menu
 * cannot drift away from the application menu's behaviour (item 7).
 */
export function FloatingMenu(props: FloatingMenuProps): ComponentChildren {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [point, setPoint] = useState({ left: props.anchor.left, top: props.anchor.top });
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const anchor = props.anchor;

  useEffect(() => {
    const place = (): void => {
      const size = popRef.current?.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const placed = clampMenuPosition(
        { left: anchor.left, top: anchor.top },
        { width: size?.width ?? 0, height: size?.height ?? 0 },
        viewport,
      );
      setPoint(placed);
      setMaxHeight(availableMenuHeight(placed.top, viewport));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const onPointerDown = (event: Event): void => {
      if (isInside(event.target, [popRef.current])) return;
      props.onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [anchor.left, anchor.top, props]);

  return (
    <MenuList
      id={props.id}
      label={props.label}
      items={props.items}
      onClose={props.onClose}
      autoFocus
      listRef={popRef}
      depth={0}
      testId={props.testId}
      style={{
        position: 'fixed',
        left: `${point.left}px`,
        top: `${point.top}px`,
        ...(maxHeight === undefined ? {} : { maxHeight: `${Math.max(160, maxHeight)}px` }),
      }}
    />
  );
}

/** Anchor-pointed menu with one shared dismissal/focus lifecycle. */
export function Menu(props: MenuProps): ComponentChildren {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ left: 0, top: 0 });
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next);
      props.onOpenChange?.(next);
    },
    [props],
  );

  const close = useCallback(() => {
    setOpenState(false);
    triggerRef.current?.focus();
  }, [setOpenState]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      props.onOpenChange?.(next);
      return next;
    });
  }, [props]);

  useEffect(() => {
    if (!open) return undefined;
    const place = (): void => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const size = popRef.current?.getBoundingClientRect();
      if (trigger === undefined) return;
      const placed = placeMenu(
        { left: trigger.left, top: trigger.top, right: trigger.right, bottom: trigger.bottom },
        { width: size?.width ?? 0, height: size?.height ?? 0 },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setPoint({ left: placed.left, top: placed.top });
      // Sized to the chosen side, so a long menu scrolls internally instead of
      // growing over the trigger or off the viewport edge.
      setMaxHeight(placed.maxHeight);
    };
    place();
    // Keep the surface on screen when the window resizes or the page scrolls.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const onPointerDown = (event: Event): void => {
      if (isInside(event.target, [triggerRef.current, popRef.current])) return;
      setOpenState(false);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpenState(false);
      triggerRef.current?.focus();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open, setOpenState]);

  return (
    <div class={`menu${props.class === undefined ? '' : ` ${props.class}`}`}>
      <button
        type="button"
        ref={triggerRef}
        class="menu-trigger"
        data-testid={props.testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${props.id}-menu` : undefined}
        aria-label={props.label}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpenState(true);
          } else if (event.key === 'Escape' && open) {
            // The popover's dismissal listener attaches after its first paint,
            // while focus is still on this trigger — without this branch an
            // Escape pressed in that frame went nowhere and the menu stayed open.
            event.preventDefault();
            close();
          }
        }}
      >
        {props.trigger ?? props.label}
      </button>
      {open && (
        <MenuList
          id={`${props.id}-menu`}
          label={props.label}
          items={props.items}
          onClose={close}
          autoFocus
          listRef={popRef}
          depth={0}
          style={{
            position: 'fixed',
            left: `${point.left}px`,
            top: `${point.top}px`,
            maxHeight: `${maxHeight ?? Math.max(200, window.innerHeight - point.top - MENU_MARGIN * 2)}px`,
          }}
        />
      )}
    </div>
  );
}
