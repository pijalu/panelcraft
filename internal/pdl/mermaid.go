// SPDX-License-Identifier: GPL-3.0-only

package pdl

// Mermaid converters mirror the browser importer for CLI `convert` (FR-M1/M2/
// M5). Unsupported input is diagnosed (M200), never silently discarded.

import (
	"regexp"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

const (
	MermaidIgnored      = "M100"
	MermaidUnsupported  = "M200"
	mermaidDefaultLevel = "container"
)

// MermaidResult is a converted document plus non-fatal import diagnostics.
type MermaidResult struct {
	Doc         *ir.Doc
	Diagnostics []Diagnostic
}

type mermaidCtx struct {
	objects    []ir.Obj
	links      []ir.Link
	diags      []Diagnostic
	groupIDs   map[string]bool
	groupStack []string
	classDefs  map[string]*ir.StyleBlock
}

func newMermaidCtx() *mermaidCtx {
	return &mermaidCtx{
		groupIDs:  map[string]bool{},
		classDefs: map[string]*ir.StyleBlock{},
	}
}

func (c *mermaidCtx) warn(line int, message string) {
	c.diags = append(c.diags, diagSev(MermaidUnsupported, message, line, 1, SevWarning))
}

func (c *mermaidCtx) info(line int, message string) {
	c.diags = append(c.diags, diagSev(MermaidIgnored, message, line, 1, SevInfo))
}

func (c *mermaidCtx) findObj(id string) *ir.Obj {
	for i := range c.objects {
		if c.objects[i].ID == id {
			return &c.objects[i]
		}
	}
	return nil
}

func (c *mermaidCtx) currentGroup() string {
	for i := len(c.groupStack) - 1; i >= 0; i-- {
		if c.groupStack[i] != "" {
			return c.groupStack[i]
		}
	}
	return ""
}

func (c *mermaidCtx) attach(id string) {
	gid := c.currentGroup()
	if gid == "" {
		return
	}
	group := c.findObj(gid)
	if group == nil {
		return
	}
	for _, existing := range group.Contains {
		if existing == id {
			return
		}
	}
	group.Contains = append(group.Contains, id)
}

func (c *mermaidCtx) result(level, title, direction string, flows []ir.Flow) MermaidResult {
	doc := &ir.Doc{
		IRVersion: ir.IRVersion, FormatVersion: "1.0", Level: level,
		Direction: direction, Objects: c.objects, Links: c.links, Flows: flows,
	}
	if title != "" {
		doc.Title = &title
	}
	return MermaidResult{Doc: doc, Diagnostics: c.diags}
}

var (
	mermaidBR     = regexp.MustCompile(`(?i)<br\s*/?>`)
	mermaidQuotes = regexp.MustCompile(`^"(.*)"$`)
)

func cleanMermaidText(text string) string {
	text = strings.TrimSpace(text)
	text = mermaidQuotes.ReplaceAllString(text, "$1")
	text = mermaidBR.ReplaceAllString(text, " ")
	return strings.TrimSpace(strings.ReplaceAll(text, "&quot;", `"`))
}

func stringPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func firstField(line string) string {
	fields := strings.Fields(line)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

// FromMermaid converts flowchart/graph, C4 and sequence Mermaid sources to PDL.
func FromMermaid(src string) MermaidResult {
	if regexp.MustCompile(`(?m)^\s*sequenceDiagram\b`).MatchString(src) {
		return fromSequenceMermaid(src)
	}
	if regexp.MustCompile(`(?m)^\s*C4(Context|Container|Component|Dynamic|Deployment)\b`).MatchString(src) {
		return fromC4Mermaid(src)
	}
	return fromFlowchartMermaid(src)
}
