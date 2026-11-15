// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP01: one owned menu/popover primitive used by the application menu and
// the panel action menus. Keyboard contract: trigger `aria-haspopup="menu"`,
// roving `menuitem` focus with arrows/Home/End, ArrowRight/Left for submenus,
// Escape and outside pointer dismiss, Tab closes, focus returns to the trigger.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { clampMenuPosition, edgeIndex, isInside, MENU_MARGIN, rovingIndex } from './menuModel';
import { s } from './strings';

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
  menuElements(list)[index]?.focus();
}

function activeIndex(list: HTMLDivElement | null): number {
  const active = document.activeElement;
  return menuElements(list).findIndex((el) => el === active);
}

interface MenuListProps {
  id: string;
  label: string;
  items: MenuEntry[];
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
  const keyboardSub = useRef(false);
  const list = (): HTMLDivElement | null => listRef.current ?? localRef.current;

  useEffect(() => {
    if (props.autoFocus) focusAt(list(), 0);
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
      class={props.depth === 0 ? 'menu-popover' : 'menu-submenu-popover'}
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
  if (entry.kind === 'submenu') return renderSubmenu(entry, ctx);
  return renderItem(entry, ctx);
}

function renderSubmenu(entry: MenuSubmenuEntry, ctx: EntryContext): ComponentChildren {
  const open = ctx.openSub === entry.id;
  return (
    <div class="menu-submenu" key={entry.id} role="none">
      <button
        type="button"
        role="menuitem"
        class="menu-item"
        data-menu-index={ctx.index}
        data-testid={entry.testId}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={entry.disabled === true}
        onClick={() => ctx.onToggleSub(entry.id)}
      >
        <span class="menu-item-label">{entry.label}</span>
        <span class="menu-item-chevron" aria-hidden="true">{s('›')}</span>
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
        <span class="menu-item-check" aria-hidden="true">{entry.checked === true ? '✓' : ''}</span>
      )}
      <span class="menu-item-label">{entry.label}</span>
    </button>
  );
}

/** Anchor-pointed menu with one shared dismissal/focus lifecycle. */
export function Menu(props: MenuProps): ComponentChildren {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState({ left: 0, top: 0 });
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
    const trigger = triggerRef.current?.getBoundingClientRect();
    const size = popRef.current?.getBoundingClientRect();
    setPoint(
      clampMenuPosition(
        { left: trigger?.left ?? 0, top: (trigger?.bottom ?? 0) + 2 },
        { width: size?.width ?? 0, height: size?.height ?? 0 },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
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
            margin: `${MENU_MARGIN}px 0 0`,
            maxHeight: `${Math.max(200, window.innerHeight - point.top - MENU_MARGIN * 2)}px`,
          }}
        />
      )}
    </div>
  );
}
