// SPDX-License-Identifier: GPL-3.0-only
import { UpdateBanner, type UpdateBannerProps } from './UpdateBanner';
import { s } from './strings';

// M3 status banners: corrupt-record open error, quota degradation (FR-S3),
// private mode + its 10-minute reminder (FR-S2), transient flash (export
// failures etc.), plus the UX08-WP04 update offer. Each surface is its own small
// component so this list stays a plain composition.
export interface BannersProps {
  openError: string | null;
  quotaDegraded: boolean;
  ephemeral: boolean;
  reminder: boolean;
  onDismissError: () => void;
  onDismissReminder: () => void;
  /** UX08-WP04: a waiting service worker the user may activate. */
  update?: UpdateBannerProps | null;
}

function ErrorBanner(props: { message: string; onDismiss: () => void }) {
  return (
    <div class="banner banner-error" data-testid="banner-open-error" role="alert">
      <span>{s("Could not open saved workspace:")}{' '}{props.message}</span>
      <button type="button" onClick={props.onDismiss}>{s("dismiss")}</button>
    </div>
  );
}

function EphemeralBanner(props: { reminder: boolean; onDismiss: () => void }) {
  return (
    <div class="banner banner-warn" data-testid="banner-ephemeral" role="status">
      <span>
        {props.reminder
          ? s('Reminder: private mode is on — changes are not persisted (FR-S2).')
          : s('Private mode: changes are kept in memory only.')}
      </span>
      {props.reminder && <button type="button" onClick={props.onDismiss}>{s("dismiss")}</button>}
    </div>
  );
}

export function Banners(props: BannersProps) {
  const { quotaDegraded, ephemeral, reminder, openError } = props;
  const nodes = [
    props.update === null || props.update === undefined ? null : <UpdateBanner {...props.update} />,
    openError === null ? null : <ErrorBanner message={openError} onDismiss={props.onDismissError} />,
    quotaDegraded ? (
      <div class="banner banner-warn" data-testid="banner-quota" role="alert">
        <span>{s("Storage quota exceeded — this session is in-memory only (FR-S3).")}</span>
      </div>
    ) : null,
    (ephemeral && !quotaDegraded) || reminder ? (
      <EphemeralBanner reminder={reminder} onDismiss={props.onDismissReminder} />
    ) : null,
  ].filter((node) => node !== null);
  if (nodes.length === 0) return null;
  return <div class="banners">{nodes}</div>;
}
