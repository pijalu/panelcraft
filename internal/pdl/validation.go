// SPDX-License-Identifier: GPL-3.0-only

package pdl

// Semantic validation (M1-WP7 port of TS model/validate.ts) — FILE-FORMAT §10
// rules P100–P205. Pure over the Doc: import-graph IO is injected via
// ImportSource so the CLI supplies the filesystem and tests supply maps.
import (
	"fmt"
	"sort"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

// ClassKind classifies an import path.
type ClassKind string

// Import path classifications.
const (
	ClassOK      ClassKind = "ok"
	ClassEscape  ClassKind = "escape"  // outside the workspace → P103
	ClassMissing ClassKind = "missing" // no such file → P200
)

// ClassResult is the outcome of Classify.
type ClassResult struct {
	Kind     ClassKind
	Resolved string // set when Kind == ClassOK
}

// ImportSource injects the import-graph probe (§10 P102/P103/P200).
type ImportSource interface {
	// Classify an import path written in `from`.
	Classify(from, path string) ClassResult
	// ImportsOf lists raw import paths declared by the file at `resolved`.
	ImportsOf(resolved string) []string
}

// Options tunes validation; zero value skips the import-graph rules.
type Options struct {
	// File is the resolved id of the file being validated (traversal root).
	File string
	// Imports supplies the probe; nil skips P102/P103/P200.
	Imports ImportSource
}

// ids holds the reference-visible identifiers, by category.
type ids struct {
	objects map[string]bool
	aliases map[string]bool
	groups  map[string]bool
	links   map[string]bool
}

func collectIds(doc *ir.Doc) ids {
	s := ids{
		objects: map[string]bool{}, aliases: map[string]bool{},
		groups: map[string]bool{}, links: map[string]bool{},
	}
	for i := range doc.Objects {
		o := &doc.Objects[i]
		s.objects[o.ID] = true
		if o.Kind == "group" {
			s.groups[o.ID] = true
		}
	}
	for i := range doc.Imports {
		s.aliases[doc.Imports[i].Alias] = true
	}
	for i := range doc.Links {
		if doc.Links[i].ID != "" {
			s.links[doc.Links[i].ID] = true
		}
	}
	return s
}

// endpointOk accepts a local object, an alias, or an import-qualified
// `alias.object` reference (FR-I2).
func endpointOk(id string, s ids) bool {
	if s.objects[id] || s.aliases[id] {
		return true
	}
	if i := strings.IndexByte(id, '.'); i > 0 {
		return s.aliases[id[:i]]
	}
	return false
}

// --- P100 --------------------------------------------------------------------

type idEntry struct {
	id  string
	pos ir.Pos
}

func checkDupIds(doc *ir.Doc, out []Diagnostic) []Diagnostic {
	dup := func(label string, xs []idEntry) {
		seen := map[string]bool{}
		for _, x := range xs {
			if x.id == "" {
				continue
			}
			if seen[x.id] {
				out = append(out, diag("P100", fmt.Sprintf("duplicate %s id \"%s\"", label, x.id), x.pos.Line, x.pos.Col))
			}
			seen[x.id] = true
		}
	}
	objs := make([]idEntry, 0, len(doc.Objects))
	for i := range doc.Objects {
		objs = append(objs, idEntry{doc.Objects[i].ID, doc.Objects[i].Pos})
	}
	dup("object", objs)
	flows := make([]idEntry, 0, len(doc.Flows))
	for i := range doc.Flows {
		flows = append(flows, idEntry{doc.Flows[i].ID, doc.Flows[i].Pos})
	}
	dup("flow", flows)
	views := make([]idEntry, 0, len(doc.Views))
	for i := range doc.Views {
		views = append(views, idEntry{doc.Views[i].ID, doc.Views[i].Pos})
	}
	dup("view", views)
	return out
}

// --- P101 + P104 (endpoints and flow steps) ----------------------------------

// linkPairs: undirected link pairs "a|b" (both directions) for P104 matching.
func linkPairs(doc *ir.Doc) map[string]bool {
	s := map[string]bool{}
	for i := range doc.Links {
		l := &doc.Links[i]
		s[l.From+"|"+l.To] = true
		s[l.To+"|"+l.From] = true
	}
	return s
}

func checkMsgStep(s *ir.Step, s2 ids, pairs map[string]bool, out []Diagnostic) []Diagnostic {
	for _, end := range []string{s.From, s.To} {
		if !endpointOk(end, s2) {
			out = append(out, diag("P101", fmt.Sprintf("endpoint \"%s\" resolves to nothing", end), s.Pos.Line, s.Pos.Col))
		}
	}
	if s.LinkRef != "" {
		if !s2.links[s.LinkRef] {
			out = append(out, diag("P104", fmt.Sprintf("msg step references link \"%s\" which does not exist", s.LinkRef), s.Pos.Line, s.Pos.Col))
		}
		return out
	}
	if !pairs[s.From+"|"+s.To] {
		out = append(out, diag("P104", fmt.Sprintf("no link between \"%s\" and \"%s\" (draw one or use `as`)", s.From, s.To), s.Pos.Line, s.Pos.Col))
	}
	return out
}

// --- P105 / P106 / P205 (objects) ---------------------------------------------

func checkObjects(doc *ir.Doc, s ids, out []Diagnostic) []Diagnostic {
	for i := range doc.Objects {
		o := &doc.Objects[i]
		for _, c := range o.Contains {
			if !s.objects[c] {
				out = append(out, diag("P105", fmt.Sprintf("%s \"%s\" contains unknown id \"%s\"", o.Kind, o.ID, c), o.Pos.Line, o.Pos.Col))
			} else if o.Kind == "group" && s.groups[c] {
				out = append(out, diag("P105", fmt.Sprintf("group \"%s\" contains nested group \"%s\" (v1: flat groups)", o.ID, c), o.Pos.Line, o.Pos.Col))
			}
		}
		if o.Attach != "" && !endpointOk(o.Attach, s) {
			out = append(out, diag("P106", fmt.Sprintf("note/object \"%s\" attaches to unknown id \"%s\"", o.ID, o.Attach), o.Pos.Line, o.Pos.Col))
		}
		for _, a := range o.Attributes {
			out = append(out, diagSev("P205", fmt.Sprintf("unknown attribute \"%s\" kept verbatim", a.Raw), a.Pos.Line, a.Pos.Col, SevWarning))
		}
	}
	return out
}

// --- P206–P210 (document icons, IR v9 §3.1) ----------------------------------

// iconHandles are the handles a document may reference: built-ins plus its own
// declarations.
func iconHandles(doc *ir.Doc) map[string]bool {
	handles := map[string]bool{}
	for name := range ir.BuiltinIconNames {
		handles[name] = true
	}
	for i := range doc.Icons {
		handles[doc.Icons[i].ID] = true
	}
	return handles
}

func checkIcons(doc *ir.Doc, out []Diagnostic) []Diagnostic {
	seen := map[string]bool{}
	total := 0
	for i := range doc.Icons {
		ic := &doc.Icons[i]
		if seen[ic.ID] {
			out = append(out, diag("P206", fmt.Sprintf("duplicate icon handle \"%s\"", ic.ID), ic.Pos.Line, ic.Pos.Col))
			continue
		}
		seen[ic.ID] = true
		// Built-in handles are reserved: shadowing one would make the same
		// `icon name` mean different things per file with no visible cue.
		if ir.IsBuiltinIcon(ic.ID) {
			out = append(out, diag("P207",
				fmt.Sprintf("icon handle \"%s\" collides with the built-in icon of the same name", ic.ID),
				ic.Pos.Line, ic.Pos.Col))
		}
		bytes := len(ir.DecodeIconBase64(ic.Data))
		total += bytes
		if bytes > ir.IconMaxBytes {
			out = append(out, diag("P208",
				fmt.Sprintf("icon \"%s\" payload is %d bytes (limit %d)", ic.ID, bytes, ir.IconMaxBytes),
				ic.Pos.Line, ic.Pos.Col))
		}
		svg := ir.DecodeIconSvg(ic.Data)
		if svg == nil {
			out = append(out, diag("P209", fmt.Sprintf("icon \"%s\" payload is not valid UTF-8", ic.ID), ic.Pos.Line, ic.Pos.Col))
			continue
		}
		if issues := ir.SvgIssues(*svg); len(issues) > 0 {
			out = append(out, diag("P209",
				fmt.Sprintf("icon \"%s\" has unsafe or unsupported SVG content: %s", ic.ID, strings.Join(issues, ", ")),
				ic.Pos.Line, ic.Pos.Col))
		}
	}
	if len(doc.Icons) > ir.IconMaxCount {
		out = append(out, diag("P208",
			fmt.Sprintf("document declares %d icons (limit %d)", len(doc.Icons), ir.IconMaxCount), 1, 1))
	}
	if total > ir.IconTotalMaxBytes {
		out = append(out, diag("P208",
			fmt.Sprintf("document icon payloads total %d bytes (limit %d)", total, ir.IconTotalMaxBytes), 1, 1))
	}
	return out
}

func checkIconRefs(doc *ir.Doc, out []Diagnostic) []Diagnostic {
	handles := iconHandles(doc)
	unknown := func(name string, line, col int) []Diagnostic {
		if handles[name] {
			return out
		}
		return append(out, diagSev("P210",
			fmt.Sprintf("unknown icon \"%s\" (declare it or use a built-in)", name), line, col, SevWarning))
	}
	for i := range doc.Objects {
		o := &doc.Objects[i]
		if o.Icon != "" {
			out = unknown(o.Icon, o.Pos.Line, o.Pos.Col)
		}
		if o.Style != nil && o.Style.Icon != "" {
			out = unknown(o.Style.Icon, o.Pos.Line, o.Pos.Col)
		}
	}
	return out
}

// --- flow step walk (P101 endpoints, P104 pair) --------------------------------

func isVisualStep(s *ir.Step) bool {
	return s.Type == "msg" || s.Type == "process" || s.Type == "alt" || s.Type == "par" || s.Type == "goto"
}

func checkStep(s *ir.Step, s2 ids, pairs map[string]bool, out []Diagnostic) []Diagnostic {
	switch s.Type {
	case "msg":
		out = checkMsgStep(s, s2, pairs, out)
	case "process":
		if !endpointOk(s.Target, s2) {
			out = append(out, diag("P101", fmt.Sprintf("process target \"%s\" resolves to nothing", s.Target), s.Pos.Line, s.Pos.Col))
		}
	case "alt":
		for bi := range s.Branches {
			for si := range s.Branches[bi].Steps {
				out = checkStep(&s.Branches[bi].Steps[si], s2, pairs, out)
			}
		}
	case "par":
		for li := range s.Lanes {
			for si := range s.Lanes[li] {
				out = checkStep(&s.Lanes[li][si], s2, pairs, out)
			}
		}
	}
	return out
}

func checkFlowSteps(doc *ir.Doc, s ids, out []Diagnostic) []Diagnostic {
	pairs := linkPairs(doc)
	for i := range doc.Links {
		l := &doc.Links[i]
		if !endpointOk(l.From, s) || !endpointOk(l.To, s) {
			out = append(out, diag("P101", fmt.Sprintf("link \"%s\" -> \"%s\" resolves to nothing", l.From, l.To), l.Pos.Line, l.Pos.Col))
		}
		for _, a := range l.Attributes {
			out = append(out, diagSev("P205", fmt.Sprintf("unknown attribute \"%s\" kept verbatim", a.Raw), a.Pos.Line, a.Pos.Col, SevWarning))
		}
	}
	for fi := range doc.Flows {
		for si := range doc.Flows[fi].Steps {
			out = checkStep(&doc.Flows[fi].Steps[si], s, pairs, out)
		}
	}
	return out
}

// --- P102 / P103 / P200 (import traversal, IO injected) ------------------------

func findCycle(src ImportSource, resolved string, stack map[string]bool) string {
	if stack[resolved] {
		return resolved
	}
	stack[resolved] = true
	for _, path := range src.ImportsOf(resolved) {
		c := src.Classify(resolved, path)
		if c.Kind != ClassOK {
			continue
		}
		if hit := findCycle(src, c.Resolved, stack); hit != "" {
			return hit
		}
	}
	delete(stack, resolved)
	return ""
}

func checkImports(doc *ir.Doc, file string, src ImportSource, out []Diagnostic) []Diagnostic {
	stack := map[string]bool{}
	if file != "" {
		stack[file] = true
	}
	for i := range doc.Imports {
		imp := &doc.Imports[i]
		c := src.Classify(file, imp.Path)
		switch c.Kind {
		case ClassEscape:
			out = append(out, diag("P103", fmt.Sprintf("import path escapes the workspace: \"%s\"", imp.Path), imp.Pos.Line, imp.Pos.Col))
		case ClassMissing:
			out = append(out, diagSev("P200", fmt.Sprintf("imported file not found: \"%s\"", imp.Path), imp.Pos.Line, imp.Pos.Col, SevWarning))
		default:
			if findCycle(src, c.Resolved, stack) != "" {
				out = append(out, diag("P102", fmt.Sprintf("import cycle through \"%s\"", imp.Path), imp.Pos.Line, imp.Pos.Col))
			}
		}
	}
	return out
}

// --- P201 / P202 / P203 / P204 --------------------------------------------------

// collectRefs records ids referenced by a step tree (msg/process/alt/par —
// spec-literal: goto does not count, P201).
func collectRefs(x *ir.Step, referenced map[string]bool) {
	switch x.Type {
	case "msg":
		referenced[x.From] = true
		referenced[x.To] = true
	case "process":
		referenced[x.Target] = true
	case "alt":
		for bi := range x.Branches {
			for si := range x.Branches[bi].Steps {
				collectRefs(&x.Branches[bi].Steps[si], referenced)
			}
		}
	case "par":
		for li := range x.Lanes {
			for si := range x.Lanes[li] {
				collectRefs(&x.Lanes[li][si], referenced)
			}
		}
	}
}

func checkOrphans(doc *ir.Doc, s ids, out []Diagnostic) []Diagnostic {
	referenced := map[string]bool{}
	for i := range doc.Links {
		referenced[doc.Links[i].From] = true
		referenced[doc.Links[i].To] = true
	}
	for fi := range doc.Flows {
		for si := range doc.Flows[fi].Steps {
			collectRefs(&doc.Flows[fi].Steps[si], referenced)
		}
	}
	for i := range doc.Objects {
		o := &doc.Objects[i]
		if s.aliases[o.ID] || referenced[o.ID] {
			continue
		}
		out = append(out, diagSev("P201", fmt.Sprintf("\"%s\" is orphaned (no links, no flow references)", o.ID), o.Pos.Line, o.Pos.Col, SevWarning))
	}
	return out
}

// flowName: TS `f.title ?? f.id ?? '?'` — empty-string titles count as set.
func flowName(f *ir.Flow) string {
	if f.Title != nil {
		return *f.Title
	}
	if f.ID != "" {
		return f.ID
	}
	return "?"
}

func checkFlowsEmpty(doc *ir.Doc, out []Diagnostic) []Diagnostic {
	for i := range doc.Flows {
		f := &doc.Flows[i]
		if len(f.Steps) == 0 {
			out = append(out, diagSev("P202", fmt.Sprintf("flow \"%s\" has no steps", flowName(f)), f.Pos.Line, f.Pos.Col, SevWarning))
			continue
		}
		visual := false
		for si := range f.Steps {
			if isVisualStep(&f.Steps[si]) {
				visual = true
				break
			}
		}
		if !visual {
			out = append(out, diagSev("P202", fmt.Sprintf("flow \"%s\" has no visual steps", flowName(f)), f.Pos.Line, f.Pos.Col, SevWarning))
		}
	}
	return out
}

func checkStyles(doc *ir.Doc, s ids, out []Diagnostic) []Diagnostic {
	for i := range doc.Styles {
		st := &doc.Styles[i]
		if !endpointOk(st.Target, s) {
			out = append(out, diagSev("P203", fmt.Sprintf("style targets non-existent id \"%s\"", st.Target), st.Pos.Line, st.Pos.Col, SevWarning))
		}
	}
	return out
}

func checkOverlaps(doc *ir.Doc, out []Diagnostic) []Diagnostic {
	for vi := range doc.Views {
		seen := map[string]string{}
		v := &doc.Views[vi]
		for li := range v.Lines {
			l := &v.Lines[li]
			if l.Type != "position" {
				continue
			}
			key := jsNum(*l.X) + "," + jsNum(*l.Y)
			first, ok := seen[key]
			if ok {
				out = append(out, diagSev("P204", fmt.Sprintf("position overlap at (%s, %s): \"%s\" and \"%s\"", jsNum(*l.X), jsNum(*l.Y), first, l.ID), l.Pos.Line, l.Pos.Col, SevInfo))
			} else {
				seen[key] = l.ID
			}
		}
	}
	return out
}

// --- entry ----------------------------------------------------------------------

func byPosition(a, b Diagnostic) bool {
	if a.Line != b.Line {
		return a.Line < b.Line
	}
	if a.Col != b.Col {
		return a.Col < b.Col
	}
	return strings.Compare(a.Code, b.Code) < 0
}

// SortByPosition orders diagnostics by line, col, code (§10 output
// discipline); shared with the CLI so merged parse+validate findings keep one
// canonical order.
func SortByPosition(diags []Diagnostic) {
	sort.Slice(diags, func(i, j int) bool { return byPosition(diags[i], diags[j]) })
}

// Validate runs the semantic pass over a parsed doc (§10). Deterministic:
// findings sorted by line, col, code. Import rules P102/P103/P200 require
// Options.Imports.
func Validate(doc *ir.Doc, opts Options) []Diagnostic {
	out := []Diagnostic{}
	s := collectIds(doc)
	out = checkDupIds(doc, out)
	out = checkIcons(doc, out)
	out = checkIconRefs(doc, out)
	out = checkFlowSteps(doc, s, out)
	if opts.Imports != nil {
		out = checkImports(doc, opts.File, opts.Imports, out)
	}
	readSrc, _ := opts.Imports.(ReadSource)
	out = checkHierarchy(doc, opts.File, readSrc, out)
	out = checkObjects(doc, s, out)
	out = checkOrphans(doc, s, out)
	out = checkFlowsEmpty(doc, out)
	out = checkStyles(doc, s, out)
	out = checkOverlaps(doc, out)
	SortByPosition(out)
	return out
}
