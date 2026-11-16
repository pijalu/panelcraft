// SPDX-License-Identifier: GPL-3.0-only

package ir

// Project-icon payload rules (IR v9, FILE-FORMAT §3.1) — the Go mirror of
// web/src/engine/format/iconSvg.ts. Same limits, same allowlist tables, same
// issue kinds and the same reporting order, because the CLI has to reach the
// same verdict as the browser for every file: the TS engine decides what the
// app stores, and this one decides what `panelcraft validate` reports.
//
// The check is lexical rather than DOM-based so the two sides can agree without
// a new dependency (ADR-0004): an allowlist over the tag/attribute grammar.
// Anything not named is refused.

import (
	"encoding/base64"
	"sort"
	"strings"
	"unicode/utf8"
)

// Icon payload limits (§3.1).
const (
	IconMaxBytes      = 64 * 1024
	IconTotalMaxBytes = 256 * 1024
	IconMaxCount      = 64
)

// IconMediaTypes are the media types a declaration may name (v1: SVG only).
var IconMediaTypes = []string{"image/svg+xml"}

// IconAllowedElements are the elements a project icon may contain.
var IconAllowedElements = map[string]bool{
	"svg": true, "g": true, "defs": true, "title": true, "desc": true, "symbol": true,
	"path": true, "rect": true, "circle": true, "ellipse": true, "line": true,
	"polyline": true, "polygon": true, "linearGradient": true, "radialGradient": true,
	"stop": true, "clipPath": true, "mask": true, "use": true, "text": true, "tspan": true,
}

// IconAllowedAttrs are the presentation attributes a project icon may carry.
var IconAllowedAttrs = map[string]bool{
	"xmlns": true, "xmlns:xlink": true, "viewBox": true, "width": true, "height": true,
	"preserveAspectRatio": true, "id": true, "class": true, "transform": true,
	"clip-path": true, "mask": true, "clipPathUnits": true, "maskUnits": true,
	"maskContentUnits": true, "gradientUnits": true, "gradientTransform": true,
	"offset": true, "stop-color": true, "stop-opacity": true,
	"d": true, "x": true, "y": true, "x1": true, "x2": true, "y1": true, "y2": true,
	"cx": true, "cy": true, "r": true, "rx": true, "ry": true, "points": true,
	"pathLength": true,
	"fill": true, "fill-opacity": true, "fill-rule": true, "stroke": true,
	"stroke-width": true, "stroke-opacity": true, "stroke-linecap": true,
	"stroke-linejoin": true, "stroke-dasharray": true, "stroke-dashoffset": true,
	"opacity": true, "color": true, "vector-effect": true,
	"font-family": true, "font-size": true, "font-weight": true, "font-style": true,
	"text-anchor": true, "dominant-baseline": true, "dx": true, "dy": true,
	"letter-spacing": true,
	"href": true, "xlink:href": true,
}

// IconDeniedElements are refused by name even though the allowlist would miss
// them: active content, animation, embedded documents and CSS.
var IconDeniedElements = map[string]bool{
	"script": true, "style": true, "foreignObject": true, "iframe": true, "object": true,
	"embed": true, "image": true, "animate": true, "animateMotion": true,
	"animateTransform": true, "set": true, "handler": true, "listener": true,
	"audio": true, "video": true, "canvas": true, "filter": true, "pattern": true,
	"marker": true,
}

// IconIssueOrder is the reporting order (deterministic, mirrors TS).
var IconIssueOrder = []string{
	"malformed", "script", "foreign-content", "event-handler", "external-ref",
	"javascript-url", "unsafe-css", "unknown-element", "unknown-attribute",
	"foreign-entity", "too-large",
}

// unsafeValue lists value fragments that make a payload refuse-to-render.
var unsafeValue = [][2]string{
	{"javascript:", "javascript-url"},
	{"vbscript:", "javascript-url"},
	{"data:text/html", "javascript-url"},
	{"url(", "unsafe-css"},
	{"@import", "unsafe-css"},
	{"expression(", "unsafe-css"},
	{"&#", "foreign-entity"},
	{"<!entity", "foreign-entity"},
}

// IsCanonicalBase64 reports whether data is canonical Base64: standard
// alphabet, padding only at the end, length a multiple of four, no whitespace.
func IsCanonicalBase64(data string) bool {
	if data == "" || len(data)%4 != 0 {
		return false
	}
	for i := 0; i < len(data); i++ {
		c := data[i]
		ok := c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' ||
			c == '+' || c == '/'
		if c == '=' {
			// Padding is only valid in the last one or two positions.
			if i < len(data)-2 {
				return false
			}
			continue
		}
		if !ok {
			return false
		}
	}
	_, err := base64.StdEncoding.DecodeString(data)
	return err == nil
}

// DecodeIconBase64 returns the decoded bytes, or nil for non-canonical input.
func DecodeIconBase64(data string) []byte {
	if !IsCanonicalBase64(data) {
		return nil
	}
	out, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil
	}
	return out
}

// DecodeIconSvg returns the SVG source of a payload, or nil when it does not
// decode as UTF-8 text.
func DecodeIconSvg(data string) *string {
	bytes := DecodeIconBase64(data)
	if bytes == nil || !utf8.Valid(bytes) {
		return nil
	}
	s := string(bytes)
	return &s
}

// iconTag is one scanned element start/end tag.
type iconTag struct {
	name  string
	close bool
	attrs [][2]string
}

func stripIconPrefix(name string) string {
	if strings.HasPrefix(name, "xlink:") {
		return name
	}
	if i := strings.Index(name, ":"); i >= 0 {
		return name[i+1:]
	}
	return name
}

func isNameChar(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' ||
		c == ':' || c == '_' || c == '.' || c == '-'
}

func isSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

// skipIconSpaces returns the index of the first non-space byte at or after i.
func skipIconSpaces(text string, i int) int {
	j := i
	for j < len(text) && isSpace(text[j]) {
		j++
	}
	return j
}

// endOfIconComment returns the index just past the comment body, or -1.
func endOfIconComment(text string, i int) int {
	end := strings.Index(text[i+4:], "-->")
	if end < 0 {
		return -1
	}
	return i + 4 + end + 3
}

// readIconValue reads a quoted attribute value at i; ok is false when unreadable.
func readIconValue(text string, i int) (value string, next int, ok bool) {
	if i >= len(text) || (text[i] != '"' && text[i] != '\'') {
		return "", 0, false
	}
	quote := text[i]
	j := i + 1
	for j < len(text) && text[j] != quote {
		j++
	}
	if j >= len(text) {
		return "", 0, false
	}
	return text[i+1 : j], j + 1, true
}

// readIconAttr reads one name="value" pair at i.
func readIconAttr(text string, i int) (name, value string, next int, ok bool) {
	j := i
	for j < len(text) && !isSpace(text[j]) && text[j] != '=' && text[j] != '/' && text[j] != '>' {
		j++
	}
	name = text[i:j]
	if name == "" {
		return "", "", 0, false
	}
	j = skipIconSpaces(text, j)
	if j >= len(text) || text[j] != '=' {
		return "", "", 0, false
	}
	value, next, ok = readIconValue(text, skipIconSpaces(text, j+1))
	return name, value, next, ok
}

// readIconAttrs reads the attribute list up to and including the closing ">".
func readIconAttrs(text string, i int, tag *iconTag) (next int, ok bool) {
	j := i
	for {
		j = skipIconSpaces(text, j)
		if j >= len(text) {
			return 0, false
		}
		if text[j] == '>' {
			return j + 1, true
		}
		if text[j] == '/' && j+1 < len(text) && text[j+1] == '>' {
			return j + 2, true
		}
		name, value, next, ok := readIconAttr(text, j)
		if !ok {
			return 0, false
		}
		tag.attrs = append(tag.attrs, [2]string{name, value})
		j = next
	}
}

// readIconTag reads one start/end tag beginning at "<"; ok is false when the
// markup cannot be read as a tag.
func readIconTag(text string, i int) (tag iconTag, next int, ok bool) {
	j := i + 1
	closeTag := j < len(text) && text[j] == '/'
	if closeTag {
		j++
	}
	nameStart := j
	for j < len(text) && isNameChar(text[j]) {
		j++
	}
	name := text[nameStart:j]
	if name == "" || strings.HasPrefix(name, "!") || strings.HasPrefix(name, "?") {
		return iconTag{}, 0, false
	}
	tag = iconTag{name: name, close: closeTag}
	next, ok = readIconAttrs(text, j, &tag)
	return tag, next, ok
}

// scanIconTags tokenizes the tag stream; nil means the text could not be read as
// markup at all (DOCTYPE, processing instruction, CDATA, unterminated tag).
func scanIconTags(text string) []iconTag {
	var tags []iconTag
	i := 0
	for i < len(text) {
		lt := strings.IndexByte(text[i:], '<')
		if lt < 0 {
			break
		}
		lt += i
		if strings.HasPrefix(text[lt:], "<!--") {
			next := endOfIconComment(text, lt)
			if next < 0 {
				return nil
			}
			i = next
			continue
		}
		if strings.HasPrefix(text[lt:], "<![CDATA[") {
			return nil
		}
		tag, next, ok := readIconTag(text, lt)
		if !ok {
			return nil
		}
		tags = append(tags, tag)
		i = next
	}
	return tags
}

func iconAttrIssues(name, value string, out map[string]bool) {
	bare := stripIconPrefix(name)
	lowerName := strings.ToLower(name)
	if strings.HasPrefix(lowerName, "on") {
		out["event-handler"] = true
		return
	}
	allowed := IconAllowedAttrs[name] || IconAllowedAttrs[bare] ||
		strings.HasPrefix(name, "aria-") || strings.HasPrefix(name, "data-") ||
		name == "role" || name == "xmlns" || strings.HasPrefix(name, "xmlns:")
	if !allowed {
		out["unknown-attribute"] = true
	}
	lower := strings.ToLower(value)
	for _, pair := range unsafeValue {
		if strings.Contains(lower, pair[0]) {
			out[pair[1]] = true
		}
	}
	if bare == "href" || bare == "src" {
		v := strings.TrimSpace(value)
		if !strings.HasPrefix(v, "#") {
			out["external-ref"] = true
		}
	}
}

func iconElementIssues(tag iconTag, out map[string]bool) {
	if IconDeniedElements[tag.name] {
		switch tag.name {
		case "script":
			out["script"] = true
		case "foreignObject":
			out["foreign-content"] = true
		default:
			out["unknown-element"] = true
		}
		return
	}
	if !IconAllowedElements[tag.name] {
		out["unknown-element"] = true
	}
}

// iconIssueRank orders the issue kinds by the shared reporting order.
func iconIssueRank(name string) int {
	for i, known := range IconIssueOrder {
		if known == name {
			return i
		}
	}
	return 99
}

// sortIconIssues returns the issue kinds in the shared reporting order.
func sortIconIssues(out map[string]bool) []string {
	issues := make([]string, 0, len(out))
	for issue := range out {
		issues = append(issues, issue)
	}
	sort.Slice(issues, func(a, b int) bool {
		ra, rb := iconIssueRank(issues[a]), iconIssueRank(issues[b])
		if ra != rb {
			return ra < rb
		}
		return issues[a] < issues[b]
	})
	return issues
}

// checkIconTags walks the tag stream, recording element and attribute issues.
func checkIconTags(tags []iconTag, out map[string]bool) {
	hasRoot := false
	for _, tag := range tags {
		if tag.name == "svg" && !tag.close {
			hasRoot = true
		}
		iconElementIssues(tag, out)
		for _, attr := range tag.attrs {
			iconAttrIssues(attr[0], attr[1], out)
		}
	}
	if !hasRoot {
		out["malformed"] = true
	}
}

// SvgIssues runs the §3.1 allowlist check over an SVG payload and returns the
// issue kinds found in reporting order. Empty means safe to store and render.
func SvgIssues(text string) []string {
	out := map[string]bool{}
	if len(text) > IconMaxBytes {
		out["too-large"] = true
	}
	lead := strings.TrimLeft(text, " \t\r\n")
	lowerLead := strings.ToLower(lead)
	if !strings.HasPrefix(lowerLead, "<svg") ||
		(len(lead) > 4 && !isSpace(lead[4]) && lead[4] != '>') {
		out["malformed"] = true
	}
	tags := scanIconTags(text)
	if tags == nil {
		out["malformed"] = true
		return sortIconIssues(out)
	}
	checkIconTags(tags, out)
	return sortIconIssues(out)
}

// SvgIsSafe reports whether a payload passes the allowlist check.
func SvgIsSafe(text string) bool { return len(SvgIssues(text)) == 0 }
