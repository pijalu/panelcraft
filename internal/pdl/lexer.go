// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"regexp"
	"strings"
)

// TokenType mirrors TS lexer.ts.
type TokenType string

// Token types.
const (
	TokIdent   TokenType = "ident"
	TokString  TokenType = "string"
	TokNumber  TokenType = "number"
	TokColor   TokenType = "color"
	TokArrow   TokenType = "arrow"
	TokPunct   TokenType = "punct"
	TokComment TokenType = "comment"
	TokEOF     TokenType = "eof"
)

// ArrowInfo captures the arrow grammar (§4): [`<`] `-` [ type `-` ] [`>`].
type ArrowInfo struct {
	Tail bool   // '<' present
	Head bool   // '>' present
	Type string // explicit link type (`-requests->` → requests)
}

// Token is one lexeme. Value carries the decoded string payload.
// Cols count bytes, so non-ASCII text shifts later columns on a line vs the
// TS engine (UTF-16 units); the grammar itself is ASCII-only.
type Token struct {
	Type  TokenType
	Text  string
	Value string // decoded string value (strings only)
	Arrow *ArrowInfo
	Line  int
	Col   int
	Start int
	End   int
}

// LexResult carries tokens (always ending in eof) + diagnostics.
type LexResult struct {
	Tokens      []Token
	Diagnostics []Diagnostic
}

type scanOut struct {
	tok *Token
	i   int
	col int
}

var (
	reArrowIdent = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,63}`)
	reNumber     = regexp.MustCompile(`^-?[0-9]+(?:\.[0-9]+)?`)
	reIdent      = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{0,63}`)
)

func mk(t TokenType, text string, i, end, line, col int) Token {
	return Token{Type: t, Text: text, Line: line, Col: col, Start: i, End: end}
}

func isIdentChar(c byte) bool {
	return c == '_' || c == '-' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

func isDigitByte(c byte) bool { return c >= '0' && c <= '9' }

func isHexByte(c byte) bool {
	return isDigitByte(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

func isDelimByte(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v' ||
		c == '{' || c == '}' || c == ':' || c == ',' || c == ')'
}

// colorLen reports the length of a #rgb/#rrggbb color at i (§1: '#' + 3 or 6
// hex digits + delimiter; errata E-COLOR: otherwise the '#' starts a comment).
func colorLen(src string, i int) int {
	if i >= len(src) || src[i] != '#' {
		return 0
	}
	for _, n := range []int{6, 3} {
		if i+1+n <= len(src) && allHex(src[i+1:i+1+n]) && (i+1+n >= len(src) || !isHexByte(src[i+1+n])) {
			return n + 1
		}
	}
	return 0
}

func allHex(s string) bool {
	for k := 0; k < len(s); k++ {
		if !isHexByte(s[k]) {
			return false
		}
	}
	return len(s) > 0
}

// scanHash: color when the shape matches, else a comment to end of line.
func scanHash(src string, i, line, col int, _ *[]Diagnostic) scanOut {
	if n := colorLen(src, i); n > 0 && (i+n >= len(src) || isDelimByte(src[i+n])) {
		tok := mk(TokColor, src[i:i+n], i, i+n, line, col)
		return scanOut{tok: &tok, i: i + n, col: col + n}
	}
	j := i
	for j < len(src) && src[j] != '\n' && src[j] != '\r' {
		j++
	}
	tok := mk(TokComment, strings.TrimSpace(src[i+1:j]), i, j, line, col)
	return scanOut{tok: &tok, i: j, col: col + (j - i)}
}

// scanSlash: `//` line comment (errata D-M1-19, SPDX compatibility); a single
// `/` is E100 (`/` has no other grammar use).
func scanSlash(src string, i, line, col int, diags *[]Diagnostic) scanOut {
	if i+1 >= len(src) || src[i+1] != '/' {
		*diags = append(*diags, diag(ErrUnexpected, "unexpected character '/'", line, col))
		return scanOut{i: i + 1, col: col + 1}
	}
	j := i + 2
	for j < len(src) && src[j] != '\n' && src[j] != '\r' {
		j++
	}
	tok := mk(TokComment, strings.TrimSpace(src[i+2:j]), i, j, line, col)
	return scanOut{tok: &tok, i: j, col: col + (j - i)}
}

// scanString: double-quoted, escapes `\"` and `\\` only (§1); unterminated and
// invalid escapes are diagnostics, never aborts.
func scanString(src string, i, line, col int, diags *[]Diagnostic) scanOut {
	j := i + 1
	var b strings.Builder
	for j < len(src) && src[j] != '"' && src[j] != '\n' {
		if src[j] == '\\' {
			if j+1 < len(src) && (src[j+1] == '"' || src[j+1] == '\\') {
				b.WriteByte(src[j+1])
				j += 2
			} else {
				nxt := ""
				if j+1 < len(src) {
					nxt = string(src[j+1])
				}
				*diags = append(*diags, diag(ErrInvalidEscape, "invalid escape \\"+nxt, line, col))
				j++
			}
			continue
		}
		b.WriteByte(src[j])
		j++
	}
	if j >= len(src) || src[j] != '"' {
		*diags = append(*diags, diag(ErrUnterminatedStr, "unterminated string", line, col))
		tok := mk(TokString, b.String(), i, j, line, col)
		tok.Value = b.String()
		return scanOut{tok: &tok, i: j, col: col + (j - i)}
	}
	tok := mk(TokString, b.String(), i, j+1, line, col)
	tok.Value = b.String()
	return scanOut{tok: &tok, i: j + 1, col: col + (j + 1 - i)}
}

// scanArrow: [`<`] `-` [ ident `-` ] [`>`]; needs a head or a tail.
func scanArrow(src string, i, line, col int) (*ArrowInfo, int, *Diagnostic) {
	j := i
	tail := false
	if j < len(src) && src[j] == '<' {
		tail = true
		j++
	}
	if j >= len(src) || src[j] != '-' {
		d := diag(ErrInvalidArrow, "stray '"+string(src[i])+"'", line, col)
		return nil, 0, &d
	}
	j++
	typ := ""
	end := j + 65
	if end > len(src) {
		end = len(src)
	}
	// The ident class includes '-'; a trailing dash belongs to the arrow.
	if name := strings.TrimRight(reArrowIdent.FindString(src[j:end]), "-"); name != "" &&
		j+len(name) < len(src) && src[j+len(name)] == '-' {
		typ = name
		j += len(name) + 1
	}
	head := false
	if j < len(src) && src[j] == '>' {
		head = true
		j++
	}
	if !head && (!tail || typ != "") {
		d := diag(ErrInvalidArrow, "arrow needs a head or tail", line, col)
		return nil, 0, &d
	}
	return &ArrowInfo{Tail: tail, Head: head, Type: typ}, j - i, nil
}

// scanDash: signed number when a digit follows, else the arrow grammar.
func scanDash(src string, i, line, col int, diags *[]Diagnostic) scanOut {
	if src[i] == '-' && i+1 < len(src) && isDigitByte(src[i+1]) {
		return scanNumber(src, i, line, col, diags)
	}
	info, n, derr := scanArrow(src, i, line, col)
	if derr != nil {
		*diags = append(*diags, *derr)
		return scanOut{i: i + 1, col: col + 1}
	}
	tok := mk(TokArrow, src[i:i+n], i, i+n, line, col)
	tok.Arrow = info
	return scanOut{tok: &tok, i: i + n, col: col + n}
}

// scanNumber: -?[0-9]+(.[0-9]+)? — a longer run is E109 (§1).
func scanNumber(src string, i, line, col int, diags *[]Diagnostic) scanOut {
	end := i + 64
	if end > len(src) {
		end = len(src)
	}
	m := reNumber.FindString(src[i:end])
	if m == "" {
		*diags = append(*diags, diag(ErrInvalidNumber, "invalid number", line, col))
		return scanOut{i: i + 1, col: col + 1}
	}
	tok := mk(TokNumber, m, i, i+len(m), line, col)
	return scanOut{tok: &tok, i: i + len(m), col: col + len(m)}
}

// scanIdent: letters first, ≤64 chars (§1 + errata D-M1-8); a longer run is E102.
func scanIdent(src string, i, line, col int, diags *[]Diagnostic) scanOut {
	end := i + 66
	if end > len(src) {
		end = len(src)
	}
	m := reIdent.FindString(src[i:end])
	if m == "" {
		*diags = append(*diags, diag(ErrUnexpected, "unexpected character '"+string(src[i])+"'", line, col))
		return scanOut{i: i + 1, col: col + 1}
	}
	if i+len(m) < len(src) && isIdentChar(src[i+len(m)]) {
		j := i
		for j < len(src) && isIdentChar(src[j]) {
			j++
		}
		*diags = append(*diags, diag(ErrInvalidIdent, "identifier longer than 64 chars", line, col))
		return scanOut{i: j, col: col + (j - i)}
	}
	tok := mk(TokIdent, m, i, i+len(m), line, col)
	return scanOut{tok: &tok, i: i + len(m), col: col + len(m)}
}

// scanToken dispatches on the first byte.
func scanToken(src string, i, line, col int, diags *[]Diagnostic) scanOut {
	ch := src[i]
	switch {
	case ch == '#':
		return scanHash(src, i, line, col, diags)
	case ch == '/':
		return scanSlash(src, i, line, col, diags)
	case ch == '"':
		return scanString(src, i, line, col, diags)
	case ch == '-' || ch == '<':
		return scanDash(src, i, line, col, diags)
	case isDigitByte(ch):
		return scanNumber(src, i, line, col, diags)
	case ch == '{' || ch == '}' || ch == '(' || ch == ')' || ch == ':' || ch == ',' || ch == '.':
		tok := mk(TokPunct, string(ch), i, i+1, line, col)
		return scanOut{tok: &tok, i: i + 1, col: col + 1}
	default:
		return scanIdent(src, i, line, col, diags)
	}
}

// Lex scans the whole source; errors are collected, never thrown (§1).
func Lex(src string) LexResult {
	tokens := []Token{}
	var diags []Diagnostic
	i, line, col := 0, 1, 1
	for i < len(src) {
		ch := src[i]
		if ch == '\n' || ch == '\r' {
			if ch == '\r' && i+1 < len(src) && src[i+1] == '\n' {
				i++
			}
			i++
			line++
			col = 1
			continue
		}
		if ch == ' ' || ch == '\t' {
			i++
			col++
			continue
		}
		out := scanToken(src, i, line, col, &diags)
		if out.tok != nil {
			tokens = append(tokens, *out.tok)
		}
		i = out.i
		col = out.col
	}
	tokens = append(tokens, mk(TokEOF, "", len(src), len(src), line, 1))
	return LexResult{Tokens: tokens, Diagnostics: diags}
}
