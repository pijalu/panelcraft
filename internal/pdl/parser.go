// SPDX-License-Identifier: GPL-3.0-only

package pdl

// PDL parser (M1-WP7 port of TS parser.ts) — recursive descent per
// FILE-FORMAT §13. Policy (§2/§10): a syntax error aborts the file (doc=nil +
// diagnostics); semantic problems defer to Validate (P-codes).
import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

var (
	kinds = map[string]bool{
		"person": true, "system": true, "system_ext": true, "container": true,
		"component": true, "datastore": true, "queue": true, "group": true, "note": true,
	}
	dirs        = map[string]bool{"LR": true, "TB": true, "RL": true, "BT": true}
	metaLevels  = map[string]bool{"context": true, "container": true, "component": true, "deployment": true}
	themes      = map[string]bool{"light": true, "dark": true}
	stepKws     = map[string]bool{"intro": true, "process": true, "alt": true, "par": true, "goto": true, "info": true, "conclusion": true}
	reFullIdent = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$`)
)

const maxDepth = 32

// abort carries a syntax error out of the recursion (§2: aborts the file).
type abort struct{ d Diagnostic }

type parser struct {
	src      string
	toks     []Token
	i        int
	pending  []string // comments awaiting the next statement
	diags    []Diagnostic
	titleSet bool // TS `??=` semantics: `title ""` counts as set
}

// tokPos converts a token position to an IR Pos.
func tokPos(t Token) ir.Pos { return ir.Pos{Line: t.Line, Col: t.Col} }

func (p *parser) fail(t Token, code, msg string) {
	panic(abort{d: diag(code, msg, t.Line, t.Col)})
}

func (p *parser) peek() Token {
	idx := p.i
	if idx > len(p.toks)-1 {
		idx = len(p.toks) - 1
	}
	return p.toks[idx]
}

func (p *parser) next() Token {
	t := p.peek()
	if p.i < len(p.toks)-1 {
		p.i++
	}
	return t
}

func (p *parser) expect(typ TokenType, text string) Token {
	t := p.next()
	if t.Type != typ || (text != "" && t.Text != text) {
		want := text
		if want == "" {
			want = string(typ)
		}
		got := t.Text
		if got == "" {
			got = string(t.Type)
		}
		p.fail(t, ErrUnexpected, fmt.Sprintf("expected %s, got '%s'", want, got))
	}
	return t
}

func (p *parser) takeComments() []string {
	c := p.pending
	p.pending = nil
	return c
}

// skipComments: comments never drop — they accumulate and attach to the next
// statement that takes them.
func (p *parser) skipComments() {
	for p.peek().Type == TokComment {
		p.pending = append(p.pending, p.next().Text)
	}
}

func (p *parser) takeDocComments(doc *ir.Doc) {
	c := p.takeComments()
	if len(c) > 0 && doc.Comments == nil {
		doc.Comments = c
	}
}

func (p *parser) num(t Token) float64 {
	if t.Type != TokNumber {
		p.fail(t, ErrUnexpected, fmt.Sprintf("expected number, got '%s'", orType(t)))
	}
	v, err := strconv.ParseFloat(t.Text, 64)
	if err != nil {
		p.fail(t, ErrUnexpected, fmt.Sprintf("expected number, got '%s'", t.Text))
	}
	return v
}

func orType(t Token) string {
	if t.Text != "" {
		return t.Text
	}
	return string(t.Type)
}

// captureRaw consumes tokens through end of line; returns the raw source slice.
func (p *parser) captureRaw(first Token) string {
	last := first
	for p.peek().Type != TokEOF && p.peek().Line == first.Line {
		last = p.next()
	}
	return strings.TrimSpace(p.src[first.Start:last.End])
}

func (p *parser) expectClose(t0 Token, what string) {
	if p.peek().Type == TokEOF {
		p.fail(t0, ErrUnclosedBlock, fmt.Sprintf("unclosed %s block", what))
	}
	p.expect(TokPunct, "}")
}

// ---- file ------------------------------------------------------------------

func (p *parser) parseFile() *ir.Doc {
	p.skipComments()
	first := p.peek()
	if first.Type != TokIdent || first.Text != "pcd" {
		p.fail(first, ErrInvalidVersion, `missing "pcd <version>" magic line`)
	}
	p.next()
	ver := p.expect(TokNumber, "")
	major, _ := strconv.Atoi(strings.SplitN(ver.Text, ".", 2)[0])
	if major > 1 {
		p.fail(ver, ErrInvalidVersion, fmt.Sprintf("unsupported major version %d", major))
	}
	doc := &ir.Doc{IRVersion: ir.IRVersion, FormatVersion: ver.Text}
	// Pre-magic comments are doc-level (D-M1-2): the magic line is canonical first.
	if lead := p.takeComments(); len(lead) > 0 {
		doc.Comments = lead
	}
	p.statementLoop(doc)
	return doc
}

func (p *parser) statementLoop(doc *ir.Doc) {
	for {
		p.skipComments()
		t := p.peek()
		if t.Type == TokEOF {
			return
		}
		if t.Type != TokIdent {
			p.fail(t, ErrUnknownTopLevel, fmt.Sprintf("unknown top-level statement '%s'", orType(t)))
		}
		if t.Text == "pcd" {
			p.fail(t, ErrUnexpected, "duplicate magic line")
		}
		p.statement(doc)
	}
}

// statement dispatches one top-level statement (kind idents and links fall
// through the default arm).
func (p *parser) statement(doc *ir.Doc) {
	t := p.peek()
	switch t.Text {
	case "title":
		p.next()
		p.takeDocComments(doc)
		if !p.titleSet {
			v := p.str()
			doc.Title = &v
			p.titleSet = true
		} else {
			_ = p.str() // first title wins (D-M1: `??=` keeps the first)
		}
	case "level", "direction", "theme":
		p.next()
		p.takeDocComments(doc)
		p.parseMeta(doc, t.Text)
	case "import":
		doc.Imports = append(doc.Imports, p.parseImport())
	case "flow":
		doc.Flows = append(doc.Flows, p.parseFlow())
	case "view":
		doc.Views = append(doc.Views, p.parseView())
	case "style":
		doc.Styles = append(doc.Styles, p.parseStyleStmt())
	default:
		if kinds[t.Text] {
			doc.Objects = append(doc.Objects, p.parseObject())
			return
		}
		doc.Links = append(doc.Links, p.parseLink())
	}
}

func (p *parser) str() string {
	return p.expect(TokString, "").Value
}

func (p *parser) parseMeta(doc *ir.Doc, key string) {
	allowed := metaLevels
	switch key {
	case "direction":
		allowed = dirs
	case "theme":
		allowed = themes
	}
	p.metaEnum(doc, key, p.next(), allowed)
}

func (p *parser) metaEnum(doc *ir.Doc, key string, t Token, allowed map[string]bool) {
	if t.Type != TokIdent || !allowed[t.Text] {
		p.fail(t, ErrUnexpected, fmt.Sprintf("invalid %s value '%s'", key, t.Text))
	}
	var dup bool
	switch key {
	case "level":
		dup = doc.Level != ""
		if !dup {
			doc.Level = t.Text
		}
	case "direction":
		dup = doc.Direction != ""
		if !dup {
			doc.Direction = t.Text
		}
	case "theme":
		dup = doc.Theme != ""
		if !dup {
			doc.Theme = t.Text
		}
	}
	if dup {
		p.diags = append(p.diags, diagSev(WDuplicateMeta,
			fmt.Sprintf("duplicate %s directive (first kept)", key), t.Line, t.Col, SevWarning))
	}
}

// ---- import / object --------------------------------------------------------

func (p *parser) parseImport() ir.ImportStmt {
	t0 := p.next()
	comments := p.takeComments()
	alias := p.ident()
	p.expect(TokIdent, "as")
	path := p.expect(TokString, "").Value
	return ir.ImportStmt{Alias: alias, Path: path, Comments: comments, Pos: tokPos(t0)}
}

func (p *parser) parseObject() ir.Obj {
	t0 := p.next()
	comments := p.takeComments()
	o := ir.Obj{Kind: t0.Text, ID: p.ident(), Pos: tokPos(t0)}
	if p.peek().Type == TokString {
		v := p.next().Value
		o.Name = &v
	}
	if p.peek().Type == TokPunct && p.peek().Text == "{" {
		p.next()
		p.objectBlock(&o, t0)
	}
	o.Comments = comments
	return o
}

func (p *parser) objectBlock(o *ir.Obj, t0 Token) {
	seen := map[string]bool{}
	for {
		p.skipComments()
		if p.peek().Type == TokEOF {
			p.fail(t0, ErrUnclosedBlock, "unclosed object block")
		}
		if p.peek().Type == TokPunct && p.peek().Text == "}" {
			p.next()
			return
		}
		t := p.expect(TokIdent, "")
		if p.objectAttr(o, seen, t0, t) {
			continue
		}
		o.Attributes = append(o.Attributes, ir.RawAttr{Raw: p.captureRaw(t), Pos: tokPos(t)})
	}
}

// objectAttr handles one known object attribute; false = unknown (raw attr).
func (p *parser) objectAttr(o *ir.Obj, seen map[string]bool, t0, t Token) bool {
	switch t.Text {
	case "description":
		p.once(seen, t, "description")
		v := p.str()
		o.Description = &v
	case "technology":
		p.once(seen, t, "technology")
		v := p.str()
		o.Technology = &v
	case "tag":
		o.Tags = append(o.Tags, p.identList()...)
	case "property":
		key := p.ident()
		value := p.str()
		o.Properties = append(o.Properties, ir.Property{Key: key, Value: value})
	case "contains":
		p.once(seen, t, "contains")
		o.Contains = p.identList()
	case "attach":
		p.once(seen, t, "attach")
		o.Attach = p.ident()
	case "icon":
		p.once(seen, t, "icon")
		o.Icon = p.ident()
	case "size":
		p.once(seen, t, "size")
		w := p.num(p.expect(TokNumber, ""))
		h := p.num(p.expect(TokNumber, ""))
		if w <= 0 || h <= 0 {
			p.fail(t, ErrUnexpected, "size must be positive")
		}
		o.Size = &ir.ObjSize{W: w, H: h}
	case "style":
		p.once(seen, t, "style")
		o.Style = p.parseStyleBlock(t0, "object")
	default:
		return false
	}
	return true
}

func (p *parser) once(seen map[string]bool, t Token, key string) {
	if seen[key] {
		p.fail(t, ErrDuplicateAttr, fmt.Sprintf("duplicate attribute '%s'", key))
	}
	seen[key] = true
}

// ident validates a PDL identifier (§1 + errata D-M1-8).
func (p *parser) ident() string {
	return p.identTok(p.expect(TokIdent, ""))
}

func (p *parser) identTok(t Token) string {
	if !reFullIdent.MatchString(t.Text) {
		p.fail(t, ErrInvalidIdent, fmt.Sprintf("invalid identifier '%s'", t.Text))
	}
	return t.Text
}

func (p *parser) identList() []string {
	var ids []string
	first := p.peek()
	for p.peek().Type == TokIdent && p.peek().Line == first.Line {
		ids = append(ids, p.identTok(p.next()))
	}
	if len(ids) == 0 {
		p.fail(p.peek(), ErrUnexpected, "expected identifier")
	}
	return ids
}

// ---- style ------------------------------------------------------------------

// parseStyleBlock parses a style block; an empty block returns nil so the IR
// omits the style key entirely (TS serializer parity).
func (p *parser) parseStyleBlock(t0 Token, where string) *ir.StyleBlock {
	p.expect(TokPunct, "{")
	sb := &ir.StyleBlock{}
	seen := map[string]bool{}
	for {
		p.skipComments()
		if p.peek().Type == TokEOF {
			p.fail(t0, ErrUnclosedBlock, fmt.Sprintf("unclosed %s style block", where))
		}
		if p.peek().Type == TokPunct && p.peek().Text == "}" {
			p.next()
			break
		}
		t := p.expect(TokIdent, "")
		if !p.styleLine(sb, seen, t) {
			sb.Raw = append(sb.Raw, ir.RawAttr{Raw: p.captureRaw(t), Pos: tokPos(t)})
		}
	}
	if isEmptyStyle(sb) {
		return nil
	}
	return sb
}

// styleLine handles one known style line; false = unknown (raw).
func (p *parser) styleLine(sb *ir.StyleBlock, seen map[string]bool, t Token) bool {
	switch t.Text {
	case "fill", "stroke", "text":
		p.once(seen, t, t.Text)
		c := p.next()
		if c.Type != TokColor {
			p.fail(c, ErrInvalidColor, fmt.Sprintf("%s needs a #rgb/#rrggbb color", t.Text))
		}
		switch t.Text {
		case "fill":
			sb.Fill = c.Text
		case "stroke":
			sb.Stroke = c.Text
		default:
			sb.Text = c.Text
		}
	case "icon", "shape":
		p.once(seen, t, t.Text)
		v := p.expect(TokIdent, "").Text
		if t.Text == "icon" {
			sb.Icon = v
		} else {
			sb.Shape = v
		}
	case "dashed":
		p.once(seen, t, "dashed")
		sb.Dashed = true
	case "head", "tail":
		p.once(seen, t, t.Text)
		id := p.ident()
		if t.Text == "head" {
			sb.Head = id
		} else {
			sb.Tail = id
		}
	case "line":
		p.once(seen, t, "line")
		id := p.ident()
		if id != "solid" && id != "dashed" && id != "dotted" {
			p.fail(t, ErrUnexpected, fmt.Sprintf("invalid line style '%s'", id))
		}
		sb.Line = id
	case "width":
		p.once(seen, t, "width")
		w := p.num(p.expect(TokNumber, ""))
		sb.Width = &w
	default:
		return false
	}
	return true
}

func isEmptyStyle(sb *ir.StyleBlock) bool {
	return sb.Fill == "" && sb.Stroke == "" && sb.Text == "" && sb.Icon == "" &&
		sb.Shape == "" && !sb.Dashed && sb.Head == "" && sb.Tail == "" &&
		sb.Line == "" && sb.Width == nil && len(sb.Raw) == 0
}

func (p *parser) parseStyleStmt() ir.StyleStmt {
	t0 := p.next()
	comments := p.takeComments()
	target := p.ident()
	style := p.parseStyleBlock(t0, "style")
	return ir.StyleStmt{Target: target, Style: style, Comments: comments, Pos: tokPos(t0)}
}

// ---- links ------------------------------------------------------------------

func (p *parser) parseLink() ir.Link {
	t0 := p.next()
	comments := p.takeComments()
	l := ir.Link{Pos: tokPos(t0)}
	p.linkEnds(&l, t0)
	p.linkModifiers(&l)
	if p.peek().Type == TokPunct && p.peek().Text == "{" {
		p.next()
		p.linkBlock(&l, t0)
	}
	l.Comments = comments
	return l
}

// linkEnds: `from [type-]arrow to` with reversed-arrow normalization (errata
// D-M1-11).
func (p *parser) linkEnds(l *ir.Link, t0 Token) {
	from := p.identTok(t0)
	arrow := p.expect(TokArrow, "")
	to := p.ident()
	info := arrow.Arrow
	if info != nil && info.Tail && !info.Head {
		l.From, l.To = to, from
	} else {
		l.From, l.To = from, to
	}
	if info != nil {
		if info.Type != "" {
			l.Type = info.Type
		}
		if info.Tail && info.Head {
			l.Bidir = true
		}
	}
}

// linkModifiers: order-free `: label` / `as id` tail (errata D-M1-9).
func (p *parser) linkModifiers(l *ir.Link) {
	for {
		t := p.peek()
		switch {
		case t.Type == TokPunct && t.Text == ":":
			p.next()
			v := p.str()
			l.Label = &v
		case t.Type == TokIdent && t.Text == "as":
			p.next()
			l.ID = p.ident()
		default:
			return
		}
	}
}

func (p *parser) linkBlock(l *ir.Link, t0 Token) {
	for {
		p.skipComments()
		if p.peek().Type == TokEOF {
			p.fail(t0, ErrUnclosedBlock, "unclosed link block")
		}
		if p.peek().Type == TokPunct && p.peek().Text == "}" {
			p.next()
			return
		}
		t := p.expect(TokIdent, "")
		switch t.Text {
		case "label":
			v := p.expect(TokString, "").Value
			l.Label = &v
		case "tag":
			l.Tags = append(l.Tags, p.identList()...)
		case "style":
			l.Style = p.parseStyleBlock(t0, "link")
		case "waypoint":
			p.expect(TokPunct, "(")
			x := p.num(p.next())
			p.expect(TokPunct, ",")
			y := p.num(p.next())
			p.expect(TokPunct, ")")
			l.Waypoints = append(l.Waypoints, [2]float64{x, y})
		default:
			l.Attributes = append(l.Attributes, ir.RawAttr{Raw: p.captureRaw(t), Pos: tokPos(t)})
		}
	}
}

// ---- flows ------------------------------------------------------------------

func (p *parser) parseFlow() ir.Flow {
	t0 := p.next()
	comments := p.takeComments()
	f := ir.Flow{Pos: tokPos(t0)}
	if p.peek().Type == TokString {
		v := p.next().Value
		f.Title = &v
	}
	if p.peek().Type == TokIdent && p.peek().Text == "as" {
		p.next()
		f.ID = p.ident()
	}
	p.expect(TokPunct, "{")
	f.Steps = p.parseSteps(1)
	p.expectClose(t0, "flow")
	f.Comments = comments
	return f
}

func (p *parser) parseSteps(depth int) []ir.Step {
	if depth > maxDepth {
		p.fail(p.peek(), ErrNestingTooDeep, fmt.Sprintf("nesting deeper than %d", maxDepth))
	}
	var steps []ir.Step
	for {
		p.skipComments()
		t := p.peek()
		if t.Type == TokEOF || (t.Type == TokPunct && t.Text == "}") {
			return steps
		}
		if t.Type == TokIdent && stepKws[t.Text] {
			steps = append(steps, p.parseKeywordStep(t.Text, depth))
			continue
		}
		if t.Type == TokIdent {
			steps = append(steps, p.parseMsgStep())
			continue
		}
		p.fail(t, ErrUnexpected, fmt.Sprintf("unexpected %s in flow body", t.Type))
	}
}

func (p *parser) quoted(t Token, what string) string {
	if t.Type != TokString {
		p.fail(t, ErrUnexpected, fmt.Sprintf("%s needs a quoted string", what))
	}
	return t.Value
}

// stepDelay consumes an optional trailing `delay <ms>` on the step's line (F-18).
func (p *parser) stepDelay(line int, s *ir.Step) {
	t := p.peek()
	if t.Type != TokIdent || t.Text != "delay" || t.Line != line {
		return
	}
	p.next()
	ms := p.num(p.expect(TokNumber, ""))
	if ms < 0 {
		p.fail(t, ErrUnexpected, "delay must not be negative")
	}
	s.DelayMs = &ms
}

func (p *parser) parseKeywordStep(kw string, depth int) ir.Step {
	t0 := p.next()
	comments := p.takeComments()
	s := ir.Step{Type: kw, Comments: comments, Pos: tokPos(t0)}
	switch kw {
	case "intro", "info", "conclusion":
		v := p.quoted(p.next(), kw)
		s.Text = &v
	case "process":
		s.Target = p.ident()
		if p.peek().Type == TokString {
			v := p.next().Value
			s.Text = &v
		}
	case "alt":
		s.Label, s.Branches = p.parseAltBody(t0, depth)
	case "par":
		s.Label, s.Lanes = p.parseParBody(t0, depth)
	default: // goto
		p.parseGoto(&s)
	}
	if kw != "alt" && kw != "par" {
		p.stepDelay(t0.Line, &s)
	}
	return s
}

func (p *parser) parseAltBody(t0 Token, depth int) (*string, []ir.Branch) {
	label := p.optLabel()
	p.expect(TokPunct, "{")
	var branches []ir.Branch
	for {
		p.skipComments()
		if p.peek().Type == TokPunct && p.peek().Text == "}" {
			break
		}
		if p.peek().Type == TokEOF {
			p.fail(t0, ErrUnclosedBlock, "unclosed alt block")
		}
		bt := p.next()
		bpos := tokPos(bt)
		blabel := p.quoted(bt, "alt branch")
		p.expect(TokPunct, "{")
		bsteps := p.parseSteps(depth + 1)
		p.expectClose(bt, "alt branch")
		branches = append(branches, ir.Branch{Label: &blabel, Steps: bsteps, Pos: bpos})
	}
	p.next()
	return label, branches
}

func (p *parser) parseParBody(t0 Token, depth int) (*string, [][]ir.Step) {
	label := p.optLabel()
	p.expect(TokPunct, "{")
	var lanes [][]ir.Step
	for {
		p.skipComments()
		if p.peek().Type == TokPunct && p.peek().Text == "}" {
			break
		}
		if p.peek().Type == TokEOF {
			p.fail(t0, ErrUnclosedBlock, "unclosed par block")
		}
		p.expect(TokPunct, "{")
		lane := p.parseSteps(depth + 1)
		p.expectClose(t0, "par lane")
		lanes = append(lanes, lane)
	}
	p.next()
	return label, lanes
}

// optLabel reads an optional leading quoted label.
func (p *parser) optLabel() *string {
	if p.peek().Type == TokString {
		v := p.next().Value
		return &v
	}
	return nil
}

// parseGoto: ident flow, or "path.pcd#flowId" with optional `return here|end`.
func (p *parser) parseGoto(s *ir.Step) {
	t := p.next()
	if t.Type != TokIdent && (t.Type != TokString || !strings.Contains(t.Value, "#")) {
		p.fail(t, ErrInvalidGoto, `goto needs ident or "path.pcd#flowId"`)
	}
	if t.Type == TokIdent {
		v := p.identTok(t)
		s.Flow = &v
	} else {
		file := t.Value[:strings.LastIndex(t.Value, "#")]
		flow := t.Value[strings.LastIndex(t.Value, "#")+1:]
		s.File = &file
		s.Flow = &flow
	}
	if p.peek().Type == TokIdent && p.peek().Text == "return" {
		p.next()
		r := p.expect(TokIdent, "")
		switch r.Text {
		case "here":
			s.Ret = "here"
		case "end":
			// default: no marker
		default:
			p.fail(r, ErrUnexpected, fmt.Sprintf("invalid goto return '%s'", r.Text))
		}
	}
}

func (p *parser) parseMsgStep() ir.Step {
	t0 := p.next()
	comments := p.takeComments()
	from := p.identTok(t0)
	arrow := p.expect(TokArrow, "")
	to := p.ident()
	info := arrow.Arrow
	if info != nil && info.Tail && !info.Head {
		from, to = to, from
	}
	s := ir.Step{Type: "msg", From: from, To: to, Comments: comments, Pos: tokPos(t0)}
	// Modifiers are order-free (errata D-M1-9): : "label", as Ref, flip.
	for {
		t := p.peek()
		switch {
		case t.Type == TokPunct && t.Text == ":":
			p.next()
			v := p.expect(TokString, "").Value
			s.Label = &v
		case t.Type == TokIdent && t.Text == "as":
			p.next()
			s.LinkRef = p.ident()
		case t.Type == TokIdent && t.Text == "flip":
			p.next()
			s.Flip = true
		case t.Type == TokIdent && t.Text == "delay" && t.Line == t0.Line:
			p.stepDelay(t0.Line, &s)
			return s
		default:
			return s
		}
	}
}

// ---- views ------------------------------------------------------------------

func (p *parser) parseView() ir.View {
	t0 := p.next()
	comments := p.takeComments()
	name := p.quoted(p.next(), "view")
	v := ir.View{Name: name, Pos: tokPos(t0)}
	if p.peek().Type == TokIdent && p.peek().Text == "as" {
		p.next()
		v.ID = p.ident()
	}
	p.expect(TokPunct, "{")
	for !(p.peek().Type == TokPunct && p.peek().Text == "}") {
		p.skipComments()
		if p.peek().Type == TokEOF {
			p.fail(t0, ErrUnclosedBlock, "unclosed view block")
		}
		v.Lines = append(v.Lines, p.parseViewLine())
	}
	p.next()
	v.Comments = comments
	return v
}

func (p *parser) parseViewLine() ir.ViewLine {
	t0 := p.next()
	l := ir.ViewLine{Type: t0.Text, Comments: p.takeComments(), Pos: tokPos(t0)}
	switch t0.Text {
	case "layout":
		p.layoutLine(&l, t0)
	case "hide":
		p.hideLine(&l)
	case "position":
		p.positionLine(&l)
	case "pin":
		l.ID = p.ident()
	default:
		p.fail(t0, ErrUnexpected, fmt.Sprintf("unknown view line '%s'", t0.Text))
	}
	return l
}

func (p *parser) layoutLine(l *ir.ViewLine, t0 Token) {
	mode := p.expect(TokIdent, "").Text
	if mode == "saved" {
		l.Mode = "saved"
		return
	}
	if mode != "auto" {
		p.fail(t0, ErrUnexpected, fmt.Sprintf("invalid layout mode '%s'", mode))
	}
	dir := p.expect(TokIdent, "").Text
	if !dirs[dir] {
		p.fail(t0, ErrUnexpected, fmt.Sprintf("invalid layout dir '%s'", dir))
	}
	l.Mode = "auto"
	l.Dir = dir
}

func (p *parser) hideLine(l *ir.ViewLine) {
	t := p.next()
	if t.Type == TokIdent && t.Text == "tag" {
		l.Type = "hideTag"
		l.ID = p.ident()
		return
	}
	if t.Type != TokIdent {
		p.fail(t, ErrUnexpected, "hide needs an id")
	}
	l.ID = p.identTok(t)
}

func (p *parser) positionLine(l *ir.ViewLine) {
	id := p.ident()
	p.expect(TokPunct, "(")
	x := p.num(p.next())
	p.expect(TokPunct, ",")
	y := p.num(p.next())
	p.expect(TokPunct, ")")
	l.ID = id
	l.X = &x
	l.Y = &y
}

// ---- entry ------------------------------------------------------------------

// ParseResult is the outcome of parsing one file.
type ParseResult struct {
	Doc         *ir.Doc
	Diagnostics []Diagnostic
}

// Parse PDL source; syntax errors abort the file (§2), never panic past API.
func Parse(src string) ParseResult {
	lx := Lex(src)
	p := &parser{src: src, toks: lx.Tokens}
	p.diags = append(p.diags, lx.Diagnostics...)
	return p.run()
}

func (p *parser) run() (res ParseResult) {
	defer func() {
		if r := recover(); r != nil {
			ab, ok := r.(abort)
			if !ok {
				panic(r)
			}
			res.Doc = nil
			res.Diagnostics = append(p.diags, ab.d)
		}
	}()
	res.Doc = p.parseFile()
	res.Diagnostics = p.diags
	return res
}
