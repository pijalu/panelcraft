// SPDX-License-Identifier: GPL-3.0-only
// M3-WP1 file tree (FR-W1): folders-first rendering, click-to-open, inline
// rename (double-click / F2), duplicate, delete (two-step inline confirm),
// new file/folder, and pointer-based drag-to-move (no HTML5 DnD — mirrors
// the palette drag pattern, ADR-0001 chrome-only re-render).
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import { listDir } from '../workspace/fs';
import { CloseIcon, CopyIcon, DisclosureClosedIcon, DisclosureOpenIcon, PencilIcon } from './icons';
import { useRowMenu, type RowMenuTarget } from './fileRowMenu';
import { baseName } from './paths';
import { s } from './strings';

export interface FileTreeProps {
  manager: WorkspaceManager;
  /** Bumped by the owner whenever the manager emitted; re-reads the tree. */
  version: number;
  onOpen: (path: string) => void;
}

/** Flat UI row (folders first, depth for indent). */
interface Row {
  path: string;
  name: string;
  kind: 'file' | 'folder';
  depth: number;
}

/** Collapsed folders survive re-renders via this module-level set. */
const collapsedFolders = new Set<string>();

interface DragState {
  path: string;
  suppress: boolean;
}

const IDLE_DRAG: DragState = { path: '', suppress: false };

function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Flatten the tree folders-first (listDir order) honoring collapsed state. */
function rowsUnder(manager: WorkspaceManager, path: string, depth: number, rows: Row[]): void {
  for (const child of listDir(manager.root, path)) {
    const childPath = path === '' ? child.name : `${path}/${child.name}`;
    const isFolder = child.kind === 'folder';
    rows.push({ path: childPath, name: child.name, kind: isFolder ? 'folder' : 'file', depth });
    if (isFolder && !collapsedFolders.has(childPath)) {
      rowsUnder(manager, childPath, depth + 1, rows);
    }
  }
}

function buildRows(manager: WorkspaceManager): Row[] {
  const rows: Row[] = [];
  rowsUnder(manager, '', 0, rows);
  return rows;
}

/**
 * Pointer drag-to-move: the dragged path plus the row handlers (the file tree
 * requirement to move files between folders). Only the primary button starts a
 * drag, so a right-click stays a menu gesture.
 */
function useRowDrag(manager: WorkspaceManager) {
  const [drag, setDrag] = useState<DragState>(IDLE_DRAG);

  const down = (row: Row, e: PointerEvent): void => {
    if (e.button !== 0) return; // right-click opens the row menu, it does not drag
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    setDrag({ path: row.path, suppress: false });
  };

  const up = (row: Row): void => {
    if (drag.path === '' || drag.path === row.path) {
      setDrag(IDLE_DRAG);
      return;
    }
    const from = drag.path;
    const targetDir = row.kind === 'folder' ? row.path : parentDir(row.path);
    if (targetDir === parentDir(from) || targetDir.startsWith(`${from}/`)) {
      setDrag(IDLE_DRAG); // same folder or into own subtree — nothing to do
      return;
    }
    try {
      manager.movePath(from, targetDir);
      setDrag({ path: '', suppress: true }); // swallow the trailing click
    } catch {
      setDrag(IDLE_DRAG); // fs refused (into-self/exists) — keep layout
    }
  };

  return {
    drag,
    down,
    up,
    reset: () => setDrag(IDLE_DRAG),
    /** Force a re-render without changing the drag (folder expand/collapse). */
    refresh: () => setDrag((d) => ({ ...d })),
  };
}

export function FileTree({ manager, version, onOpen }: FileTreeProps) {
  const rows = buildRows(manager);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | 'file' | 'folder'>(null);
  const [createName, setCreateName] = useState('');
  const [lastFolder, setLastFolder] = useState('');
  void version; // re-read happens via buildRows on each render
  const { drag, down, up, reset, refresh } = useRowDrag(manager);

  const startRename = (path: string): void => {
    setRenaming(path);
  };

  const commitRename = (path: string, name: string): void => {
    setRenaming(null);
    if (name !== '' && name !== baseName(path)) {
      try {
        manager.renamePath(path, name);
      } catch {
        /* invalid name — tree keeps the old one */
      }
    }
  };

  const toggleFolder = (path: string): void => {
    if (collapsedFolders.has(path)) collapsedFolders.delete(path);
    else collapsedFolders.add(path);
    refresh(); // re-render with the new expansion state
  };

  const onDelete = (path: string): void => {
    if (confirmDelete === path) {
      setConfirmDelete(null);
      manager.removePath(path);
    } else {
      setConfirmDelete(path);
    }
  };

  // The row context menu carries the same actions as the inline buttons, so a
  // long name that squeezes those buttons never makes an action unreachable.
  const rowMenu = useRowMenu({
    onOpen,
    onDuplicate: (p) => manager.duplicatePath(p),
    onRename: startRename,
    onDelete,
  });

  const commitCreate = (): void => {
    const path = lastFolder === '' ? createName : `${lastFolder}/${createName}`;
    try {
      if (creating === 'file') manager.createFileAt(path, '');
      else if (creating === 'folder') manager.createFolderAt(path);
      else return;
    } catch {
      return; // invalid/duplicate name — stay in edit mode
    }
    if (creating === 'folder') setLastFolder(path);
    setCreating(null);
    setCreateName('');
  };

  return (
    <nav class="file-tree" data-testid="file-tree">
      <TreeToolbar
        creating={creating}
        createName={createName}
        dir={lastFolder}
        onCreate={(kind) => {
          setCreating(kind);
          setCreateName('');
        }}
        onName={setCreateName}
        onCommit={commitCreate}
        onCancel={() => setCreating(null)}
      />
      <ul class="tree-rows">
        {rows.map((row) => (
          <TreeRow
            key={row.path}
            row={row}
            renaming={renaming === row.path}
            confirmDelete={confirmDelete === row.path}
            dragging={drag.path === row.path}
            collapsed={collapsedFolders.has(row.path)}
            suppressClick={drag.suppress}
            onPointerDown={down}
            onPointerUp={up}
            onOpenPath={onOpen}
            onToggleFolder={(p) => {
              setLastFolder(p);
              toggleFolder(p);
            }}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onCancelRename={() => setRenaming(null)}
            onDuplicate={(p) => manager.duplicatePath(p)}
            onDelete={onDelete}
            onOpenMenu={(target, box) =>
              rowMenu.open({ ...target, x: box.left, y: box.bottom })
            }
            onSuppress={reset}
          />
        ))}
      </ul>
      {rowMenu.node}
    </nav>
  );
}

interface TreeToolbarProps {
  creating: null | 'file' | 'folder';
  createName: string;
  dir: string;
  onCreate: (kind: 'file' | 'folder') => void;
  onName: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/** [+ file][+ folder] buttons plus the inline name input while creating. */
function TreeToolbar(props: TreeToolbarProps) {
  return (
    <>
      <div class="tree-toolbar" data-no-drag>
        <button type="button" data-testid="tree-new-file" title={s("New file")} onClick={() => props.onCreate('file')}>
          {s("+ file")}{' '}</button>
        <button type="button" data-testid="tree-new-folder" title={s("New folder")} onClick={() => props.onCreate('folder')}>
          {s("+ folder")}{' '}</button>
      </div>
      {props.creating !== null && (
        <div class="tree-create" data-no-drag>
          <input
            data-testid="tree-create-input"
            value={props.createName}
            placeholder={s(props.creating === 'file' ? 'name.pcd' : 'folder')}
            title={props.dir === '' ? s('in workspace root') : s('in {dir}', { dir: props.dir })}
            onInput={(e) => props.onName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onCommit();
              if (e.key === 'Escape') props.onCancel();
            }}
            onBlur={props.onCommit}
            autoFocus
          />
        </div>
      )}
    </>
  );
}

interface TreeRowProps {
  row: Row;
  renaming: boolean;
  confirmDelete: boolean;
  dragging: boolean;
  collapsed: boolean;
  suppressClick: boolean;
  onPointerDown: (row: Row, e: PointerEvent) => void;
  onPointerUp: (row: Row) => void;
  onOpenPath: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onStartRename: (path: string) => void;
  onCommitRename: (path: string, name: string) => void;
  onCancelRename: () => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
  /** Open the row menu at this row, anchored to the row's own box. */
  onOpenMenu: (target: RowMenuTarget, box: { left: number; bottom: number }) => void;
  onSuppress: () => void;
}

/** The row's context-menu trigger box: the label's viewport rect. */
function menuAnchor(el: HTMLElement): { left: number; bottom: number } {
  const box = el.getBoundingClientRect();
  return { left: box.left, bottom: box.bottom };
}

/**
 * Inline rename input. It takes focus from a layout effect rather than
 * `autoFocus`: the menu that started the rename unmounts in the same commit and
 * would otherwise drop focus to the document body, swallowing the next key.
 */
function RenameInput(props: {
  value: string;
  onValue: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      data-testid="tree-rename-input"
      data-no-drag
      value={props.value}
      onInput={(e) => props.onValue((e.target as HTMLInputElement).value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onCommit();
        if (e.key === 'Escape') props.onCancel();
      }}
      onBlur={props.onCommit}
    />
  );
}

/** One tree row: label button, inline rename input, hover actions. */
function TreeRow(props: TreeRowProps) {
  const { row } = props;
  const [draft, setDraft] = useState(row.name);
  const nameRef = useRef<HTMLButtonElement | null>(null);
  const wasRenaming = useRef(props.renaming);
  // Leaving a rename must not drop focus to the document body: the next Tab
  // would restart from the top of the app. A layout effect runs right after the
  // commit, before the browser can dispatch another key.
  useLayoutEffect(() => {
    if (wasRenaming.current && !props.renaming) nameRef.current?.focus();
    wasRenaming.current = props.renaming;
  }, [props.renaming]);
  const openMenu = (el: HTMLElement): void => {
    props.onOpenMenu({ path: row.path, kind: row.kind }, menuAnchor(el));
  };
  return (
    <li
      class={`tree-row tree-${row.kind}${props.dragging ? ' dragging' : ''}`}
      data-path={row.path}
      data-testid={`tree-row-${row.path}`}
      style={`padding-left: ${row.depth * 14 + 6}px`}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onOpenMenu({ path: row.path, kind: row.kind }, { left: e.clientX, bottom: e.clientY });
      }}
      onPointerDown={(e) => props.onPointerDown(row, e as unknown as PointerEvent)}
      onPointerUp={() => props.onPointerUp(row)}
    >
      {props.renaming ? (
        <RenameInput
          value={draft}
          onValue={setDraft}
          onCommit={() => props.onCommitRename(row.path, draft)}
          onCancel={props.onCancelRename}
        />
      ) : (
        <span class="tree-label">
          <button
            type="button"
            ref={nameRef}
            class="tree-name"
            // The name is clamped to two lines so a huge name cannot push the
            // row actions out of the panel or turn one row into a column of
            // letters. The tooltip carries the whole name.
            title={row.name}
            onClick={() => {
              if (props.suppressClick) {
                props.onSuppress();
                return;
              }
              if (row.kind === 'folder') props.onToggleFolder(row.path);
              else props.onOpenPath(row.path);
            }}
            onKeyDown={(e) => {
              if (row.kind === 'file' && e.key === 'F2') props.onStartRename(row.path);
              // The platform context-menu chord (Windows/Linux keyboard, macOS
              // Fn+Ctrl+F10 in some layouts) and the dedicated ContextMenu key.
              const chord = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
              if (!chord) return;
              e.preventDefault();
              openMenu(e.currentTarget);
            }}
          >
            {row.kind === 'folder' && (props.collapsed ? <DisclosureClosedIcon /> : <DisclosureOpenIcon />)}
            <span class="tree-text">{row.name}</span>
          </button>
        </span>
      )}
      <span class="tree-actions" data-no-drag>
        {row.kind === 'file' && (
          <button type="button" title={s("Duplicate")} aria-label={s('Duplicate {path}', { path: row.path })} data-testid={`tree-dup-${row.path}`} onClick={() => props.onDuplicate(row.path)}>
            <CopyIcon />
          </button>
        )}
        <button type="button" title={s("Rename")} aria-label={s('Rename {path}', { path: row.path })} data-testid={`tree-ren-${row.path}`} onClick={() => props.onStartRename(row.path)}>
          <PencilIcon />
        </button>
        {props.confirmDelete ? (
          <button type="button" class="tree-danger" title={s("Click again to delete")} data-testid={`tree-del-confirm-${row.path}`} onClick={() => props.onDelete(row.path)}>
            {s("sure?")}{' '}</button>
        ) : (
          <button type="button" title={s("Delete")} aria-label={s('Delete {path}', { path: row.path })} data-testid={`tree-del-${row.path}`} onClick={() => props.onDelete(row.path)}>
            <CloseIcon />
          </button>
        )}
      </span>
    </li>
  );
}
