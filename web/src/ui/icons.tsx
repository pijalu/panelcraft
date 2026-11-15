// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP03: the owned inline icon set. Unicode glyphs render differently per
// platform font, so chrome controls use 16 px stroke icons drawn here instead.
// Every icon is decorative: its button carries the accessible name.
import type { ComponentChildren } from 'preact';

const SIZE = 16;

function Icon(props: { children: ComponentChildren; class?: string }): ComponentChildren {
  return (
    <svg
      class={props.class ?? 'pc-icon'}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

/** Application menu trigger. */
export function MenuIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </Icon>
  );
}

/** Panel actions trigger (overflow). */
export function MoreIcon(): ComponentChildren {
  return (
    <Icon>
      <circle cx="8" cy="3.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12.8" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Collapse a panel towards its rail. */
export function ChevronLeftIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M9.5 3.5 5 8l4.5 4.5" />
    </Icon>
  );
}

/** Expand a rail back into a panel. */
export function ChevronRightIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M6.5 3.5 11 8l-4.5 4.5" />
    </Icon>
  );
}

/** Discloses a menu submenu. */
export function SubmenuIcon(): ComponentChildren {
  return (
    <Icon class="pc-icon pc-icon-submenu">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Icon>
  );
}

/** Expanded disclosure for a properties section. */
export function DisclosureOpenIcon(): ComponentChildren {
  return (
    <Icon class="pc-icon pc-icon-disclosure">
      <path d="M3.5 6 8 10.5 12.5 6" />
    </Icon>
  );
}

/** Collapsed disclosure for a properties section. */
export function DisclosureClosedIcon(): ComponentChildren {
  return (
    <Icon class="pc-icon pc-icon-disclosure">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Icon>
  );
}

/** Checked menu item. */
export function CheckIcon(): ComponentChildren {
  return (
    <Icon class="pc-icon pc-icon-check">
      <path d="M3 8.5 6.5 12 13 4.5" />
    </Icon>
  );
}

/** Playback paused (the control starts playing). */
export function PlayIcon(): ComponentChildren {
  return (
    <Icon class="pc-icon pc-icon-play">
      <path d="M5 3.2v9.6L12.5 8z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Playback running (the control pauses). */
export function PauseIcon(): ComponentChildren {
  return (
    <Icon class="pc-icon pc-icon-play">
      <path d="M5.5 3v10M10.5 3v10" />
    </Icon>
  );
}

/** Enter the chrome-free presentation shell. */
export function FullscreenIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" />
    </Icon>
  );
}

/** Restart playback from the first step. */
export function RestartIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M2.8 8a5.2 5.2 0 1 0 1.7-3.9" />
      <path d="M2.5 2.8v3.4h3.4" />
    </Icon>
  );
}

/** Previous step. */
export function StepBackIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M3.5 3v10M12.5 3.6 6 8l6.5 4.4z" />
    </Icon>
  );
}

/** Next step. */
export function StepForwardIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M12.5 3v10M3.5 3.6 10 8l-6.5 4.4z" />
    </Icon>
  );
}

/** Dismiss a transient surface. */
export function CloseIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

/** Copy a file or step. */
export function CopyIcon(): ComponentChildren {
  return (
    <Icon>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 3.5H4.2A1.7 1.7 0 0 0 2.5 5.2v6.3" />
    </Icon>
  );
}

/** Rename an existing item in place. */
export function PencilIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M11 2.6 13.4 5 5.6 12.8l-3 .6.6-3z" />
    </Icon>
  );
}

/** First step of a flow. */
export function StepFirstIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M3.5 3v10M12.5 3.6 5 8l7.5 4.4z" />
    </Icon>
  );
}

/** Last step of a flow. */
export function StepLastIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M12.5 3v10M3.5 3.6 11 8l-7.5 4.4z" />
    </Icon>
  );
}

/** Move an item earlier in a list. */
export function ArrowUpIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M8 13V3.5M4 7.5 8 3.5l4 4" />
    </Icon>
  );
}

/** Move an item later in a list. */
export function ArrowDownIcon(): ComponentChildren {
  return (
    <Icon>
      <path d="M8 3v9.5M4 8.5 8 12.5l4-4" />
    </Icon>
  );
}
