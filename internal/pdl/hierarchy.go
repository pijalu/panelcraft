// SPDX-License-Identifier: GPL-3.0-only

package pdl

// C4 decomposition and embedded source validation (IR v10; docs/FILE-FORMAT.md
// §3.2, §3.3), TS twin of web/src/engine/model/hierarchy.ts. The relation is
// authored on the parent object only, so every edge has a single author; file
// reads are injected so the pass stays IO-free.
import (
	"fmt"
	"path"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

// AllowedChildLevels are the C4 levels a parent kind may open (§3.2).
var AllowedChildLevels = map[string][]string{
	"system":     {"container"},
	"system_ext": {"container"},
	"container":  {"component", "deployment"},
}

// Source limits (§3.3): per object and per document.
const (
	SourceMaxObjectBytes = 65536
	SourceMaxObjectLines = 4096
	SourceMaxDocBytes    = 262144
	// maxChain bounds how far a decomposition chain is followed.
	maxChain = 32
)

// ReadSource is an ImportSource that can also return file text, which the
// decomposition rules need (P212/P214/P216/P218 read the child diagram).
type ReadSource interface {
	ImportSource
	// Read returns the file text and whether it exists.
	Read(resolved string) (string, bool)
}

// ResolveDrilldown resolves a `drilldown` path written in from. It rejects
// absolute paths, backslash separators, traversal above the workspace root and
// non-`.pcd` suffixes — all of them P213.
func ResolveDrilldown(from, raw string) (resolved string, problem string) {
	if raw == "" || strings.HasPrefix(raw, "/") || strings.Contains(raw, "\\") {
		return "", "escape"
	}
	dir := ""
	if i := strings.LastIndexByte(from, '/'); i >= 0 {
		dir = from[:i]
	}
	depth := 0
	for _, seg := range strings.Split(dir+"/"+raw, "/") {
		switch seg {
		case "..":
			depth--
		default:
			if seg != "" && seg != "." {
				depth++
			}
		}
		if depth < 0 {
			return "", "escape"
		}
	}
	joined := path.Join(dir, raw)
	if joined == "." || joined == "" {
		return "", "escape"
	}
	if !strings.HasSuffix(strings.ToLower(joined), ".pcd") {
		return joined, "not-pcd"
	}
	return joined, ""
}

// decomposers lists the objects of doc that declare a decomposition.
func decomposers(doc *ir.Doc) []*ir.Obj {
	out := make([]*ir.Obj, 0, 1)
	for i := range doc.Objects {
		if doc.Objects[i].Drilldown != nil {
			out = append(out, &doc.Objects[i])
		}
	}
	return out
}

// parseWorkspaceFile parses a workspace file, or returns nil when it is missing
// or unparseable.
func parseWorkspaceFile(src ReadSource, file string) *ir.Doc {
	text, ok := src.Read(file)
	if !ok {
		return nil
	}
	return Parse(text).Doc
}

// drillChain follows the decomposition chain from file and reports whether it
// returns to a file it already visited (P216).
func drillChain(src ReadSource, file string) ([]string, bool) {
	chain := []string{file}
	current := file
	for step := 0; step < maxChain; step++ {
		doc := parseWorkspaceFile(src, current)
		if doc == nil {
			return chain, false
		}
		parents := decomposers(doc)
		if len(parents) == 0 {
			return chain, false
		}
		target, problem := ResolveDrilldown(current, parents[0].Drilldown.Path)
		if problem != "" {
			return chain, false
		}
		if contains(chain, target) {
			return chain, true
		}
		chain = append(chain, target)
		current = target
	}
	return chain, false
}

// contains reports whether xs holds want.
func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

// hierarchyCtx carries what the decomposition rules need.
type hierarchyCtx struct {
	doc  *ir.Doc
	file string
	src  ReadSource
	out  []Diagnostic
}

// checkHierarchy registers every hierarchy finding for doc (§3.2/§3.3).
func checkHierarchy(doc *ir.Doc, file string, src ReadSource, out []Diagnostic) []Diagnostic {
	ctx := &hierarchyCtx{doc: doc, file: file, src: src, out: out}
	ctx.checkDuplicates()
	ctx.checkSourceLimits()
	for _, obj := range decomposers(doc) {
		// The kind rule comes first: an object that cannot decompose at all has
		// nothing to resolve, so it must not also report a missing target.
		if !ctx.checkKind(obj) {
			continue
		}
		target, ok := ctx.checkReachable(obj)
		if !ok {
			continue
		}
		ctx.checkChild(obj, target)
	}
	return ctx.out
}

// checkDuplicates reports two objects claiming the same child (P211).
func (c *hierarchyCtx) checkDuplicates() {
	claimed := map[string]*ir.Obj{}
	for _, obj := range decomposers(c.doc) {
		target, problem := ResolveDrilldown(c.file, obj.Drilldown.Path)
		if problem != "" {
			continue
		}
		first, seen := claimed[target]
		if !seen {
			claimed[target] = obj
			continue
		}
		c.out = append(c.out, diag("P211", fmt.Sprintf(
			"\"%s\" and \"%s\" both claim the child diagram \"%s\" (one parent per child: keep one drilldown line)",
			obj.ID, first.ID, target), obj.Pos.Line, obj.Pos.Col))
	}
}

// checkSourceLimits reports embedded source over the §3.3 limits (P217).
func (c *hierarchyCtx) checkSourceLimits() {
	total := 0
	var first *ir.Obj
	for i := range c.doc.Objects {
		obj := &c.doc.Objects[i]
		if obj.Source == nil {
			continue
		}
		if first == nil {
			first = obj
		}
		bytes := len(strings.Join(obj.Source.Lines, "\n"))
		total += bytes
		if bytes > SourceMaxObjectBytes || len(obj.Source.Lines) > SourceMaxObjectLines {
			c.out = append(c.out, diag("P217", fmt.Sprintf(
				"source on \"%s\" is %d bytes in %d lines (limit %d bytes / %d lines)",
				obj.ID, bytes, len(obj.Source.Lines), SourceMaxObjectBytes, SourceMaxObjectLines),
				obj.Pos.Line, obj.Pos.Col))
		}
	}
	if first != nil && total > SourceMaxDocBytes {
		c.out = append(c.out, diag("P217", fmt.Sprintf(
			"embedded source totals %d bytes (limit %d per document)", total, SourceMaxDocBytes),
			first.Pos.Line, first.Pos.Col))
	}
}

// checkReachable verifies the target path shape, existence and acyclicity.
func (c *hierarchyCtx) checkReachable(obj *ir.Obj) (string, bool) {
	raw := obj.Drilldown.Path
	target, problem := ResolveDrilldown(c.file, raw)
	if problem != "" {
		msg := fmt.Sprintf("drilldown target \"%s\" is not a .pcd path", raw)
		if problem == "escape" {
			msg = fmt.Sprintf("drilldown target \"%s\" escapes the workspace or is not a relative POSIX path", raw)
		}
		c.out = append(c.out, diag("P213", msg, obj.Pos.Line, obj.Pos.Col))
		return "", false
	}
	if c.src == nil {
		return target, true
	}
	if _, ok := c.src.Read(target); !ok {
		c.out = append(c.out, diagSev("P212", fmt.Sprintf(
			"drilldown target not found: \"%s\" (the relation stays; re-point or create it)", raw),
			obj.Pos.Line, obj.Pos.Col, SevWarning))
		return "", false
	}
	if chain, cyclic := drillChain(c.src, target); cyclic {
		c.out = append(c.out, diag("P216", fmt.Sprintf(
			"decomposition cycle: %s", strings.Join(append(chain, target), " → ")),
			obj.Pos.Line, obj.Pos.Col))
	}
	return target, true
}

// checkKind reports a kind that cannot own a subordinate diagram (P215) and
// returns whether the object may decompose at all.
func (c *hierarchyCtx) checkKind(obj *ir.Obj) bool {
	if _, ok := AllowedChildLevels[obj.Kind]; ok {
		return true
	}
	c.out = append(c.out, diag("P215", fmt.Sprintf(
		"a %s cannot own a subordinate diagram (only system, system_ext and container decompose)",
		obj.Kind), obj.Pos.Line, obj.Pos.Col))
	return false
}

// checkChild applies the allowed level transition (P214).
func (c *hierarchyCtx) checkChild(obj *ir.Obj, target string) {
	allowed := AllowedChildLevels[obj.Kind]
	if c.src == nil {
		return
	}
	child := parseWorkspaceFile(c.src, target)
	if child == nil {
		return
	}
	if child.Level != "" && !contains(allowed, child.Level) {
		c.out = append(c.out, diag("P214", fmt.Sprintf(
			"\"%s\" declares level %s, but a %s decomposes into %s",
			target, child.Level, obj.Kind, strings.Join(allowed, " or ")),
			obj.Pos.Line, obj.Pos.Col))
	}
}
