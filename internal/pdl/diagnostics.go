// SPDX-License-Identifier: GPL-3.0-only

// Package pdl is the Go port of the TS format engine (web/src/engine/format +
// model validation) — same grammar tables, same error codes (M1-WP7). Parity
// with the TS reference is a gate: internal/pdl/pdl_test.go replays the shared
// fixture testdata/pdl-cases.json, generated from the TS engine by
// web/src/engine/format/parity.test.ts (CORPUS_FIXTURE=1).
package pdl

// Severity of a diagnostic (§10).
type Severity string

// Diagnostic severities.
const (
	SevError   Severity = "error"
	SevWarning Severity = "warning"
	SevInfo    Severity = "info"
)

// Diagnostic is one finding. Syntax codes E1xx abort the parse (doc = nil);
// semantic codes P1xx/P2xx and converter codes M1xx/M2xx never abort.
type Diagnostic struct {
	Code     string   `json:"code"`
	Message  string   `json:"message"`
	Line     int      `json:"line"`
	Col      int      `json:"col"`
	Severity Severity `json:"severity"`
}

// Syntax error codes (FILE-FORMAT §10; identical to TS diagnostics.ts).
const (
	ErrUnexpected      = "E100"
	ErrUnterminatedStr = "E101"
	ErrInvalidIdent    = "E102"
	ErrInvalidVersion  = "E103"
	ErrUnclosedBlock   = "E104"
	ErrUnknownTopLevel = "E105"
	ErrInvalidEscape   = "E106"
	ErrStrayClose      = "E107"
	ErrInvalidArrow    = "E108"
	ErrInvalidNumber   = "E109"
	ErrDuplicateAttr   = "E110"
	ErrInvalidColor    = "E111"
	ErrNestingTooDeep  = "E112"
	ErrInvalidGoto     = "E113"
	// ErrInvalidIconData: icon payload is not canonical Base64 (IR v9, §3.1).
	ErrInvalidIconData = "E114"
	// ErrInvalidIconMedia: icon names a media type this version cannot draw.
	ErrInvalidIconMedia = "E115"
)

// Semantic warning codes mirrored from TS validate.ts.
const (
	WDuplicateMeta = "W100"
)

func diag(code, msg string, line, col int) Diagnostic {
	return Diagnostic{Code: code, Message: msg, Line: line, Col: col, Severity: SevError}
}

func diagSev(code, msg string, line, col int, sev Severity) Diagnostic {
	return Diagnostic{Code: code, Message: msg, Line: line, Col: col, Severity: sev}
}
