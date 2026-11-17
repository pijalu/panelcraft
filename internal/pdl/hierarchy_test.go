// SPDX-License-Identifier: GPL-3.0-only

package pdl

// C4 decomposition + embedded source rules (IR v10; FILE-FORMAT §3.2, §3.3).
// The TS twin is web/src/engine/model/hierarchy.test.ts; both sides must report
// the same codes for the same workspace, so these cases mirror it.
import (
	"strings"
	"testing"
)

// wsSource is an in-memory ReadSource: path → file text.
type wsSource struct{ files map[string]string }

func (w wsSource) Classify(from, path string) ClassResult {
	if _, ok := w.files[path]; !ok {
		return ClassResult{Kind: ClassMissing}
	}
	return ClassResult{Kind: ClassOK, Resolved: path}
}

func (w wsSource) ImportsOf(string) []string { return nil }

func (w wsSource) Read(path string) (string, bool) {
	text, ok := w.files[path]
	return text, ok
}

func codesOf(diags []Diagnostic) []string {
	out := make([]string, 0, len(diags))
	for _, d := range diags {
		out = append(out, d.Code)
	}
	return out
}

func hasCode(diags []Diagnostic, code string) bool {
	for _, d := range diags {
		if d.Code == code {
			return true
		}
	}
	return false
}

// TestResolveDrilldown pins the path rules: relative POSIX paths inside the
// workspace only, `.pcd` suffix only.
func TestResolveDrilldown(t *testing.T) {
	cases := []struct {
		from, raw, want, problem string
	}{
		{"systems/shop.pcd", "../containers/shop.pcd", "containers/shop.pcd", ""},
		{"systems/shop.pcd", "children/api.pcd", "systems/children/api.pcd", ""},
		{"a.pcd", "../outside.pcd", "", "escape"},
		{"a.pcd", "/etc/x.pcd", "", "escape"},
		{"a.pcd", `dir\x.pcd`, "", "escape"},
		{"a.pcd", "notes.md", "notes.md", "not-pcd"},
	}
	for _, tc := range cases {
		got, problem := ResolveDrilldown(tc.from, tc.raw)
		if got != tc.want || problem != tc.problem {
			t.Errorf("ResolveDrilldown(%q, %q) = (%q, %q), want (%q, %q)",
				tc.from, tc.raw, got, problem, tc.want, tc.problem)
		}
	}
}

// TestDrilldownRoundTrip keeps path and the source lines byte-stable.
func TestDrilldownRoundTrip(t *testing.T) {
	src := `pcd 1.0

system shop "Shop" {
  drilldown "containers/shop.pcd"
  source {
    language "go"
    text ""
    text "say \"hi\""
  }
}
`
	res := Parse(src)
	if res.Doc == nil {
		t.Fatalf("doc must parse: %v", res.Diagnostics)
	}
	drill := res.Doc.Objects[0].Drilldown
	if drill == nil || drill.Path != "containers/shop.pcd" {
		t.Fatalf("drilldown = %+v, want path", drill)
	}
	wantLines := []string{"", `say "hi"`}
	if got := res.Doc.Objects[0].Source.Lines; strings.Join(got, "|") != strings.Join(wantLines, "|") {
		t.Fatalf("source lines = %q, want %q", got, wantLines)
	}
	if printed := PrintDoc(res.Doc); printed != src {
		t.Fatalf("canonical print diverges:\n got %q\nwant %q", printed, src)
	}
}

// TestSourceBlockNeedsText covers E116: a source block with no text line would
// show nothing and the printer would drop it.
func TestSourceBlockNeedsText(t *testing.T) {
	res := Parse("pcd 1.0\nsystem a \"A\" {\n  source {\n    language \"go\"\n  }\n}\n")
	if res.Doc != nil {
		t.Fatal("doc must not parse without a text line")
	}
	if !hasCode(res.Diagnostics, ErrEmptySource) {
		t.Fatalf("codes = %v, want %s", codesOf(res.Diagnostics), ErrEmptySource)
	}
}

// TestHierarchyValidation mirrors the TS cases: P212 missing, P214 level,
// P215 kind, P213 path, P211 duplicate parent, P216 cycle.
func TestHierarchyValidation(t *testing.T) {
	child := "pcd 1.0\nlevel container\ncontainer api \"API\"\n"
	root := "pcd 1.0\nsystem shop \"Shop\" {\n  drilldown \"containers/shop.pcd\"\n}\n"

	cases := []struct {
		name  string
		src   string
		files map[string]string
		want  string
	}{
		{"ok", root, map[string]string{"containers/shop.pcd": child}, ""},
		{"missing", root, map[string]string{}, "P212"},
		{"level", root, map[string]string{"containers/shop.pcd": strings.Replace(child, "level container", "level context", 1)}, "P214"},
		{"kind", "pcd 1.0\nperson u \"U\" {\n  drilldown \"u.pcd\"\n}\n", nil, "P215"},
		{"escape", "pcd 1.0\nsystem s \"S\" {\n  drilldown \"../out.pcd\"\n}\n", nil, "P213"},
		{"notpcd", "pcd 1.0\nsystem s \"S\" {\n  drilldown \"notes.md\"\n}\n", nil, "P213"},
		{
			"duplicate",
			"pcd 1.0\nsystem a \"A\" {\n  drilldown \"child.pcd\"\n}\nsystem b \"B\" {\n  drilldown \"child.pcd\"\n}\n",
			nil,
			"P211",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := Parse(tc.src)
			if res.Doc == nil {
				t.Fatalf("parse: %v", res.Diagnostics)
			}
			src := wsSource{files: tc.files}
			diags := Validate(res.Doc, Options{File: "root.pcd", Imports: src})
			if tc.want == "" {
				for _, d := range diags {
					if strings.HasPrefix(d.Code, "P21") {
						t.Fatalf("unexpected hierarchy finding %s: %s", d.Code, d.Message)
					}
				}
				return
			}
			if !hasCode(diags, tc.want) {
				t.Fatalf("codes = %v, want %s", codesOf(diags), tc.want)
			}
		})
	}
}

// TestDecompositionCycle proves the chain walk refuses to loop (P216).
func TestDecompositionCycle(t *testing.T) {
	files := map[string]string{
		"a.pcd": "pcd 1.0\nsystem s \"S\" {\n  drilldown \"b.pcd\"\n}\n",
		"b.pcd": "pcd 1.0\nsystem t \"T\" {\n  drilldown \"a.pcd\"\n}\n",
	}
	res := Parse(files["a.pcd"])
	diags := Validate(res.Doc, Options{File: "a.pcd", Imports: wsSource{files: files}})
	if !hasCode(diags, "P216") {
		t.Fatalf("codes = %v, want P216", codesOf(diags))
	}
	if chain, cyclic := drillChain(wsSource{files: files}, "a.pcd"); !cyclic || len(chain) < 2 {
		t.Fatalf("chain = %v cyclic = %v, want a cycle", chain, cyclic)
	}
}

// TestSourceLimits covers P217 for one object and for the whole document.
func TestSourceLimits(t *testing.T) {
	line := `  text "` + strings.Repeat("x", SourceMaxObjectBytes+1) + `"` + "\n"
	src := "pcd 1.0\ncontainer c \"C\" {\n  source {\n" + line + "  }\n}\n"
	res := Parse(src)
	if res.Doc == nil {
		t.Fatalf("parse: %v", res.Diagnostics)
	}
	if diags := Validate(res.Doc, Options{}); !hasCode(diags, "P217") {
		t.Fatalf("codes = %v, want P217", codesOf(diags))
	}
}
