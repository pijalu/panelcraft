// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/ir"
)

type fxCase struct {
	Name          string       `json:"name"`
	Src           string       `json:"src"`
	Doc           *string      `json:"doc"`
	Print         *string      `json:"print"`
	ParseDiags    []Diagnostic `json:"parseDiags"`
	ValidateDiags []Diagnostic `json:"validateDiags"`
}

type fxFile struct {
	Version int      `json:"version"`
	Cases   []fxCase `json:"cases"`
}

func loadFixture(t *testing.T) []fxCase {
	t.Helper()
	raw, err := os.ReadFile("../../testdata/pdl-cases.json")
	if err != nil {
		t.Fatalf("read fixture: %v (regenerate with CORPUS_FIXTURE=1 npx vitest run web/src/engine/format/parity.test.ts)", err)
	}
	var fx fxFile
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatalf("fixture json: %v", err)
	}
	if fx.Version != 1 {
		t.Fatalf("fixture version %d, want 1", fx.Version)
	}
	return fx.Cases
}

func assertDiags(t *testing.T, what string, want, got []Diagnostic) {
	t.Helper()
	if len(want) == len(got) {
		same := true
		for i := range want {
			if want[i] != got[i] {
				same = false
				break
			}
		}
		if same {
			return
		}
	}
	t.Fatalf("%s diagnostics diverge:\n got: %+v\nwant: %+v", what, got, want)
}

// TestParityFixture runs the shared TS⇄Go fixture (M1-WP7): for every case the
// Go engine must produce byte-identical IR JSON, identical canonical PDL, and
// identical parse + validation diagnostics as the TS reference.
func TestParityFixture(t *testing.T) {
	for _, tc := range loadFixture(t) {
		t.Run(tc.Name, func(t *testing.T) {
			res := Parse(tc.Src)
			assertDiags(t, "parse", tc.ParseDiags, res.Diagnostics)
			if tc.Doc == nil {
				if res.Doc != nil {
					t.Fatalf("doc must be nil (syntax abort)")
				}
				return
			}
			if res.Doc == nil {
				t.Fatalf("doc must parse")
			}
			out, err := ir.Marshal(res.Doc)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			if got := strings.TrimRight(string(out), "\n"); got != *tc.Doc {
				t.Fatalf("IR JSON diverges:\n got: %s\nwant: %s", got, *tc.Doc)
			}
			if got := PrintDoc(res.Doc); got != *tc.Print {
				t.Fatalf("canonical PDL diverges:\n got: %q\nwant: %q", got, *tc.Print)
			}
			assertDiags(t, "validate", tc.ValidateDiags, Validate(res.Doc, Options{}))
		})
	}
}

// fakeImports is an in-memory ImportSource (mirrors the TS validate tests).
type fakeImports struct {
	graph   map[string][]string // resolved → raw import paths
	resolve map[string]string   // path → resolved id
	texts   map[string]string   // resolved → file text (decomposition probe)
}

func (f fakeImports) Classify(from, path string) ClassResult {
	if path == "../outside.pcd" {
		return ClassResult{Kind: ClassEscape}
	}
	if id, ok := f.resolve[path]; ok {
		return ClassResult{Kind: ClassOK, Resolved: id}
	}
	return ClassResult{Kind: ClassMissing}
}

func (f fakeImports) ImportsOf(resolved string) []string { return f.graph[resolved] }

// Read serves the decomposition rules (§3.2): texts holds parsed-file bodies.
func (f fakeImports) Read(resolved string) (string, bool) {
	text, ok := f.texts[resolved]
	return text, ok
}

// TestValidateImports covers the import-graph rules the shared fixture skips
// (they need a probe): P102 cycle, P103 escape, P200 missing.
func TestValidateImports(t *testing.T) {
	fx := fakeImports{
		graph: map[string][]string{
			"root.pcd": {"a.pcd", "gone.pcd", "../outside.pcd"},
			"a.pcd":    {"b.pcd"},
			"b.pcd":    {"a.pcd"}, // cycle a ↔ b
		},
		resolve: map[string]string{"a.pcd": "a.pcd", "b.pcd": "b.pcd"},
	}
	src := "pcd 1.0\nimport alpha as \"a.pcd\"\nimport beta as \"gone.pcd\"\nimport gamma as \"../outside.pcd\"\n"
	res := Parse(src)
	if res.Doc == nil {
		t.Fatalf("doc must parse")
	}
	got := Validate(res.Doc, Options{File: "root.pcd", Imports: fx})
	want := []Diagnostic{
		{Code: "P102", Message: "import cycle through \"a.pcd\"", Line: 2, Col: 1, Severity: SevError},
		{Code: "P200", Message: "imported file not found: \"gone.pcd\"", Line: 3, Col: 1, Severity: SevWarning},
		{Code: "P103", Message: "import path escapes the workspace: \"../outside.pcd\"", Line: 4, Col: 1, Severity: SevError},
	}
	assertDiags(t, "validate", want, got)
}
