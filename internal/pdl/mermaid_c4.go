// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"regexp"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
)

type mermaidArg struct {
	text   string
	quoted bool
}

func splitMermaidArgs(text string) []mermaidArg {
	args := []mermaidArg{}
	var current strings.Builder
	quoted := false
	inString := false
	flush := func() {
		args = append(args, mermaidArg{text: strings.TrimSpace(current.String()), quoted: quoted})
		current.Reset()
		quoted = false
	}
	for i := 0; i < len(text); i++ {
		ch := text[i]
		if inString {
			if ch == '\\' && i+1 < len(text) && text[i+1] == '"' {
				current.WriteByte('"')
				i++
				continue
			}
			if ch == '"' {
				inString = false
				continue
			}
			current.WriteByte(ch)
			continue
		}
		switch ch {
		case '"':
			inString = true
			quoted = true
		case ',':
			flush()
		default:
			current.WriteByte(ch)
		}
	}
	if strings.TrimSpace(current.String()) != "" || quoted {
		flush()
	}
	return args
}

type c4ElementSpec struct {
	kind string
	ext  bool
	tech bool
}

var c4Elements = map[string]c4ElementSpec{
	"Person": {kind: "person"}, "Person_Ext": {kind: "person", ext: true},
	"System": {kind: "system"}, "System_Ext": {kind: "system_ext", ext: true},
	"SystemDb": {kind: "datastore"}, "SystemQueue": {kind: "queue"},
	"System_ExtDb": {kind: "datastore", ext: true}, "System_ExtQueue": {kind: "queue", ext: true},
	"Container": {kind: "container", tech: true}, "ContainerDb": {kind: "datastore", tech: true},
	"ContainerQueue": {kind: "queue", tech: true}, "Container_Ext": {kind: "container", ext: true, tech: true},
	"Container_ExtDb":    {kind: "datastore", ext: true, tech: true},
	"Container_ExtQueue": {kind: "queue", ext: true, tech: true},
	"Component":          {kind: "component", tech: true}, "ComponentDb": {kind: "datastore", tech: true},
	"ComponentQueue": {kind: "queue", tech: true}, "Component_Ext": {kind: "component", ext: true, tech: true},
}

var c4Boundaries = map[string]bool{
	"Enterprise_Boundary": true, "System_Boundary": true, "Container_Boundary": true,
	"Component_Boundary": true, "Deployment_Node": true, "Node": true,
}

var c4Relations = map[string]bool{
	"Rel": true, "Rel_Back": true, "RelIndex": true, "RelIndex_Back": true,
	"BiRel": true, "BiRel_Index": true,
}

var c4CallRE = regexp.MustCompile(`^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*(\{)?\s*$`)
var c4HeaderRE = regexp.MustCompile(`^(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b`)
var c4TitleRE = regexp.MustCompile(`^title\s+(.+)$`)
var c4EndRE = regexp.MustCompile(`^(end|EndBoundary|})\s*$`)
var c4IgnoredRE = regexp.MustCompile(`^(Show|Update|Lay_|skinparam|autonumber|Set|style|AddProperty|Cad)([\s(]|$|[A-Z_])`)

func argAt(args []mermaidArg, index int) string {
	if index < 0 || index >= len(args) {
		return ""
	}
	return args[index].text
}

func (c *mermaidCtx) parseC4Element(family string, spec c4ElementSpec, args []mermaidArg, line int) {
	id := argAt(args, 0)
	if id == "" {
		c.warn(line, family+": missing element id")
		return
	}
	if c.findObj(id) != nil {
		return
	}
	techIndex := 2
	descIndex := 2
	if spec.tech {
		descIndex = 3
	}
	obj := ir.Obj{
		Kind: spec.kind, ID: id, Name: stringPtr(argAt(args, 1)),
		Description: stringPtr(argAt(args, descIndex)), Pos: ir.Pos{Line: line, Col: 1},
	}
	if spec.tech {
		obj.Technology = stringPtr(argAt(args, techIndex))
	}
	if spec.ext {
		obj.Tags = []string{"external"}
	}
	c.objects = append(c.objects, obj)
	c.attach(id)
}

func (c *mermaidCtx) parseC4Boundary(args []mermaidArg, line int) {
	id := argAt(args, 0)
	if id == "" {
		c.warn(line, "boundary: missing id")
		return
	}
	c.groupIDs[id] = true
	c.objects = append(c.objects, ir.Obj{
		Kind: "group", ID: id, Name: stringPtr(argAt(args, 1)), Pos: ir.Pos{Line: line, Col: 1},
	})
	c.groupStack = append(c.groupStack, id)
}

func (c *mermaidCtx) parseC4Relation(family string, args []mermaidArg, line int) {
	if strings.Contains(family, "Index") && len(args) > 0 && !args[0].quoted {
		args = args[1:]
	}
	fromIndex, toIndex := 0, 1
	if strings.HasSuffix(family, "_Back") {
		fromIndex, toIndex = 1, 0
	}
	from, to := argAt(args, fromIndex), argAt(args, toIndex)
	if from == "" || to == "" {
		c.warn(line, family+": missing endpoint")
		return
	}
	link := ir.Link{
		From: from, To: to, Label: stringPtr(argAt(args, 2)), Bidir: strings.HasPrefix(family, "BiRel"),
		Pos: ir.Pos{Line: line, Col: 1},
	}
	if tech := argAt(args, 3); tech != "" {
		link.Comments = []string{"technology: " + tech}
	}
	c.links = append(c.links, link)
}

func (c *mermaidCtx) parseC4Call(family string, args []mermaidArg, line int) bool {
	if c4Boundaries[family] {
		c.parseC4Boundary(args, line)
		return true
	}
	if spec, ok := c4Elements[family]; ok {
		c.parseC4Element(family, spec, args, line)
		return true
	}
	if c4Relations[family] {
		c.parseC4Relation(family, args, line)
		return true
	}
	return false
}

func c4Level(header string) string {
	switch header {
	case "C4Context":
		return "context"
	case "C4Component":
		return "component"
	case "C4Deployment":
		return "deployment"
	default:
		return "container"
	}
}

func fromC4Mermaid(src string) MermaidResult {
	ctx := newMermaidCtx()
	level := mermaidDefaultLevel
	title := ""
	for index, raw := range strings.Split(src, "\n") {
		line := index + 1
		text := strings.TrimSpace(raw)
		if text == "" || strings.HasPrefix(text, "%%") {
			continue
		}
		if match := c4HeaderRE.FindStringSubmatch(text); match != nil {
			level = c4Level(match[1])
			continue
		}
		if match := c4TitleRE.FindStringSubmatch(text); match != nil {
			title = cleanMermaidText(match[1])
			continue
		}
		if c4EndRE.MatchString(text) {
			if len(ctx.groupStack) > 0 {
				ctx.groupStack = ctx.groupStack[:len(ctx.groupStack)-1]
			}
			continue
		}
		if c4IgnoredRE.MatchString(text) {
			ctx.info(line, "C4 directive ignored: "+firstField(text))
			continue
		}
		match := c4CallRE.FindStringSubmatch(text)
		if match == nil {
			ctx.warn(line, "unrecognized line skipped: "+text)
			continue
		}
		if !ctx.parseC4Call(match[1], splitMermaidArgs(match[2]), line) {
			ctx.warn(line, "unknown C4 statement \""+match[1]+"\" skipped")
		}
	}
	return ctx.result(level, title, "", nil)
}
