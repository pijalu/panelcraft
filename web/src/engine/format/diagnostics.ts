// SPDX-License-Identifier: GPL-3.0-only
// Shared diagnostic shape (M1-WP2). Syntax codes E1xx (parse-abort, this file's
// consumers); semantic codes P1xx/P2xx live in engine/model/validate.ts.

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string;
  message: string;
  line: number;
  col: number;
  severity: Severity;
}

/** Syntax error codes (grammar aborts the file; see FILE-FORMAT §10 errata). */
export const E = {
  unexpected: 'E100',
  unterminatedString: 'E101',
  invalidIdent: 'E102',
  invalidVersion: 'E103',
  unclosedBlock: 'E104',
  unknownTopLevel: 'E105',
  invalidEscape: 'E106',
  strayClose: 'E107',
  invalidArrow: 'E108',
  invalidNumber: 'E109',
  duplicateAttr: 'E110',
  invalidColor: 'E111',
  nestingTooDeep: 'E112',
  invalidGoto: 'E113',
  /** Icon declaration payload is not canonical Base64 (IR v9, §3.1). */
  invalidIconData: 'E114',
  /** Icon declaration names a media type this version cannot draw (§3.1). */
  invalidIconMedia: 'E115',
  /** `source` block with no `text` line — nothing to show or print (§3.3). */
  emptySource: 'E116',
  /** Legacy named `view` block — views were removed (ADR 0007). */
  legacyView: 'E117',
  /** Legacy `drilldown … view <id>` — named view on a child (ADR 0007). */
  legacyDrilldownView: 'E118',
  /** Flow description block with no `text` line (§6). */
  emptyFlowDescription: 'E119',
  /** Step prose block with no `text` line — nothing to show or print (§6). */
  emptyStepText: 'E120',
} as const;

export const diag = (
  code: string,
  message: string,
  line: number,
  col: number,
  severity: Severity = 'error',
): Diagnostic => ({ code, message, line, col, severity });
