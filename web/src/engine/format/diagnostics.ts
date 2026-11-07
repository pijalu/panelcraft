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
} as const;

export const diag = (
  code: string,
  message: string,
  line: number,
  col: number,
  severity: Severity = 'error',
): Diagnostic => ({ code, message, line, col, severity });
