// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

type mermaidNode struct {
	id   string
	kind string
	name string
	end  int
}

var mermaidID = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_-]*`)

var mermaidShapes = []struct {
	re   *regexp.Regexp
	kind string
}{
	{regexp.MustCompile(`^\(\[\s*([^\]]*?)\s*\]\)`), "system_ext"},
	{regexp.MustCompile(`^\(\(\s*([^)]*?)\s*\)\)`), "person"},
	{regexp.MustCompile(`^\[\(\s*([^)]*?)\s*\)\]`), "datastore"},
	{regexp.MustCompile(`^\(\s*([^)]*?)\s*\)`), "component"},
	{regexp.MustCompile(`^\[\s*([^\]]*?)\s*\]`), "container"},
	{regexp.MustCompile(`^\{\s*([^}]*?)\s*\}`), "note"},
}

func readMermaidNode(text string, offset int) *mermaidNode {
	id := mermaidID.FindString(text[offset:])
	if id == "" {
		return nil
	}
	rest := text[offset+len(id):]
	if strings.HasPrefix(rest, ">") {
		match := regexp.MustCompile(`^>\s*([^\]]*?)\s*\]`).FindStringSubmatch(rest)
		if match != nil {
			return &mermaidNode{id: id, kind: "queue", name: cleanMermaidText(match[1]), end: offset + len(id) + len(match[0])}
		}
	}
	for _, shape := range mermaidShapes {
		if match := shape.re.FindStringSubmatch(rest); match != nil {
			return &mermaidNode{id: id, kind: shape.kind, name: cleanMermaidText(match[1]), end: offset + len(id) + len(match[0])}
		}
	}
	return &mermaidNode{id: id, kind: "container", end: offset + len(id)}
}

func (c *mermaidCtx) ensureNode(node *mermaidNode, line int) string {
	if existing := c.findObj(node.id); existing != nil {
		return existing.ID
	}
	c.objects = append(c.objects, ir.Obj{
		Kind: node.kind, ID: node.id, Name: stringPtr(node.name), Pos: ir.Pos{Line: line, Col: 1},
	})
	c.attach(node.id)
	return node.id
}

type mermaidArrow struct {
	kind  string
	label string
	len   int
}

var mermaidArrows = []struct {
	re   *regexp.Regexp
	kind string
}{
	{regexp.MustCompile(`^--(.+?)-->`), "plain"},
	{regexp.MustCompile(`^-->|^->`), "plain"},
	{regexp.MustCompile(`^-\.+?(.*?)\.+->`), "dotted"},
	{regexp.MustCompile(`^-\.+->`), "dotted"},
	{regexp.MustCompile(`^==(.+?)==+>`), "thick"},
	{regexp.MustCompile(`^={2,}>`), "thick"},
	{regexp.MustCompile(`^-{3,}`), "undir"},
}

func readMermaidArrow(text string, offset int) *mermaidArrow {
	for _, candidate := range mermaidArrows {
		if match := candidate.re.FindStringSubmatch(text[offset:]); match != nil {
			label := ""
			if len(match) > 1 {
				label = cleanMermaidText(match[1])
			}
			return &mermaidArrow{kind: candidate.kind, label: label, len: len(match[0])}
		}
	}
	return nil
}

func skipSpace(text string, offset int) int {
	for offset < len(text) && (text[offset] == ' ' || text[offset] == '\t') {
		offset++
	}
	return offset
}

type mermaidEndpoints struct {
	ids []string
	end int
}

var mermaidAmp = regexp.MustCompile(`^\s*&\s*`)

func (c *mermaidCtx) readEndpoints(text string, offset, line int) *mermaidEndpoints {
	result := &mermaidEndpoints{end: offset}
	for {
		offset = skipSpace(text, offset)
		node := readMermaidNode(text, offset)
		if node == nil {
			if len(result.ids) > 0 {
				result.end = offset
				return result
			}
			return nil
		}
		offset = node.end
		if c.groupIDs[node.id] {
			c.warn(line, "subgraph cannot be an edge endpoint")
		} else {
			result.ids = append(result.ids, c.ensureNode(node, line))
		}
		sep := mermaidAmp.FindString(text[offset:])
		if sep == "" {
			result.end = offset
			return result
		}
		offset += len(sep)
	}
}

var mermaidPipeLabel = regexp.MustCompile(`^\s*\|\s*([^|]*?)\s*\|`)

func (c *mermaidCtx) addMermaidLink(from, to, label string, arrow *mermaidArrow, line int) {
	typ := ""
	if arrow.kind == "dotted" || arrow.kind == "thick" {
		typ = arrow.kind
	}
	c.links = append(c.links, ir.Link{
		From: from, To: to, Type: typ, Label: stringPtr(label), Pos: ir.Pos{Line: line, Col: 1},
	})
}

func (c *mermaidCtx) parseMermaidEdge(text string, line int) bool {
	left := c.readEndpoints(text, 0, line)
	if left == nil {
		return false
	}
	offset := left.end
	arrows := 0
	for {
		offset = skipSpace(text, offset)
		arrow := readMermaidArrow(text, offset)
		if arrow == nil {
			return arrows > 0
		}
		offset += arrow.len
		arrows++
		pipe := mermaidPipeLabel.FindStringSubmatch(text[offset:])
		if pipe != nil {
			offset += len(pipe[0])
			arrow.label = cleanMermaidText(pipe[1])
		}
		right := c.readEndpoints(text, offset, line)
		if right == nil || len(right.ids) == 0 {
			return false
		}
		for _, from := range left.ids {
			for _, to := range right.ids {
				c.addMermaidLink(from, to, arrow.label, arrow, line)
			}
		}
		left = right
		offset = right.end
	}
}

var mermaidSubgraph = regexp.MustCompile(`^subgraph\s+([A-Za-z_][A-Za-z0-9_-]*)?\s*(?:\[\s*([^\]]*?)\s*\]|\(\s*([^)]*?)\s*\))?\s*$`)

func (c *mermaidCtx) parseMermaidSubgraph(text string, line int) {
	if len(c.groupStack) > 0 {
		c.warn(line, "nested subgraphs are not supported; children stay in the outer group")
		c.groupStack = append(c.groupStack, "")
		return
	}
	match := mermaidSubgraph.FindStringSubmatch(text)
	if match == nil {
		c.warn(line, "unsupported subgraph form: "+text)
		c.groupStack = append(c.groupStack, "")
		return
	}
	title := cleanMermaidText(match[2] + match[3])
	id := match[1]
	if id == "" {
		id = strings.ToLower(strings.ReplaceAll(title, " ", "_"))
	}
	if id == "" {
		id = "group"
	}
	c.groupIDs[id] = true
	c.objects = append(c.objects, ir.Obj{Kind: "group", ID: id, Name: stringPtr(title), Pos: ir.Pos{Line: line, Col: 1}})
	c.groupStack = append(c.groupStack, id)
}

func (c *mermaidCtx) parseMermaidBare(text string, line int) bool {
	offset := 0
	count := 0
	for {
		offset = skipSpace(text, offset)
		node := readMermaidNode(text, offset)
		if node == nil {
			return false
		}
		c.ensureNode(node, line)
		count++
		offset = node.end
		sep := regexp.MustCompile(`^\s*&`).FindString(text[offset:])
		if sep == "" {
			return count > 0 && offset >= len(text)
		}
		offset += len(sep)
	}
}

var (
	mermaidClassDef        = regexp.MustCompile(`^classDef\s+([A-Za-z_][\w-]*)\s+(.+?)\s*;?$`)
	mermaidClass           = regexp.MustCompile(`^class\s+([\w,\s-]+?)\s+([A-Za-z_][\w-]*(?:\s*,\s*[A-Za-z_][\w-]*)*)\s*;?$`)
	mermaidLinkStyle       = regexp.MustCompile(`^linkStyle\s+(\d+)\s+(.+?)\s*;?$`)
	mermaidUnsupportedLine = regexp.MustCompile(`^(style|click|direction|accumulate|interpolate)\b`)
)

func parseMermaidStyle(raw string) *ir.StyleBlock {
	style := &ir.StyleBlock{}
	for _, part := range strings.Split(raw, ",") {
		key, value, found := strings.Cut(part, ":")
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		switch {
		case key == "fill" && found:
			style.Fill = value
		case key == "stroke" && found:
			style.Stroke = value
		case key == "color" && found:
			style.Text = value
		case key == "stroke-dasharray":
			style.Dashed = true
		}
	}
	return style
}

func (c *mermaidCtx) parseMermaidClass(text string, line int) bool {
	if match := mermaidClassDef.FindStringSubmatch(text); match != nil {
		c.classDefs[match[1]] = parseMermaidStyle(match[2])
		c.info(line, "classDef colours are not imported: "+match[1])
		return true
	}
	match := mermaidClass.FindStringSubmatch(text)
	if match == nil {
		return false
	}
	classes := strings.Split(match[2], ",")
	for _, id := range strings.Split(match[1], ",") {
		obj := c.findObj(strings.TrimSpace(id))
		if obj == nil {
			continue
		}
		for _, class := range classes {
			obj.Tags = append(obj.Tags, strings.TrimSpace(class))
		}
	}
	return true
}

func (c *mermaidCtx) parseMermaidLinkStyle(text string, line int) bool {
	match := mermaidLinkStyle.FindStringSubmatch(text)
	if match == nil {
		return false
	}
	index, _ := strconv.Atoi(match[1])
	if index < 0 || index >= len(c.links) {
		c.warn(line, fmt.Sprintf("linkStyle index %d has no link", index))
		return true
	}
	c.links[index].Style = parseMermaidStyle(match[2])
	return true
}

func (c *mermaidCtx) mermaidKeyword(text string, line int) bool {
	if c.parseMermaidClass(text, line) || c.parseMermaidLinkStyle(text, line) {
		return true
	}
	if mermaidUnsupportedLine.MatchString(text) {
		c.warn(line, "unsupported mermaid construct skipped: "+firstField(text))
		return true
	}
	if text == "end" {
		if len(c.groupStack) > 0 {
			c.groupStack = c.groupStack[:len(c.groupStack)-1]
		}
		return true
	}
	if strings.HasPrefix(text, "subgraph") {
		c.parseMermaidSubgraph(text, line)
		return true
	}
	return false
}

func (c *mermaidCtx) mermaidFlowLine(text string, line int) {
	text = strings.TrimSpace(text)
	if text == "" || strings.HasPrefix(text, "%%") || c.mermaidKeyword(text, line) {
		return
	}
	if c.parseMermaidEdge(text, line) {
		return
	}
	mark := len(c.objects)
	if !c.parseMermaidBare(text, line) {
		c.objects = c.objects[:mark]
		c.warn(line, "unrecognized line skipped: "+text)
	}
}

var mermaidHeader = regexp.MustCompile(`^(flowchart|graph)(?:\s+([A-Za-z]{1,2}))?\s*$`)

func mermaidDirection(token string) string {
	switch token {
	case "TD", "TB":
		return "TB"
	case "LR", "RL", "BT":
		return token
	}
	return ""
}

func fromFlowchartMermaid(src string) MermaidResult {
	ctx := newMermaidCtx()
	direction := ""
	inFrontmatter := false
	for index, raw := range strings.Split(src, "\n") {
		line := index + 1
		text := strings.TrimSpace(raw)
		if inFrontmatter {
			if text == "---" {
				inFrontmatter = false
			} else {
				ctx.warn(line, "frontmatter line skipped: "+text)
			}
			continue
		}
		if text == "---" && index == 0 {
			inFrontmatter = true
			continue
		}
		if match := mermaidHeader.FindStringSubmatch(text); match != nil {
			if match[2] != "" && mermaidDirection(match[2]) == "" {
				ctx.warn(line, "unsupported direction \""+match[2]+"\"")
			} else if match[2] != "" {
				direction = mermaidDirection(match[2])
			}
			continue
		}
		ctx.mermaidFlowLine(raw, line)
	}
	return ctx.result(mermaidDefaultLevel, "", direction, nil)
}
