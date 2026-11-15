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

// lines returns the collected lines (used to decide whether a block has content).
func (p *printer) lines() []string { return append([]string(nil), p.out...) }

// printStyleNumbers emits the numeric link-style keys in canonical order.
func printStyleNumbers(sb *ir.StyleBlock, depth int, p *printer) {
	for _, key := range []struct {
		name  string
		value *float64
	}{{"width", sb.Width}, {"sparks", sb.Sparks}, {"speed", sb.Speed}} {
		if key.value != nil {
			p.add(pad(depth) + key.name + " " + jsNum(*key.value))
		}
	}
}

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
	if sb.Head != "" {
		p.add(pad(depth) + "head " + sb.Head)
	}
	if sb.Tail != "" {
		p.add(pad(depth) + "tail " + sb.Tail)
	}
	if sb.Line != "" {
		p.add(pad(depth) + "line " + sb.Line)
	}
	if sb.Route != "" {
		p.add(pad(depth) + "route " + sb.Route)
	}
	printStyleNumbers(sb, depth, p)
	for _, r := range sb.Raw {
		p.add(pad(depth) + r.Raw)
	}
}

func hasStyle(sb *ir.StyleBlock) bool {
	return sb != nil && (sb.Fill != "" || sb.Stroke != "" || sb.Text != "" ||
		sb.Icon != "" || sb.Shape != "" || sb.Dashed || sb.Head != "" ||
		sb.Tail != "" || sb.Line != "" || sb.Route != "" || sb.Width != nil ||
		sb.Sparks != nil || sb.Speed != nil || len(sb.Raw) > 0)
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

// withDelay appends the optional per-step dwell (F-18).
func withDelay(line string, s ir.Step) string {
	if s.DelayMs == nil {
		return line
	}
	return line + " delay " + jsNum(*s.DelayMs)
}

func stepText(s ir.Step, depth int, p *printer) {
	p.comment(s.Comments, depth)
	body := &printer{}
	stepBody(s, depth, body)
	lines := body.lines()
	if !hasPresentation(s) {
		for _, line := range lines {
			p.add(line)
		}
		return
	}
	// The block hangs off the step's last line, so a single-line step and a
	// brace-terminated block step print the same way (`… {` / `} {`).
	lines[len(lines)-1] += " presentation {"
	for _, line := range lines {
		p.add(line)
	}
	presentationLines(s, depth+1, p)
	p.add(pad(depth) + "}")
}

func stepBody(s ir.Step, depth int, p *printer) {
	switch s.Type {
	case "intro", "info", "conclusion":
		p.add(withDelay(pad(depth)+s.Type+" "+Quote(deref(s.Text)), s))
	case "process":
		body := "process " + s.Target
		if s.Text != nil {
			body += " " + Quote(*s.Text)
		}
		p.add(withDelay(pad(depth)+body, s))
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
		p.add(withDelay(pad(depth)+line, s))
	case "goto":
		target := deref(s.Flow)
		if s.File != nil {
			target = Quote(*s.File + "#" + deref(s.Flow))
		}
		line := pad(depth) + "goto " + target
		if s.Ret == "here" {
			line += " return here"
		}
		line = withDelay(line, s)
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
	// F-13: explicit geometry, printed only when the document carries it.
	if o.Size != nil {
		p.add(indent + "size " + jsNum(o.Size.W) + " " + jsNum(o.Size.H))
	}
	// CX-03: explicit stacking order, omitted entirely for Auto.
	if o.Z != nil {
		p.add(indent + "z " + jsNum(*o.Z))
	}
}

func printObject(o ir.Obj, p *printer) {
	p.comment(o.Comments, 0)
	name := o.ID // TS `o.name ?? o.id`: nullish fallback only, "" is kept
	if o.Name != nil {
		name = *o.Name
	}
	head := o.Kind + " " + o.ID + " " + Quote(name)
	// F-05: emit the block only when it has content (grammar allows omission;
	// an unconditional `{ }` touched every line on every canvas-origin write).
	body := &printer{}
	objectAttrLines(o, body)
	if hasStyle(o.Style) {
		body.add(indent + "style {")
		styleLines(o.Style, 2, body)
		body.add(indent + "}")
	}
	for _, r := range o.Attributes {
		body.add(indent + r.Raw)
	}
	lines := body.lines()
	if len(lines) == 0 {
		p.add(head)
		return
	}
	p.add(head + " {")
	p.out = append(p.out, lines...)
	p.add("}")
}

// linkNeedsBlock: block form for tags/style/waypoints/raw attributes. Link ids
// are data and always printed inline (D-M1-16).
func linkNeedsBlock(l ir.Link) bool {
	return hasStyle(l.Style) || len(l.Waypoints) > 0 || l.FromAnchor != nil || l.ToAnchor != nil || l.AllowOverlap || len(l.Tags) > 0 || len(l.Attributes) > 0
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
	if len(l.Tags) > 0 {
		p.add(indent + "tag " + strings.Join(l.Tags, " "))
	}
	if hasStyle(l.Style) {
		p.add(indent + "style {")
		styleLines(l.Style, 2, p)
		p.add(indent + "}")
	}
	if l.FromAnchor != nil {
		p.add(indent + "anchor from " + jsNum(*l.FromAnchor))
	}
	if l.ToAnchor != nil {
		p.add(indent + "anchor to " + jsNum(*l.ToAnchor))
	}
	if l.AllowOverlap {
		p.add(indent + "allow overlap")
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
	if f.Description != nil {
		p.add(indent + "description " + Quote(*f.Description))
	}
	for _, s := range f.Steps {
		stepText(s, 1, p)
	}
	p.add("}")
}

// hasPresentation reports whether step metadata must be printed (UX08-WP11).
func hasPresentation(s ir.Step) bool { return s.Description != nil || s.Camera != nil }

// cameraText renders the `camera …` line body.
func cameraText(c ir.Camera) string {
	if c.Mode != "focus" {
		return "camera " + c.Mode
	}
	body := "camera focus (" + jsNum(derefF(c.X)) + ", " + jsNum(derefF(c.Y)) + ")"
	if c.Zoom != nil {
		body += " zoom " + jsNum(*c.Zoom)
	}
	return body
}

func derefF(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

// presentationLines prints the block body in canonical order: description,
// camera, then the camera duration.
func presentationLines(s ir.Step, depth int, p *printer) {
	prefix := pad(depth)
	if s.Description != nil {
		p.add(prefix + "description " + Quote(*s.Description))
	}
	if s.Camera == nil {
		return
	}
	p.add(prefix + cameraText(*s.Camera))
	if s.Camera.DurationMs != nil {
		p.add(prefix + "duration " + jsNum(*s.Camera.DurationMs))
	}
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
