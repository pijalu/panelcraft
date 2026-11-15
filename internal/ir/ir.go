// SPDX-License-Identifier: GPL-3.0-only

// Package ir mirrors the TS IR schema (web/src/engine/model/types.ts) — the
// language-neutral JSON contract shared with the Go CLI (M1-WP1, SPEC §7).
// Field order here is normative: MarshalJSON output must stay byte-identical
// to the TS canonical serializer (docs/milestones/M1.md D-M1-2).
package ir

import (
	"bytes"
	"encoding/json"
)

// IRVersion is the schema version (bump on any change; forward-only).
const IRVersion = 8

// Pos is a 1-based source position (line, col).
type Pos struct {
	Line int `json:"line"`
	Col  int `json:"col"`
}

// RawAttr keeps unknown-but-parseable attributes as verbatim data (§12).
type RawAttr struct {
	Raw      string   `json:"raw"`
	Pos      Pos      `json:"pos"`
	Comments []string `json:"comments,omitempty"`
}

// Property is an ordered key/value pair (repeatable in PDL blocks).
type Property struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// StyleBlock is a style override (§7.3); Raw keeps unknown style lines.
type StyleBlock struct {
	Fill   string    `json:"fill,omitempty"`
	Stroke string    `json:"stroke,omitempty"`
	Text   string    `json:"text,omitempty"`
	Icon   string    `json:"icon,omitempty"`
	Shape  string    `json:"shape,omitempty"`
	Dashed bool      `json:"dashed,omitempty"`
	Head   string    `json:"head,omitempty"`
	Tail   string    `json:"tail,omitempty"`
	Line   string    `json:"line,omitempty"`
	Route  string    `json:"route,omitempty"`
	Width  *float64  `json:"width,omitempty"`
	Sparks *float64  `json:"sparks,omitempty"`
	Speed  *float64  `json:"speed,omitempty"`
	Raw    []RawAttr `json:"raw,omitempty"`
}

// ImportStmt is a workspace-relative import (§5).
type ImportStmt struct {
	Alias    string   `json:"alias"`
	Path     string   `json:"path"`
	Comments []string `json:"comments,omitempty"`
	Pos      Pos      `json:"pos"`
}

// ObjSize is explicit canvas geometry (`size <w> <h>`, F-13).
type ObjSize struct {
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Obj is an object statement (§3).
type Obj struct {
	Kind        string      `json:"kind"`
	ID          string      `json:"id"`
	Name        *string     `json:"name,omitempty"`
	Description *string     `json:"description,omitempty"`
	Technology  *string     `json:"technology,omitempty"`
	Tags        []string    `json:"tags,omitempty"`
	Properties  []Property  `json:"properties,omitempty"`
	Contains    []string    `json:"contains,omitempty"`
	Attach      string      `json:"attach,omitempty"`
	Icon        string      `json:"icon,omitempty"`
	Size        *ObjSize    `json:"size,omitempty"`
	Z           *float64    `json:"z,omitempty"`
	Style       *StyleBlock `json:"style,omitempty"`
	Attributes  []RawAttr   `json:"attributes,omitempty"`
	Comments    []string    `json:"comments,omitempty"`
	Pos         Pos         `json:"pos"`
}

// Link is a link statement (§4); endpoints normalized to from -> to.
type Link struct {
	ID           string       `json:"id,omitempty"`
	From         string       `json:"from"`
	To           string       `json:"to"`
	Type         string       `json:"type,omitempty"`
	Label        *string      `json:"label,omitempty"`
	Bidir        bool         `json:"bidir,omitempty"`
	Tags         []string     `json:"tags,omitempty"`
	Style        *StyleBlock  `json:"style,omitempty"`
	Waypoints    [][2]float64 `json:"waypoints,omitempty"`
	FromAnchor   *float64     `json:"fromAnchor,omitempty"`
	ToAnchor     *float64     `json:"toAnchor,omitempty"`
	AllowOverlap bool         `json:"allowOverlap,omitempty"`
	Attributes   []RawAttr    `json:"attributes,omitempty"`
	Comments     []string     `json:"comments,omitempty"`
	Pos          Pos          `json:"pos"`
}

// Branch is one alt arm (label + its steps). Label is *string: the parser
// always records it (even ""), matching the TS serializer.
type Branch struct {
	Label    *string  `json:"label"`
	Steps    []Step   `json:"steps,omitempty"`
	Comments []string `json:"comments,omitempty"`
	Pos      Pos      `json:"pos"`
}

// Camera is the optional per-step camera behaviour (UX08-WP11, IR v8):
// "auto" (the default when absent), "hold" (keep the previous camera) or
// "focus" with a canvas point and an optional zoom inside 0.1–4.
type Camera struct {
	Mode       string   `json:"mode"`
	X          *float64 `json:"x,omitempty"`
	Y          *float64 `json:"y,omitempty"`
	Zoom       *float64 `json:"zoom,omitempty"`
	DurationMs *float64 `json:"durationMs,omitempty"`
}

// Step is a flow step (§6); a tagged union flattened to one struct — exactly
// one payload group is set, keyed by Type.
type Step struct {
	Type     string   `json:"type"`
	Text     *string  `json:"text,omitempty"`     // intro/info/conclusion
	From     string   `json:"from,omitempty"`     // msg
	To       string   `json:"to,omitempty"`       // msg
	Label    *string  `json:"label,omitempty"`    // msg/alt/par
	LinkRef  string   `json:"linkRef,omitempty"`  // msg
	Flip     bool     `json:"flip,omitempty"`     // msg
	Target   string   `json:"target,omitempty"`   // process
	Branches []Branch `json:"branches,omitempty"` // alt
	Lanes    [][]Step `json:"lanes,omitempty"`    // par
	File     *string  `json:"file,omitempty"`     // goto
	Flow     *string  `json:"flow,omitempty"`     // goto: always set for goto
	Ret      string   `json:"ret,omitempty"`      // goto: "here" only
	// DelayMs overrides the beat dwell (F-18)
	DelayMs *float64 `json:"delayMs,omitempty"`
	// Description is one line of prose for this step (UX08-WP11).
	Description *string  `json:"description,omitempty"`
	Camera      *Camera  `json:"camera,omitempty"`
	Comments    []string `json:"comments,omitempty"`
	Pos         Pos      `json:"pos"`
}

// Flow is a flow statement (§6).
type Flow struct {
	ID          string   `json:"id,omitempty"`
	Title       *string  `json:"title,omitempty"`
	Description *string  `json:"description,omitempty"`
	Steps       []Step   `json:"steps,omitempty"`
	Comments    []string `json:"comments,omitempty"`
	Pos         Pos      `json:"pos"`
}

// ViewLine is one view body line (§7.1); tagged union like Step.
type ViewLine struct {
	Type     string   `json:"type"`
	Mode     string   `json:"mode,omitempty"` // layout
	Dir      string   `json:"dir,omitempty"`  // layout auto
	ID       string   `json:"id,omitempty"`
	X        *float64 `json:"x,omitempty"` // position
	Y        *float64 `json:"y,omitempty"` // position
	Comments []string `json:"comments,omitempty"`
	Pos      Pos      `json:"pos"`
}

// View is a view statement (§7.1).
type View struct {
	ID       string     `json:"id,omitempty"`
	Name     string     `json:"name"`
	Lines    []ViewLine `json:"lines,omitempty"`
	Comments []string   `json:"comments,omitempty"`
	Pos      Pos        `json:"pos"`
}

// StyleStmt is a top-level style override statement (§7.3).
type StyleStmt struct {
	Target   string      `json:"target"`
	Style    *StyleBlock `json:"style,omitempty"`
	Comments []string    `json:"comments,omitempty"`
	Pos      Pos         `json:"pos"`
}

// Doc is one parsed .pcd file.
//
// Presence semantics (D-M1-22): the TS canonical serializer emits a field
// whenever the parser recorded it — even with an empty-string value — so
// "capable of being empty" fields are *string here: nil = absent, non-nil =
// present ("" must marshal as ""), keeping Marshal byte-identical to
// serializeDoc(). Plain string fields are never "" when present.
type Doc struct {
	IRVersion     int          `json:"irVersion"`
	FormatVersion string       `json:"formatVersion"`
	Title         *string      `json:"title,omitempty"`
	Level         string       `json:"level,omitempty"`
	Direction     string       `json:"direction,omitempty"`
	Theme         string       `json:"theme,omitempty"`
	Comments      []string     `json:"comments,omitempty"`
	Imports       []ImportStmt `json:"imports,omitempty"`
	Objects       []Obj        `json:"objects,omitempty"`
	Links         []Link       `json:"links,omitempty"`
	Flows         []Flow       `json:"flows,omitempty"`
	Views         []View       `json:"views,omitempty"`
	Styles        []StyleStmt  `json:"styles,omitempty"`
}

// Marshal serializes the doc to canonical IR JSON (2-space indent, no HTML
// escaping, trailing newline) — byte-compatible with serializeDoc() in TS.
func Marshal(doc *Doc) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(doc); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
