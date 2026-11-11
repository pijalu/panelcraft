// SPDX-License-Identifier: GPL-3.0-only
import { s } from './strings';
// M3 status banners: corrupt-record open error, quota degradation (FR-S3),
// private mode + its 10-minute reminder (FR-S2), transient flash (export
// failures etc.).
export interface BannersProps {
  openError: string | null;
  quotaDegraded: boolean;
  ephemeral: boolean;
  reminder: boolean;
  onDismissError: () => void;
  onDismissReminder: () => void;
}

export function Banners(props: BannersProps) {
  const { openError, quotaDegraded, ephemeral, reminder } = props;
  const showBadge = ephemeral && !quotaDegraded;
  if (!openError && !quotaDegraded && !showBadge && !reminder) return null;
  return (
    <div class="banners">
      {openError !== null && (
        <div class="banner banner-error" data-testid="banner-open-error" role="alert">
          <span>{s("Could not open saved workspace:")}{' '}{openError}</span>
          <button type="button" onClick={props.onDismissError}>{s("dismiss")}</button>
        </div>
      )}
      {quotaDegraded && (
        <div class="banner banner-warn" data-testid="banner-quota" role="alert">
          <span>{s("Storage quota exceeded — this session is in-memory only (FR-S3).")}</span>
        </div>
      )}
      {(showBadge || reminder) && (
        <div class="banner banner-warn" data-testid="banner-ephemeral" role="status">
          <span>
            {reminder
                ? s('Reminder: private mode is on — changes are not persisted (FR-S2).')
                : s('Private mode: changes are kept in memory only.')}
          </span>
          {reminder && <button type="button" onClick={props.onDismissReminder}>{s("dismiss")}</button>}
        </div>
      )}
    </div>
  );
}
