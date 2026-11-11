// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"regexp"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

var (
	sequenceHeader      = regexp.MustCompile(`^sequenceDiagram\b`)
	sequenceParticipant = regexp.MustCompile(`^(participant|actor)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+(.+))?$`)
	sequenceMessage     = regexp.MustCompile(`^([A-Za-z_][A-Za-z0-9_]*)\s*(-->>|->>|-->|->)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$`)
)

func (c *mermaidCtx) sequenceParticipant(text string, line int) bool {
	match := sequenceParticipant.FindStringSubmatch(text)
	if match == nil {
		return false
	}
	if c.findObj(match[2]) == nil {
		kind := "system"
		if match[1] == "actor" {
			kind = "person"
		}
		name := match[3]
		if name == "" {
			name = match[2]
		}
		c.objects = append(c.objects, ir.Obj{Kind: kind, ID: match[2], Name: &name, Pos: ir.Pos{Line: line, Col: 1}})
	}
	return true
}

func (c *mermaidCtx) sequenceMessage(text string, line int, steps *[]ir.Step) bool {
	match := sequenceMessage.FindStringSubmatch(text)
	if match == nil {
		return false
	}
	from, arrow, to, label := match[1], match[2], match[3], strings.TrimSpace(match[4])
	*steps = append(*steps, ir.Step{
		Type: "msg", From: from, To: to, Label: stringPtr(label), Pos: ir.Pos{Line: line, Col: 1},
	})
	link := ir.Link{From: from, To: to, Label: stringPtr(label), Pos: ir.Pos{Line: line, Col: 1}}
	if strings.HasPrefix(arrow, "--") {
		link.Style = &ir.StyleBlock{Dashed: true}
	}
	c.links = append(c.links, link)
	return true
}

func fromSequenceMermaid(src string) MermaidResult {
	ctx := newMermaidCtx()
	steps := []ir.Step{}
	for index, raw := range strings.Split(src, "\n") {
		line := index + 1
		text := strings.TrimSpace(raw)
		if text == "" || strings.HasPrefix(text, "%%") || sequenceHeader.MatchString(text) {
			continue
		}
		if ctx.sequenceParticipant(text, line) || ctx.sequenceMessage(text, line, &steps) {
			continue
		}
		ctx.warn(line, "unsupported sequence construct skipped: "+firstField(text))
	}
	flows := []ir.Flow{}
	if len(steps) > 0 {
		title := "Sequence"
		flows = append(flows, ir.Flow{Title: &title, Steps: steps, Pos: ir.Pos{Line: 1, Col: 1}})
	}
	return ctx.result(mermaidDefaultLevel, "", "", flows)
}
