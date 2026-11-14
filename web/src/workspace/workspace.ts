// SPDX-License-Identifier: GPL-3.0-only
// M3: workspace manager — ties the virtual FS, tabs, storage (autosave),
// ZIP container and per-file IO into one observable façade for the UI.
// Canvas ⇄ file mapping: the canvas state serializes to canonical PDL text
// (geometry is a canvas concern; the format stays position-free — M6 auto-layout
// owns re-layout, see M3.md "canvas ⇄ file" note).
import {
  basename, createFile, deleteNode, duplicateNode, filesUnder, getNode, newRoot,
  parentPath, readFile, renameNode, moveNode, writeFile, FsError, type FsNode,
} from './fs';
import { initialTabs, openTab, closeTab, moveTab, setDirty, type TabsState } from './tabs';
import { Autosaver } from './store/autosave';
import { MemoryStorage } from './store/memory';
import {
  SCHEMA_VERSION, StoreError, newStoredWorkspace,
  type StoragePort, type StoredWorkspace, type WorkspaceSettings,
} from './store/port';
import { createDefaultStorage } from './store/idb';
import { packZip, unpackZip } from './zip/zip';
import { entriesToTree, treeToEntries, snapshotTree } from './zip/workspaceZip';
import { exportPcd, exportMmd, importText } from './io';
import { parsePDL } from '../engine/format/parser';
import { printDoc } from '../engine/format/printer';
import { DEFAULT_SHAPE } from '../ui/CanvasController';
import { applyCanvasState } from '../engine/model/merge';
import { isImportRef, resolveImportGhosts, type ImportError } from '../engine/model/imports';
import {
  IR_VERSION, FORMAT_VERSION,
  type Doc, type Kind, type Link, type Obj, type StyleBlock,
} from '../engine/model/types';

/** Canvas-side state (structurally compatible with ui CanvasController). */
export interface CanvasObject {
  id: string;
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
  description?: string;
  technology?: string;
  tags?: string[];
  dashed?: boolean;
  icon?: string;
  /** Explicit size from the file (`size <w> <h>`, F-13); absent = default. */
  size?: { w: number; h: number };
  /** Custom key-value properties (F-11). */
  properties?: { key: string; value: string }[];
  /** Style overrides from the `style` block (F-11). */
  style?: { fill?: string; stroke?: string; text?: string; icon?: string };
}

export interface CanvasLink {
  id: string;
  from: string;
  to: string;
  /** Arrow type; absent = untyped arrow (F-08: never invented). */
  type?: string;
  label?: string;
  dashed?: boolean;
  /** `<->` double-headed link (F-07). */
  bidir?: boolean;
  /** Explicit routing waypoints (F-19). */
  waypoints?: [number, number][];
  /** Normalized perimeter endpoint anchors (CX-01, IR v4). */
  fromAnchor?: number;
  toAnchor?: number;
  /** Arrow visual model (F-12). */
  head?: string;
  tail?: string;
  line?: string;
  route?: StyleBlock['route'];
  width?: number;
}

export interface CanvasState {
  objects: CanvasObject[];
  links: CanvasLink[];
}

/* ---- canvas ⇄ PDL ------------------------------------------------------- */

/** Style block of a canvas object (dashed + F-11 overrides), or undefined. */
function objectStyle(o: CanvasObject): StyleBlock | undefined {
  const style: StyleBlock = {
    dashed: o.dashed === true ? true : undefined,
    fill: o.style?.fill,
    stroke: o.style?.stroke,
    text: o.style?.text,
    icon: o.style?.icon,
  };
  return Object.values(style).every((v) => v === undefined) ? undefined : style;
}

/** Style block of a canvas link (F-12 keys + dashed), or undefined when empty. */
function linkStyle(l: CanvasLink): StyleBlock | undefined {
  const style: StyleBlock = {
    dashed: l.dashed === true ? true : undefined,
    head: l.head,
    tail: l.tail,
    line: l.line,
    route: l.route,
    width: l.width,
  };
  const empty = Object.values(style).every((v) => v === undefined);
  return empty ? undefined : style;
}

/**
 * Canvas → doc *projection*: objects + links only, no flows/views/styles.
 *
 * Used for two things only: (a) the fallback when the file does not parse
 * (F-01 — a broken buffer must not block canvas saves) and (b) the canvas
 * fingerprint that dedupes no-op saves. Real saves go through
 * `applyCanvasState`, so nothing outside objects/links is lost.
 */
export function stateToDoc(state: CanvasState): Doc {
  const objects: Obj[] = state.objects.map((o) => ({
    kind: o.kind,
    id: o.id,
    name: o.name,
    description: o.description,
    technology: o.technology,
    tags: o.tags?.length ? [...o.tags] : undefined,
    icon: o.icon,
    size: o.size === undefined ? undefined : { w: o.size.w, h: o.size.h },
    properties: o.properties && o.properties.length > 0
      ? o.properties.map((p) => ({ key: p.key, value: p.value }))
      : undefined,
    style: objectStyle(o),
    pos: { line: 0, col: 0 },
  }));
  const links: Link[] = state.links.map((l) => ({
    id: l.id,
    from: l.from,
    to: l.to,
    // F-08: no `uses` default — an untyped arrow stays untyped
    type: l.type === '' ? undefined : l.type,
    label: l.label,
    bidir: l.bidir === true ? true : undefined,
    // F-12: the arrow model lives inside the link style block on disk, so the
    // projection must print it there too (it is also the change fingerprint)
    style: linkStyle(l),
    // F-19: waypoints are document data — they must change the fingerprint,
    // or a waypoint drag would never reach the code view
    waypoints: l.waypoints && l.waypoints.length > 0
      ? l.waypoints.map((w) => [w[0], w[1]] as [number, number])
      : undefined,
    fromAnchor: l.fromAnchor,
    toAnchor: l.toAnchor,
    pos: { line: 0, col: 0 },
  }));
  return {
    irVersion: IR_VERSION,
    formatVersion: FORMAT_VERSION,
    objects,
    links,
    imports: [],
    flows: [],
    views: [],
    styles: [],
  };
}

/** Canvas → file projection (D-M4-6): canonical text of stateToDoc. */
export function stateToPcd(state: CanvasState): string {
  return printDoc(stateToDoc(state));
}

/** Deterministic grid layout for files without geometry (position-free format). */
function gridPos(index: number): { x: number; y: number } {
  const COLS = 5;
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: 40 + col * 190, y: 40 + row * 140 };
}

/**
 * Stored `position` lines of `viewName` (M6 FR-V4; undefined = the explicit
 * "Default" view — the UI's implicit-default session resolution). Local
 * resolver: workspace sits below ui/, so it must not import viewDoc.
 */
function viewPositions(doc: Doc, viewName?: string): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const view = doc.views.find((v) => v.name === (viewName ?? 'Default'));
  if (!view) return out;
  for (const l of view.lines) {
    if (l.type === 'position') out.set(l.id, { x: l.x, y: l.y });
  }
  return out;
}

/**
 * Grid-layout canvas state for a parsed doc (position-free format). Link ids
 * are synthesized when the text has no `as` clause; the fallback must be a
 * valid ident (§1) — `from->to` would print `as from->to` and '>' is not an
 * ident char, so the buffer would never re-parse (M4 fix, FR-K2).
 *
 * `viewName` (M6 FR-V4): stored `position` lines of that view overlay the
 * grid (default resolution = the explicit "Default" view, matching the UI's
 * implicit-default session state). Objects without a stored position keep
 * their grid slot.
 */
/** Canvas fields of a document object, minus geometry (F-13 keeps size separate). */
function docObjectFields(o: Obj): Omit<CanvasObject, 'x' | 'y' | 'w' | 'h'> {
  return {
    id: o.id,
    kind: o.kind,
    name: o.name,
    description: o.description,
    technology: o.technology,
    tags: o.tags,
    icon: o.icon,
    dashed: o.style?.dashed === true ? true : undefined,
    properties: o.properties?.map((p) => ({ key: p.key, value: p.value })),
    style: {
      fill: o.style?.fill,
      stroke: o.style?.stroke,
      text: o.style?.text,
      icon: o.style?.icon,
    },
  };
}

/** Width/height + explicit size of a document object (F-13). */
function docObjectSize(o: Obj): Pick<CanvasObject, 'w' | 'h' | 'size'> {
  const fallback = DEFAULT_SHAPE[o.kind];
  return {
    // an explicit `size` wins over the per-kind default
    w: o.size?.w ?? fallback?.w ?? 160,
    h: o.size?.h ?? fallback?.h ?? 60,
    size: o.size === undefined ? undefined : { w: o.size.w, h: o.size.h },
  };
}

export function docToState(doc: Doc, viewName?: string): CanvasState {
  const positions = viewPositions(doc, viewName);
  // F-06: every kind the palette offers must survive a load (group/note used
  // to be filtered out here, so a drawn boundary vanished on the next apply).
  const objects: CanvasObject[] = doc.objects.map((o, i) => {
    const p = positions.get(o.id) ?? gridPos(i);
    return {
      ...docObjectFields(o),
      x: p.x,
      y: p.y,
      ...docObjectSize(o),
    };
  });
  const ids = new Set(objects.map((o) => o.id));
  // F-20: a link may target an imported object (`alias.id`) — keep it, or the
  // next canvas write would delete the user's cross-file links
  const links: CanvasLink[] = doc.links
    .filter((l) => (ids.has(l.from) || isImportRef(l.from)) && (ids.has(l.to) || isImportRef(l.to)))
    .map((l, i) => ({
      id: l.id ?? `${l.from}-${l.to}-${i}`,
      from: l.from,
      to: l.to,
      // F-08: carry the document's semantics — no injected `uses`
      type: l.type,
      label: l.label,
      dashed: l.style?.dashed === true ? true : undefined,
      bidir: l.bidir === true ? true : undefined,
      head: l.style?.head,
      tail: l.style?.tail,
      line: l.style?.line,
      route: l.style?.route,
      width: l.style?.width,
      waypoints: l.waypoints?.map((w) => [w[0], w[1]] as [number, number]),
      fromAnchor: l.fromAnchor,
      toAnchor: l.toAnchor,
    }));
  return { objects, links };
}

/** File → canvas state; unparsable/empty text yields an empty state. */
export function pcdToState(text: string, viewName?: string): CanvasState {
  const { doc } = parsePDL(text);
  return doc === null ? { objects: [], links: [] } : docToState(doc, viewName);
}

/* ---- manager ------------------------------------------------------------ */

export interface WorkspaceDeps {
  storage?: StoragePort;
  /** Enable to skip the bootstrap welcome file (tests). */
  skipWelcome?: boolean;
}

export class WorkspaceManager {
  root: FsNode = newRoot();
  name = 'workspace';
  tabs: TabsState = initialTabs;
  /** FR-S2 private mode. */
  ephemeral = false;
  /** FR-S3 set when a quota error degraded the session. */
  quotaDegraded = false;
  /** Set when the stored record could not be opened (corrupt/newer). */
  openError: string | null = null;
  /** Persisted UI preferences (F-10/F-11); travels with the record, not the doc. */
  settings: WorkspaceSettings = {};

  private storage: StoragePort;
  private readonly autosaver: Autosaver;
  private readonly listeners = new Set<() => void>();
  private readonly skipWelcome: boolean;

  constructor(deps: WorkspaceDeps = {}) {
    this.storage = deps.storage ?? new MemoryStorage();
    this.skipWelcome = deps.skipWelcome ?? false;
    this.autosaver = new Autosaver({
      save: (ws) => this.storage.save(ws),
      onQuota: () => void this.degradeToEphemeral('storage quota exceeded'),
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Swap the backing store before init() (app wiring: IDB in the browser). */
  attachStorage(port: StoragePort): void {
    this.storage = port;
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }

  get activePath(): string | null {
    const t = this.tabs.tabs[this.tabs.active];
    return t?.path ?? null;
  }

  async init(): Promise<void> {
    try {
      const rec = await this.storage.load();
      if (rec) {
        this.root = rec.tree;
        this.name = rec.name;
        this.settings = rec.settings ?? {};
        this.tabs = this.restoreTabs(rec);
        this.emit();
        return;
      }
    } catch (err) {
      this.openError = err instanceof StoreError ? `${err.code}: ${err.message}` : String(err);
    }
    if (!this.skipWelcome) this.bootstrapWelcome();
    this.emit();
  }

  private restoreTabs(rec: StoredWorkspace): TabsState {
    let tabs = initialTabs;
    for (const p of rec.openTabs) {
      const node = getNode(this.root, p);
      if (node?.kind === 'file') tabs = openTab(tabs, p);
    }
    if (rec.activePath) {
      const idx = tabs.tabs.findIndex((t) => t.path === rec.activePath);
      if (idx !== -1) tabs = { tabs: tabs.tabs, active: idx };
    }
    return tabs;
  }

  private bootstrapWelcome(): void {
    createFile(this.root, 'untitled.pcd', '');
    this.tabs = openTab(this.tabs, 'untitled.pcd');
  }

  /** F-25: epoch ms of the last persisted write (0 = never). */
  lastSavedAt = 0;

  record(): StoredWorkspace {
    const rec = newStoredWorkspace(this.name);
    rec.savedAt = Date.now();
    this.lastSavedAt = rec.savedAt;
    rec.tree = this.root;
    rec.openTabs = this.tabs.tabs.map((t) => t.path);
    rec.activePath = this.activePath;
    rec.settings = this.settings;
    return rec;
  }

  /**
   * Merge one UI preference and persist it (F-10). Same durability rule as
   * document content (F-29): the record is flushed immediately, so a reload
   * right after a collapse/resize keeps the layout.
   */
  setSetting(key: keyof WorkspaceSettings, value: unknown): void {
    this.settings = { ...this.settings, [key]: value };
    this.emit();
    this.saveContent();
  }

  scheduleSave(): void {
    this.autosaver.schedule(this.record());
  }

  async flush(): Promise<void> {
    this.autosaver.schedule(this.record()); // latest state always wins
    await this.autosaver.flush();
  }

  /* ---- files + tabs ---- */

  text(path: string): string {
    return readFile(this.root, path);
  }

  /** Code view → file (format-on-save path; dirty + autosave). */
  saveText(path: string, text: string): void {
    const node = getNode(this.root, path);
    if (node?.kind === 'file' && node.content === text) return;
    writeFile(this.root, path, text);
    this.tabs = setDirty(this.tabs, path, true);
    this.emit();
    this.saveContent();
  }

  /**
   * F-29: document *content* is persisted immediately, not on the 800 ms
   * autosave debounce (FR-S1 keeps the debounce for UI churn — tab order,
   * focus). A reload/close inside the debounce window used to lose the edit:
   * `beforeunload` cannot await an IndexedDB write, so the pending record died
   * with the page.
   */
  private saveContent(): void {
    this.scheduleSave();
    void this.autosaver.flush();
  }

  openFile(path: string): void {
    this.tabs = openTab(this.tabs, path);
    this.emit();
  }

  closeTabAt(index: number): void {
    this.tabs = closeTab(this.tabs, index);
    this.emit();
    this.scheduleSave();
  }

  /** Reorder tabs (drag & drop); no-op for out-of-range indices. */
  moveTabAt(from: number, to: number): void {
    this.tabs = moveTab(this.tabs, from, to);
    this.emit();
    this.scheduleSave();
  }

  createFileAt(path: string, content = ''): void {
    createFile(this.root, path, content);
    this.tabs = openTab(this.tabs, path);
    this.emit();
    this.scheduleSave();
  }

  createFolderAt(path: string): void {
    createFile(this.root, `${path}/.keep`, '');
    deleteNode(this.root, `${path}/.keep`);
    this.emit();
    this.scheduleSave();
  }

  renamePath(path: string, newName: string): void {
    const parent = parentPath(path);
    renameNode(this.root, path, newName);
    const next = parent === '' ? newName : `${parent}/${newName}`;
    this.tabs = retargetTabs(this.tabs, path, next);
    this.emit();
    this.scheduleSave();
  }

  movePath(from: string, toDir: string): void {
    const target = `${toDir === '' ? '' : `${toDir}/`}${basename(from)}`;
    moveNode(this.root, from, toDir);
    this.tabs = retargetTabs(this.tabs, from, target);
    this.emit();
    this.scheduleSave();
  }

  duplicatePath(path: string): string {
    const copy = duplicateNode(this.root, path);
    this.emit();
    this.scheduleSave();
    return copy;
  }

  removePath(path: string): void {
    deleteNode(this.root, path);
    this.tabs = closeTabsUnder(this.tabs, path);
    this.emit();
    this.scheduleSave();
  }

  /* ---- canvas sync ---- */

  /** Canvas → workspace file; no-op when the serialized text is unchanged. */
  saveCanvas(path: string, state: CanvasState): void {
    const text = this.canvasText(path, state);
    const node = getNode(this.root, path);
    if (node?.kind === 'file' && node.content === text) return;
    writeFile(this.root, path, text);
    this.tabs = setDirty(this.tabs, path, true);
    this.emit();
    this.saveContent();
  }

  /**
   * Merge-based canvas write (F-01): the canvas only owns objects/links, so a
   * canvas edit is merged into the *current* document — flows, views,
   * positions, styles, imports, meta, comments, attributes, tags and waypoints
   * survive. Falls back to the bare projection when the file does not parse
   * (a typo must not block canvas saves).
   */
  private canvasText(path: string, state: CanvasState): string {
    const node = getNode(this.root, path);
    const current = node?.kind === 'file' ? (node.content ?? '') : '';
    const doc = this.parseForMerge(current);
    if (doc === null) return stateToPcd(state);
    return printDoc(applyCanvasState(doc, state));
  }

  /** parse memo: canvas saves re-parse the same text many times per drag end. */
  private parseForMerge(text: string): Doc | null {
    if (this.parseCache.text === text) return this.parseCache.doc;
    const { doc } = parsePDL(text);
    this.parseCache = { text, doc };
    return doc;
  }

  private parseCache: { text: string | null; doc: Doc | null } = { text: null, doc: null };

  /**
   * F-20: ghosts (imported objects as `alias.id`) plus import errors for a file.
   * Read-only: they render on the canvas but never enter the document.
   */
  importGhosts(path: string): { ghosts: Array<{ ref: string; alias: string; path: string; obj: Obj }>; errors: ImportError[] } {
    const text = readFile(this.root, path);
    const doc = this.parseForMerge(text);
    if (doc === null) return { ghosts: [], errors: [] };
    return resolveImportGhosts(doc, path, (p) => {
      const node = getNode(this.root, p);
      return node?.kind === 'file' ? (node.content ?? '') : null;
    });
  }

  /** File → canvas state (grid layout; empty text → empty state). */
  canvasState(path: string): CanvasState {
    const text = readFile(this.root, path);
    return text.trim() === '' ? { objects: [], links: [] } : pcdToState(text);
  }

  /** Called after the canvas applied a file (open/switch): not dirty anymore. */
  markClean(path: string): void {
    this.tabs = setDirty(this.tabs, path, false);
    this.emit();
  }

  /* ---- import/export (FR-W3/W4/W5) ---- */

  async exportZip(): Promise<Blob> {
    const entries = treeToEntries(this.root, { name: this.name, savedAt: Date.now() });
    const bytes = await packZip(entries);
    return new Blob([bytes as BlobPart], { type: 'application/zip' });
  }

  /** Replace the whole workspace from a ZIP archive. Returns the manifest name. */
  async importZip(bytes: Uint8Array): Promise<string> {
    const entries = await unpackZip(bytes);
    const { root, manifest } = entriesToTree(entries);
    this.root = root;
    this.name = manifest?.name ?? 'imported';
    this.tabs = initialTabs;
    this.emit();
    this.scheduleSave();
    return this.name;
  }

  /** Import files (FR-W3): mermaid sources convert to .pcd. Returns paths. */
  importFiles(files: Array<{ name: string; text: string }>): string[] {
    const paths: string[] = [];
    for (const f of files) {
      const converted = importText(f.name, f.text);
      writeFile(this.root, converted.path, converted.content);
      paths.push(converted.path);
    }
    if (paths.length > 0) {
      const last = paths[paths.length - 1];
      if (last) this.tabs = openTab(this.tabs, last);
    }
    this.emit();
    this.scheduleSave();
    return paths;
  }

  /** Per-file export as text (.pcd/.mmd); svg/png need the live canvas. */
  exportText(path: string, format: '.pcd' | '.mmd'): string {
    if (format === '.pcd') return exportPcd(this.root, path);
    return exportMmd(this.root, path).text;
  }

  files(): Array<{ path: string; node: FsNode }> {
    return filesUnder(this.root);
  }

  snapshotTree(): Array<{ path: string; content: string }> {
    return snapshotTree(this.root);
  }

  /**
   * M6-WP7 (FR-W7): adopt a stored workspace record — snapshots restore
   * point. Deep-copies the tree so the stored record stays pristine (it may
   * be restored again later); open tabs are re-resolved like init().
   */
  restoreRecord(rec: StoredWorkspace): void {
    this.root = structuredClone(rec.tree);
    this.name = rec.name;
    this.tabs = this.restoreTabs({ ...rec, openTabs: rec.openTabs.filter((p) => getNode(this.root, p)?.kind === 'file') });
    this.openError = null;
    this.emit();
    this.scheduleSave();
  }

  /* ---- storage lifecycle (FR-S2/S3/S4) ---- */

  /** FR-S4: wipe stored data + reset the session. */
  async clearAll(): Promise<void> {
    await this.storage.clear();
    this.root = newRoot();
    this.tabs = initialTabs;
    this.name = 'workspace';
    this.openError = null;
    this.settings = {};
    if (!this.ephemeral && !this.skipWelcome) this.bootstrapWelcome();
    this.emit();
  }

  /** FR-S2: switch between browser storage and in-memory mode. */
  async setEphemeral(on: boolean): Promise<void> {
    if (on === this.ephemeral) return;
    this.ephemeral = on;
    if (on) {
      this.autosaver.cancel();
      const memory = new MemoryStorage();
      await memory.save(this.record()); // carry the current workspace in-session
      this.storage = memory;
    } else {
      await this.autosaver.flush(); // commit to the real store before leaving
      this.storage = await createDefaultStorage();
    }
    this.emit();
  }

  /** FR-S3: quota failure ⇒ ephemeral for this session + degraded flag. */
  async degradeToEphemeral(reason: string): Promise<void> {
    if (this.ephemeral) return;
    this.quotaDegraded = true;
    this.openError = reason;
    await this.setEphemeral(true);
    this.emit();
  }
}

/** Rewrite tab paths after rename/move (also updates descendants). */
function retargetTabs(tabs: TabsState, from: string, to: string): TabsState {
  const prefix = `${from}/`;
  const remap = (p: string): string =>
    p === from ? to : p.startsWith(prefix) ? `${to}/${p.slice(prefix.length)}` : p;
  const nextTabs = tabs.tabs.map((t) => ({ ...t, path: remap(t.path) }));
  const activePath = tabs.tabs[tabs.active]?.path;
  const idx = activePath === undefined ? -1 : nextTabs.findIndex((t) => t.path === remap(activePath));
  return { tabs: nextTabs, active: idx === -1 ? tabs.active : idx };
}

/** Close all tabs whose path is the removed node or inside it. */
function closeTabsUnder(tabs: TabsState, path: string): TabsState {
  const prefix = `${path}/`;
  let next = tabs;
  for (let i = tabs.tabs.length - 1; i >= 0; i--) {
    const p = tabs.tabs[i]?.path;
    if (p && (p === path || p.startsWith(prefix))) next = closeTab(next, i);
  }
  return next;
}

export { SCHEMA_VERSION, StoreError, FsError };
