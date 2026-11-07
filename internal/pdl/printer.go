// SPDX-License-Identifier: GPL-3.0-only

package pdl

// Canonical printer (M1-WP7 port of TS printer.ts) — FILE-FORMAT §11: fixed
// section order, one attribute per line, 2-space indent, quotes on strings,
// link ids are data and always emitted (D-M1-16), blank line between sections,
// comments re-attached above their statement (D-M1-10/12).
import (
	"math"
	"strconv"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

const indent = "  "

func pad(depth int) string { return strings.Repeat(indent, depth) }

// Quote renders a PDL string literal (escapes `\` and `"` only, §1).
func Quote(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	return "\"" + s + "\""
}

// jsNum renders a coordinate like JS String() does for realistic magnitudes
// (no exponent below 1e21; `-0` normalizes to `0`).
func jsNum(f float64) string {
	if f == 0 {
		return "0"
	}
	if f == math.Trunc(f) && math.Abs(f) < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return strconv.FormatFloat(f, 'g', -1, 64)
}

type printer struct{ out []string }

func (p *printer) add(line string) { p.out = append(p.out, line) }

func (p *printer) blank() {
	if len(p.out) > 0 && p.out[len(p.out)-1] != "" {
		p.out = append(p.out, "")
	}
}

func (p *printer) comment(comments []string, depth int) {
	for _, c := range comments {
		p.out = append(p.out, pad(depth)+"# "+c)
	}
}

func (p *printer) text() string { return strings.Join(p.out, "\n") + "\n" }

// styleLines prints a style block body (nil = no style, print nothing).
func styleLines(sb *ir.StyleBlock, depth int, p *printer) {
	if sb == nil {
		return
	}
	if sb.Fill != "" {
		p.add(pad(depth) + "fill " + sb.Fill)
	}
	if sb.Stroke != "" {
		p.add(pad(depth) + "stroke " + sb.Stroke)
	}
	if sb.Text != "" {
		p.add(pad(depth) + "text " + sb.Text)
	}
	if sb.Icon != "" {
		p.add(pad(depth) + "icon " + sb.Icon)
	}
	if sb.Shape != "" {
		p.add(pad(depth) + "shape " + sb.Shape)
	}
	if sb.Dashed {
		p.add(pad(depth) + "dashed")
	}
	for _, r := range sb.Raw {
		p.add(pad(depth) + r.Raw)
	}
}

func hasStyle(sb *ir.StyleBlock) bool {
	return sb != nil && (sb.Fill != "" || sb.Stroke != "" || sb.Text != "" ||
		sb.Icon != "" || sb.Shape != "" || sb.Dashed || len(sb.Raw) > 0)
}

// arrowFor renders the arrow text: optional type + direction (§4).
func arrowFor(typ string, bidir bool) string {
	s := "-"
	if bidir {
		s = "<" + s
	}
	if typ != "" {
		s += typ + "-"
	}
	return s + ">"
}

func stepText(s ir.Step, depth int, p *printer) {
	p.comment(s.Comments, depth)
	switch s.Type {
	case "intro", "info", "conclusion":
		p.add(pad(depth) + s.Type + " " + Quote(deref(s.Text)))
	case "process":
		body := "process " + s.Target
		if s.Text != nil {
			body += " " + Quote(*s.Text)
		}
		p.add(pad(depth) + body)
	case "msg":
		line := s.From + " -> " + s.To
		if s.Label != nil {
			line += " : " + Quote(*s.Label)
		}
		if s.LinkRef != "" {
			line += " as " + s.LinkRef
		}
		if s.Flip {
			line += " flip"
		}
		p.add(pad(depth) + line)
	case "goto":
		target := deref(s.Flow)
		if s.File != nil {
			target = Quote(*s.File + "#" + deref(s.Flow))
		}
		line := pad(depth) + "goto " + target
		if s.Ret == "here" {
			line += " return here"
		}
		p.add(line)
	case "alt":
		printAlt(s, depth, p)
	case "par":
		printPar(s, depth, p)
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func printAlt(s ir.Step, depth int, p *printer) {
	head := "alt"
	if s.Label != nil {
		head += " " + Quote(*s.Label)
	}
	p.add(pad(depth) + head + " {")
	for _, b := range s.Branches {
		p.comment(b.Comments, depth+1)
		p.add(pad(depth+1) + Quote(deref(b.Label)) + " {")
		for _, st := range b.Steps {
			stepText(st, depth+2, p)
		}
		p.add(pad(depth+1) + "}")
	}
	p.add(pad(depth) + "}")
}

func printPar(s ir.Step, depth int, p *printer) {
	head := "par"
	if s.Label != nil {
		head += " " + Quote(*s.Label)
	}
	p.add(pad(depth) + head + " {")
	for _, lane := range s.Lanes {
		p.add(pad(depth+1) + "{")
		for _, st := range lane {
			stepText(st, depth+2, p)
		}
		p.add(pad(depth+1) + "}")
	}
	p.add(pad(depth) + "}")
}

func objectAttrLines(o ir.Obj, p *printer) {
	if o.Description != nil {
		p.add(indent + "description " + Quote(*o.Description))
	}
	if o.Technology != nil {
		p.add(indent + "technology " + Quote(*o.Technology))
	}
	if len(o.Tags) > 0 {
		p.add(indent + "tag " + strings.Join(o.Tags, " "))
	}
	for _, pr := range o.Properties {
		p.add(indent + "property " + pr.Key + " " + Quote(pr.Value))
	}
	if len(o.Contains) > 0 {
		p.add(indent + "contains " + strings.Join(o.Contains, " "))
	}
	if o.Attach != "" {
		p.add(indent + "attach " + o.Attach)
	}
	if o.Icon != "" {
		p.add(indent + "icon " + o.Icon)
	}
}

func printObject(o ir.Obj, p *printer) {
	p.comment(o.Comments, 0)
	name := o.ID // TS `o.name ?? o.id`: nullish fallback only, "" is kept
	if o.Name != nil {
		name = *o.Name
	}
	p.add(o.Kind + " " + o.ID + " " + Quote(name) + " {")
	objectAttrLines(o, p)
	if hasStyle(o.Style) {
		p.add(indent + "style {")
		styleLines(o.Style, 2, p)
		p.add(indent + "}")
	}
	for _, r := range o.Attributes {
		p.add(indent + r.Raw)
	}
	p.add("}")
}

// linkNeedsBlock: block form for style/waypoints/raw attributes. Link ids are
// data and always printed inline (D-M1-16).
func linkNeedsBlock(l ir.Link) bool {
	return hasStyle(l.Style) || len(l.Waypoints) > 0 || len(l.Attributes) > 0
}

func printLink(l ir.Link, p *printer) {
	p.comment(l.Comments, 0)
	line := l.From + " " + arrowFor(l.Type, l.Bidir) + " " + l.To
	if l.Label != nil {
		line += " : " + Quote(*l.Label)
	}
	if l.ID != "" {
		line += " as " + l.ID
	}
	if !linkNeedsBlock(l) {
		p.add(line)
		return
	}
	p.add(line + " {")
	if hasStyle(l.Style) {
		p.add(indent + "style {")
		styleLines(l.Style, 2, p)
		p.add(indent + "}")
	}
	for _, w := range l.Waypoints {
		p.add(indent + "waypoint (" + jsNum(w[0]) + ", " + jsNum(w[1]) + ")")
	}
	for _, r := range l.Attributes {
		p.add(indent + r.Raw)
	}
	p.add("}")
}

func printFlow(f ir.Flow, p *printer) {
	p.comment(f.Comments, 0)
	head := "flow"
	if f.Title != nil {
		head += " " + Quote(*f.Title)
	}
	if f.ID != "" {
		head += " as " + f.ID
	}
	p.add(head + " {")
	for _, s := range f.Steps {
		stepText(s, 1, p)
	}
	p.add("}")
}

func printViewLine(l ir.ViewLine, p *printer) {
	p.comment(l.Comments, 1)
	switch l.Type {
	case "layout":
		if l.Mode == "saved" {
			p.add(indent + "layout saved")
		} else {
			p.add(indent + "layout auto " + l.Dir)
		}
	case "hideTag":
		p.add(indent + "hide tag " + l.ID)
	case "hide":
		p.add(indent + "hide " + l.ID)
	case "position":
		p.add(indent + "position " + l.ID + " (" + jsNum(*l.X) + ", " + jsNum(*l.Y) + ")")
	case "pin":
		p.add(indent + "pin " + l.ID)
	}
}

func printView(v ir.View, p *printer) {
	p.comment(v.Comments, 0)
	head := "view " + Quote(v.Name)
	if v.ID != "" {
		head += " as " + v.ID
	}
	p.add(head + " {")
	for _, l := range v.Lines {
		printViewLine(l, p)
	}
	p.add("}")
}

func printStyleStmt(st ir.StyleStmt, p *printer) {
	p.comment(st.Comments, 0)
	p.add("style " + st.Target + " {")
	styleLines(st.Style, 1, p)
	p.add("}")
}

func printImport(imp ir.ImportStmt, p *printer) {
	p.comment(imp.Comments, 0)
	p.add("import " + imp.Alias + " as " + Quote(imp.Path))
}

func printSection[T any](p *printer, items []T, print func(x T, pp *printer)) {
	if len(items) == 0 {
		return
	}
	p.blank()
	for _, x := range items {
		print(x, p)
	}
}

// PrintDoc renders a Doc to canonical PDL (§11). Idempotent:
// print∘parse∘print = print.
func PrintDoc(doc *ir.Doc) string {
	p := &printer{out: []string{}}
	p.add("pcd " + doc.FormatVersion)
	p.comment(doc.Comments, 0)
	if doc.Title != nil {
		p.add("title " + Quote(*doc.Title))
	}
	if doc.Level != "" {
		p.add("level " + doc.Level)
	}
	if doc.Direction != "" {
		p.add("direction " + doc.Direction)
	}
	if doc.Theme != "" {
		p.add("theme " + doc.Theme)
	}
	printSection(p, doc.Imports, printImport)
	printSection(p, doc.Objects, printObject)
	printSection(p, doc.Links, printLink)
	printSection(p, doc.Flows, printFlow)
	printSection(p, doc.Views, printView)
	printSection(p, doc.Styles, printStyleStmt)
	return p.text()
}
