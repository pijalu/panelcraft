// SPDX-License-Identifier: GPL-3.0-only
// Drill-down chrome (IR v10, FILE-FORMAT.md §3.2): the breadcrumb trail above the canvas,
// the parent-context boundary of a subordinate diagram, and the findings that
// explain why a relation cannot be opened.
//
// Coexistence rule — ghosts are dashed read-only *objects* inside the
// diagram; this bar is navigation *between* diagrams. Nothing here is drawn as an
// edge, so a decomposed system never looks like it has an extra link.
import type { ComponentChildren } from 'preact';
import type { DrilldownHandle } from './useDrilldown';
import { contextLabel } from './drillTrail';
import { s } from './strings';

export interface DrillBarProps {
  drill: DrilldownHandle;
}

/** Findings line: the count plus the first message, dismissable. */
function Notice(props: { message: string; onDismiss: () => void }): ComponentChildren {
  return (
    <p class="drill-notice" role="alert" data-testid="drill-notice">
      <span>{props.message}</span>
      <button type="button" class="drill-dismiss" onClick={props.onDismiss}>
        {s('Dismiss')}
      </button>
    </p>
  );
}

/** Breadcrumbs: the root file first, the current diagram last. */
function Crumbs(props: { drill: DrilldownHandle }): ComponentChildren {
  const { crumbs, goTo } = props.drill;
  if (crumbs.length < 2) return null;
  return (
    <nav class="drill-crumbs" aria-label={s('Diagram hierarchy')} data-testid="drill-crumbs">
      <ol>
        {crumbs.map((crumb) => (
          <li key={`${crumb.index}:${crumb.path}`}>
            {crumb.current ? (
              <span class="drill-current" aria-current="page">{crumb.label}</span>
            ) : (
              <button
                type="button"
                class="drill-crumb"
                onClick={() => goTo(crumb.index)}
                title={crumb.path}
              >
                {s('Back to {label}', { label: crumb.label })}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Parent boundary of a subordinate diagram: the element and file this diagram
 * was opened from, so the child is never mistaken for a top-level document.
 */
export function ParentContext(props: { parent: NonNullable<DrilldownHandle['parent']> }): ComponentChildren {
  const label = contextLabel(props.parent);
  return (
    <p class="pc-parent-context" data-testid="parent-context" title={props.parent.path}>
      {s('Opened from {label}', { label })}
    </p>
  );
}

/** Hierarchy findings of the open file (duplicate/broken/cyclic relations). */
function Findings(props: { drill: DrilldownHandle }): ComponentChildren {
  const { issues } = props.drill;
  if (issues.length === 0) return null;
  const first = issues[0];
  if (first === undefined) return null;
  return (
    <p class="drill-findings" role="status" data-testid="hierarchy-findings">
      {issues.length} {s('hierarchy problem')}{issues.length === 1 ? '' : s('s')}{s(':')}{' '}
      {first.message}
    </p>
  );
}

export function DrillBar({ drill }: DrillBarProps): ComponentChildren {
  const notice = drill.notice;
  const parent = drill.parent;
  const empty = drill.crumbs.length < 2 && parent === undefined && notice === null;
  if (empty && drill.issues.length === 0) return null;
  return (
    <div class="drill-bar" data-testid="drill-bar">
      {notice !== null && <Notice message={notice} onDismiss={drill.dismissNotice} />}
      <Crumbs drill={drill} />
      {parent !== undefined && <ParentContext parent={parent} />}
      <Findings drill={drill} />
    </div>
  );
}
