// SPDX-License-Identifier: GPL-3.0-only
// UX08-WP04: the "Update available" banner. Its own component keeps the shared
// Banners list within the complexity gate and makes the two actions explicit:
// Restart is an intentional consent, Later only hides the offer.
import { s } from './strings';

export interface UpdateBannerProps {
  /** Unapplied editor work the restart would discard, named in the copy. */
  unapplied: string | null;
  onRestart: () => void;
  onLater: () => void;
}

export function UpdateBanner(props: UpdateBannerProps) {
  return (
    <div class="banner banner-update" data-testid="banner-update" role="status">
      <span>
        {props.unapplied === null
          ? s('Update available. Restart to load the new version, or choose Later to keep working.')
          : s('Unapplied code in {path} will be discarded. Restart anyway?', { path: props.unapplied })}
      </span>
      <button type="button" class="banner-primary" data-testid="update-restart" onClick={props.onRestart}>
        {s("Restart")}
      </button>
      <button type="button" data-testid="update-later" onClick={props.onLater}>{s("Later")}</button>
    </div>
  );
}
