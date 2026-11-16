// SPDX-License-Identifier: GPL-3.0-only
// Icon field + picker + project-icon management (IR v9, FILE-FORMAT §3.1).
//
// Three pieces, one concern each:
//   * IconField    — the properties-panel control: the handle stays editable as
//                    text (fast path, and it is what the file stores) with a
//                    searchable picker next to it.
//   * IconPicker   — the listbox itself: built-ins by label/category/keyword
//                    plus the document's own icons with a live preview.
//   * IconManager  — add/import/rename/remove project icons. Rename and remove
//                    go through the pure ops in engine/model/iconOps.ts and are
//                    committed as ONE document change, so a rename that touches
//                    many objects is a single undo step.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { IconDecl, Doc } from '../engine/model/types';
import { builtinIcon, searchBuiltinIcons, type BuiltinIcon } from '../engine/model/icons';
import {
  addIcon, declarationProblem, handleProblem, iconInventory, removeIcon, renameIcon, replaceIcon,
} from '../engine/model/iconOps';
import { ICONS } from '../engine/render/icons';
import { iconAssetsOf, iconDataUri, iconProblem } from '../engine/render/iconAssets';
import { ingestIconInput } from '../workspace/iconIngest';
import { s } from './strings';

const iconLabel = (decl: IconDecl): string => decl.label ?? decl.id;

/** Inline thumbnail of a built-in glyph (paths from the drawn module). */
function BuiltinThumb(props: { name: string }) {
  return (
    <svg class="icon-thumb" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {(ICONS[props.name] ?? []).map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** Thumbnail of a project icon; an unusable payload shows why instead of drawing. */
function ProjectThumb(props: { decl: IconDecl }) {
  const asset = useMemo(() => iconAssetsOf({ icons: [props.decl] } as Doc).get(props.decl.id), [props.decl]);
  const problem = useMemo(() => iconProblem(props.decl), [props.decl]);
  if (problem !== null || asset === undefined) {
    return <span class="icon-thumb icon-thumb-broken" title={problem ?? s('icon cannot be drawn')}>!</span>;
  }
  return <img class="icon-thumb" src={iconDataUri(asset)} alt="" />;
}

export interface IconPickerProps {
  /** Current handle, if any. */
  value?: string;
  /** Document icons for this file. */
  project: IconDecl[];
  onPick(name: string | undefined): void;
  onManage(): void;
  onClose(): void;
}

/** Searchable built-in + project icon listbox. */
export function IconPicker(props: IconPickerProps) {
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const builtins: BuiltinIcon[] = useMemo(() => searchBuiltinIcons(query), [query]);
  const q = query.trim().toLowerCase();
  const project = props.project.filter(
    (d) => q === '' || d.id.includes(q) || iconLabel(d).toLowerCase().includes(q),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose();
    };
    const onDown = (e: MouseEvent): void => {
      if (boxRef.current !== null && !boxRef.current.contains(e.target as Node)) props.onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [props]);

  const pick = (name: string | undefined): void => {
    props.onPick(name);
    props.onClose();
  };

  return (
    <div class="icon-picker" data-testid="icon-picker" role="dialog" aria-label={s('Choose an icon')} ref={boxRef}>
      <input
        class="icon-picker-search"
        data-testid="icon-search"
        placeholder={s('search icons…')}
        value={query}
        autoFocus
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      <ul class="icon-picker-list" role="listbox" aria-label={s('Icons')}>
        <li>
          <button
            type="button"
            class="icon-option"
            data-testid="icon-option-none"
            aria-selected={props.value === undefined}
            onClick={() => pick(undefined)}
          >
            <span class="icon-thumb icon-thumb-none" aria-hidden="true">∅</span>
            <span class="icon-option-label">{s('no icon')}</span>
          </button>
        </li>
        {project.length > 0 && (
          <li class="icon-group" role="presentation">{s('This file')}</li>
        )}
        {project.map((decl) => (
          <li key={`p-${decl.id}`}>
            <button
              type="button"
              class="icon-option"
              data-testid={`icon-option-${decl.id}`}
              aria-selected={props.value === decl.id}
              onClick={() => pick(decl.id)}
            >
              <ProjectThumb decl={decl} />
              <span class="icon-option-label">{iconLabel(decl)}</span>
              <span class="icon-option-meta">{decl.id}</span>
            </button>
          </li>
        ))}
        {builtins.length > 0 && <li class="icon-group" role="presentation">{s('Built-in')}</li>}
        {builtins.map((icon) => (
          <li key={icon.name}>
            <button
              type="button"
              class="icon-option"
              data-testid={`icon-option-${icon.name}`}
              aria-selected={props.value === icon.name}
              onClick={() => pick(icon.name)}
            >
              <BuiltinThumb name={icon.name} />
              <span class="icon-option-label">{icon.label}</span>
              <span class="icon-option-meta">{icon.category}</span>
            </button>
          </li>
        ))}
        {builtins.length === 0 && project.length === 0 && (
          <li class="icon-empty">{s('no icons match “{query}”', { query })}</li>
        )}
      </ul>
      <div class="icon-picker-actions">
        <button type="button" data-testid="icon-manage" onClick={props.onManage}>
          {s('Manage project icons…')}{' '}</button>
      </div>
    </div>
  );
}

/** Properties-panel field: handle text input + picker trigger. */
export function IconField(props: {
  value?: string;
  project: IconDecl[];
  onChange(name: string | undefined): void;
  onManage(): void;
}) {
  const [open, setOpen] = useState(false);
  const known = props.value !== undefined && (builtinIcon(props.value) !== undefined ||
    props.project.some((d) => d.id === props.value));
  const label = props.value === undefined ? s('(none)') : known ? props.value : s('{name} (unknown)', { name: props.value });
  return (
    <div class="icon-field">
      <input
        data-testid="prop-style-icon"
        value={props.value ?? ''}
        placeholder={s('(none)')}
        aria-label={s('Icon')}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          props.onChange(v === '' ? undefined : v);
        }}
      />
      <button
        type="button"
        class="icon-picker-trigger"
        data-testid="icon-picker-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen(!open)}
      >
        {props.value !== undefined && builtinIcon(props.value) !== undefined ? (
          <BuiltinThumb name={props.value} />
        ) : props.value !== undefined && props.project.some((d) => d.id === props.value) ? (
          <ProjectThumb decl={props.project.find((d) => d.id === props.value) as IconDecl} />
        ) : (
          <span class="icon-thumb icon-thumb-none" aria-hidden="true">∅</span>
        )}
        <span class="visually-hidden">{s('Choose an icon')}</span>
      </button>
      {open && (
        <IconPicker
          value={props.value}
          project={props.project}
          onPick={props.onChange}
          onManage={() => {
            setOpen(false);
            props.onManage();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export interface IconManagerProps {
  /** Live document (icons + the objects/styles that reference them). */
  doc: Doc;
  /** Commit one atomic, undoable document change. */
  onCommit(next: Doc, label: string): void;
  onClose(): void;
}

/** Add / import / rename / remove project icons, with usage checks. */
/** Handlers of the manager, kept out of the render so each stays readable. */
function useIconActions(props: IconManagerProps) {
  const [error, setError] = useState<string | null>(null);

  const add = (draft: string, labelled: string): boolean => {
    const ingested = ingestIconInput(draft);
    if (ingested.data === null) {
      setError(ingested.error ?? s('that icon cannot be used'));
      return false;
    }
    // A handle is required before the payload can be stored: derive one from the
    // label when the author did not name it, then make it unique.
    const base = (labelled.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'icon')
      .replace(/^[^a-z]+/, '');
    let handle = base === '' ? 'icon' : base;
    for (let i = 2; handleProblem(props.doc, handle) !== null && i < 100; i += 1) handle = `${base}${i}`;
    const handleIssue = handleProblem(props.doc, handle);
    if (handleIssue !== null) {
      setError(handleIssue);
      return false;
    }
    const decl: IconDecl = {
      id: handle,
      label: labelled.trim() === '' ? undefined : labelled.trim(),
      mediaType: 'image/svg+xml',
      data: ingested.data,
      pos: { line: 0, col: 0 },
    };
    const payload = declarationProblem(decl);
    if (payload !== null) {
      setError(payload);
      return false;
    }
    props.onCommit(addIcon(props.doc, decl), `icon add: ${handle}`);
    setError(null);
    return true;
  };

  const rename = (from: string, to: string): boolean => {
    const problem = handleProblem(props.doc, to, from);
    if (problem !== null) {
      setError(problem);
      return false;
    }
    const { doc } = renameIcon(props.doc, from, to);
    props.onCommit(doc, `icon rename: ${from} → ${to}`);
    setError(null);
    return true;
  };

  const remove = (id: string, refs: number): void => {
    const first = removeIcon(props.doc, id);
    // Never a silent broken reference: ask, then clear the references too.
    const asked = first.ok ||
      window.confirm(s('Icon “{name}” is used {count} time(s). Remove it and clear those references?', { name: id, count: String(refs) }));
    if (!asked) return;
    const done = removeIcon(props.doc, id, true);
    if (!done.ok) return;
    props.onCommit(done.doc, `icon remove: ${id}`);
    setError(null);
  };

  const replace = (id: string, input: string): void => {
    const current = props.doc.icons.find((d) => d.id === id);
    if (current === undefined) return;
    const ingested = ingestIconInput(input);
    if (ingested.data === null) {
      setError(ingested.error ?? s('that icon cannot be used'));
      return;
    }
    props.onCommit(replaceIcon(props.doc, { ...current, data: ingested.data }), `icon replace: ${id}`);
    setError(null);
  };

  return { error, setError, add, rename, remove, replace };
}

/** Read a chosen file as text and hand it to the add form or a replace. */
function readIconFile(file: File, onText: (text: string, name: string) => void, onError: () => void): void {
  file
    .text()
    .then((text) => onText(text, file.name.replace(/\.svg$/i, '')))
    .catch(onError);
}

/** One declaration row: preview, handle, usage count and its actions. */
function IconRow(props: {
  decl: IconDecl;
  refs: number;
  renaming: { from: string; to: string } | null;
  onRenaming(next: { from: string; to: string } | null): void;
  onRename(from: string, to: string): void;
  onReplace(id: string, text: string): void;
  onRemove(id: string, refs: number): void;
  onError(): void;
}) {
  const { decl, refs } = props;
  const renaming = props.renaming !== null && props.renaming.from === decl.id ? props.renaming : null;
  return (
    <li class="icon-manager-row">
      <ProjectThumb decl={decl} />
      <span class="icon-manager-name">
        {renaming !== null ? (
          <input
            data-testid={`icon-rename-${decl.id}`}
            value={renaming.to}
            autoFocus
            onInput={(e) => props.onRenaming({ from: decl.id, to: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onRename(decl.id, renaming.to.trim());
              if (e.key === 'Escape') props.onRenaming(null);
            }}
          />
        ) : (
          <>
            <strong>{iconLabel(decl)}</strong>
            <span class="muted">{decl.id}</span>
          </>
        )}
      </span>
      <span class="icon-manager-refs muted">
        {refs === 0 ? s('unused') : s('used {count}×', { count: String(refs) })}
      </span>
      <span class="icon-manager-actions">
        <button
          type="button"
          data-testid={`icon-rename-start-${decl.id}`}
          onClick={() => props.onRenaming({ from: decl.id, to: decl.id })}
        >
          {s('rename')}{' '}
        </button>
        <label class="icon-file">
          {s('replace')}
          <input
            type="file"
            accept=".svg,image/svg+xml"
            data-testid={`icon-replace-${decl.id}`}
            onChange={(e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file !== undefined) readIconFile(file, (text) => props.onReplace(decl.id, text), props.onError);
            }}
          />
        </label>
        <button type="button" data-testid={`icon-remove-${decl.id}`} onClick={() => props.onRemove(decl.id, refs)}>
          {s('remove')}{' '}
        </button>
      </span>
    </li>
  );
}

/** Add form: label + payload (paste or import), and the Add action. */
function IconAddForm(props: { onAdd(draft: string, label: string): boolean; onError(): void }) {
  const [label, setLabel] = useState('');
  const [draft, setDraft] = useState('');
  return (
    <div class="icon-manager-add">
      <label class="field">
        <span class="field-label">{s('Name')}</span>
        <input
          data-testid="icon-add-label"
          placeholder={s('Company logo')}
          value={label}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="field">
        <span class="field-label">{s('SVG markup, data: URI or Base64')}</span>
        <textarea
          data-testid="icon-add-data"
          rows={3}
          placeholder={s('paste an SVG icon…')}
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <label class="icon-file icon-import">
        {s('import .svg…')}
        <input
          type="file"
          accept=".svg,image/svg+xml"
          data-testid="icon-import-file"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file === undefined) return;
            readIconFile(file, (text, name) => {
              setDraft(text);
              setLabel(name);
            }, props.onError);
          }}
        />
      </label>
      <button
        type="button"
        data-testid="icon-add"
        disabled={draft.trim() === ''}
        onClick={() => {
          if (props.onAdd(draft, label)) {
            setDraft('');
            setLabel('');
          }
        }}
      >
        {s('Add icon')}{' '}
      </button>
    </div>
  );
}

/** Add / import / rename / remove project icons, with usage checks. */
export function IconManagerDialog(props: IconManagerProps) {
  const actions = useIconActions(props);
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const inventory = iconInventory(props.doc);
  return (
    <div class="dialog-overlay" data-testid="icon-manager-overlay">
      <div class="dialog icon-manager" role="dialog" aria-label={s('Project icons')}>
        <h2>{s('Project icons')}</h2>
        <p class="muted">
          {s('Icons declared in this file travel with it — no network, no external files. Built-in icons are always available.')}
        </p>
        <ul class="icon-manager-list" data-testid="icon-manager-list">
          {inventory.length === 0 && <li class="deps-empty">{s('no project icons yet')}</li>}
          {inventory.map(({ decl, refs }) => (
            <IconRow
              key={decl.id}
              decl={decl}
              refs={refs}
              renaming={renaming}
              onRenaming={setRenaming}
              onRename={(from, to) => {
                if (actions.rename(from, to)) setRenaming(null);
              }}
              onReplace={actions.replace}
              onRemove={actions.remove}
              onError={() => actions.setError(s('that file could not be read'))}
            />
          ))}
        </ul>
        <IconAddForm
          onAdd={(draft, label) => actions.add(draft, label)}
          onError={() => actions.setError(s('that file could not be read'))}
        />
        {actions.error !== null && (
          <p class="icon-manager-error" role="alert" data-testid="icon-manager-error">{actions.error}</p>
        )}
        <div class="dialog-actions">
          <button type="button" data-testid="icon-manager-close" onClick={props.onClose}>
            {s('close')}{' '}
          </button>
        </div>
      </div>
    </div>
  );
}
