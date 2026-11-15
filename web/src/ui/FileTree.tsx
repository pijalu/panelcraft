// SPDX-License-Identifier: GPL-3.0-only
// M3-WP1 file tree (FR-W1): folders-first rendering, click-to-open, inline
// rename (double-click / F2), duplicate, delete (two-step inline confirm),
// new file/folder, and pointer-based drag-to-move (no HTML5 DnD — mirrors
// the palette drag pattern, ADR-0001 chrome-only re-render).
import { useState } from 'preact/hooks';
import type { WorkspaceManager } from '../workspace/workspace';
import { listDir } from '../workspace/fs';
import { CloseIcon, CopyIcon, DisclosureClosedIcon, DisclosureOpenIcon, PencilIcon } from './icons';
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

export function FileTree({ manager, version, onOpen }: FileTreeProps) {
  const rows = buildRows(manager);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | 'file' | 'folder'>(null);
  const [createName, setCreateName] = useState('');
  const [lastFolder, setLastFolder] = useState('');
  const [drag, setDrag] = useState<DragState>(IDLE_DRAG);
  void version; // re-read happens via buildRows on each render

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
    setDrag((d) => ({ ...d })); // force re-render with new expansion state
  };

  const onDelete = (path: string): void => {
    if (confirmDelete === path) {
      setConfirmDelete(null);
      manager.removePath(path);
    } else {
      setConfirmDelete(path);
    }
  };

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

  /* ---- pointer drag-to-move (FR-W1) ---- */

  const onRowPointerDown = (row: Row, e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    setDrag({ path: row.path, suppress: false });
  };

  const onRowPointerUp = (row: Row): void => {
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
            onPointerDown={onRowPointerDown}
            onPointerUp={onRowPointerUp}
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
            onSuppress={() => setDrag(IDLE_DRAG)}
          />
        ))}
      </ul>
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
  onSuppress: () => void;
}

/** One tree row: label button, inline rename input, hover actions. */
function TreeRow(props: TreeRowProps) {
  const { row } = props;
  const [draft, setDraft] = useState(row.name);
  return (
    <li
      class={`tree-row tree-${row.kind}${props.dragging ? ' dragging' : ''}`}
      data-path={row.path}
      data-testid={`tree-row-${row.path}`}
      style={`padding-left: ${row.depth * 14 + 6}px`}
      onPointerDown={(e) => props.onPointerDown(row, e as unknown as PointerEvent)}
      onPointerUp={() => props.onPointerUp(row)}
    >
      {props.renaming ? (
        <input
          data-testid="tree-rename-input"
          data-no-drag
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') props.onCommitRename(row.path, draft);
            if (e.key === 'Escape') props.onCancelRename();
          }}
          onBlur={() => props.onCommitRename(row.path, draft)}
          autoFocus
        />
      ) : (
        <span class="tree-label">
          <button
            type="button"
            class="tree-name"
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
            }}
          >
            {row.kind === 'folder' && (props.collapsed ? <DisclosureClosedIcon /> : <DisclosureOpenIcon />)}
            {row.name}
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
