// SPDX-License-Identifier: GPL-3.0-only

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/pdl"
)

// mapImports is an in-memory import graph for tests: graph[path] = imported
// paths; special lists misbehave. Mirrors the TS test helper srcOf.
type mapImports struct {
	graph   map[string][]string
	missing map[string]bool
	escapes map[string]bool
}

func (m mapImports) Classify(_from, path string) pdl.ClassResult {
	switch {
	case m.escapes[path]:
		return pdl.ClassResult{Kind: pdl.ClassEscape}
	case m.missing[path]:
		return pdl.ClassResult{Kind: pdl.ClassMissing}
	}
	return pdl.ClassResult{Kind: pdl.ClassOK, Resolved: path}
}

func (m mapImports) ImportsOf(resolved string) []string {
	return m.graph[resolved]
}

func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
	return path
}

const (
	srcClean = "pcd 1.0\nperson a \"A\"\nperson b \"B\"\na -> b\n"
	srcWarn  = "pcd 1.0\nperson lonely \"L\"\n"                    // P201 warning only
	srcErr   = "pcd 1.0\nperson a \"A\"\nflow {\n a -> ghost\n}\n" // P101 + P201
	srcAbort = "pcd 1.0\nperson a \"A\" {\n"                       // E104
)

func TestValidateExitCodes(t *testing.T) {
	dir := t.TempDir()
	cases := []struct {
		name    string
		src     string
		want    int
		wantOut string
	}{
		{"clean.pcd", srcClean, 0, ""},
		{"warn.pcd", srcWarn, 0, "P201"}, // warnings never fail (D-M1-20)
		{"err.pcd", srcErr, 1, "P101"},
		{"abort.pcd", srcAbort, 1, "E104"}, // parse abort
	}
	for _, tc := range cases {
		writeFile(t, dir, tc.name, tc.src)
	}
	for _, tc := range cases {
		var stdout, stderr strings.Builder
		got := runValidate([]string{filepath.Join(dir, tc.name)}, &stdout, &stderr)
		if got != tc.want {
			t.Fatalf("%s: exit %d, want %d (stdout: %q)", tc.name, got, tc.want, stdout.String())
		}
		if tc.wantOut != "" && !strings.Contains(stdout.String(), tc.wantOut) {
			t.Fatalf("%s: stdout missing %s:\n%s", tc.name, tc.wantOut, stdout.String())
		}
		if !strings.Contains(stdout.String(), "1 files checked") {
			t.Fatalf("%s: missing summary:\n%s", tc.name, stdout.String())
		}
	}
}

func TestValidateJSON(t *testing.T) {
	dir := t.TempDir()
	path := writeFile(t, dir, "err.pcd", srcErr)
	var stdout, stderr strings.Builder
	got := runValidate([]string{"--json", path}, &stdout, &stderr)
	if got != 1 {
		t.Fatalf("exit %d, want 1", got)
	}
	var report struct {
		Files []struct {
			File        string           `json:"file"`
			Diagnostics []pdl.Diagnostic `json:"diagnostics"`
		} `json:"files"`
		Errors int `json:"errors"`
	}
	if err := json.Unmarshal([]byte(stdout.String()), &report); err != nil {
		t.Fatalf("stdout is not valid JSON: %v\n%s", err, stdout.String())
	}
	if report.Errors != 2 || len(report.Files) != 1 || len(report.Files[0].Diagnostics) != 2 {
		t.Fatalf("unexpected report: %+v", report)
	}
	if report.Files[0].Diagnostics[0].Code != "P101" {
		t.Fatalf("first finding should be P101 (sorted): %+v", report.Files[0].Diagnostics[0])
	}
}

func TestValidateDirGlob(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "a-clean.pcd", srcClean)
	writeFile(t, dir, "b-err.pcd", srcErr)
	writeFile(t, dir, "notes.txt", "not a diagram")
	var stdout, stderr strings.Builder
	if got := runValidate([]string{dir}, &stdout, &stderr); got != 1 {
		t.Fatalf("exit %d, want 1", got)
	}
	if !strings.Contains(stdout.String(), "2 files checked") {
		t.Fatalf("glob should pick only .pcd files:\n%s", stdout.String())
	}
}

// TestValidateDocsExitZero is the CI dogfood gate (WP9): PanelCraft's own
// architecture docs must validate clean (warnings do not gate, D-M1-20).
func TestValidateDocsExitZero(t *testing.T) {
	t.Chdir("../..")
	var stdout, stderr strings.Builder
	if got := runValidate([]string{"docs/architecture"}, &stdout, &stderr); got != 0 {
		t.Fatalf("docs/architecture must validate with exit 0, got %d\n%s", got, stdout.String())
	}
}

func TestValidateUsageErrors(t *testing.T) {
	dir := t.TempDir()
	empty := filepath.Join(dir, "empty")
	if err := os.MkdirAll(empty, 0o755); err != nil {
		t.Fatal(err)
	}
	cases := [][]string{
		{},                               // no PATH
		{filepath.Join(dir, "nope.pcd")}, // missing file
		{empty},                          // dir without .pcd
	}
	for _, args := range cases {
		var stdout, stderr strings.Builder
		if got := runValidate(args, &stdout, &stderr); got != 2 {
			t.Fatalf("args %v: exit %d, want 2", args, got)
		}
	}
}

// TestValidateImportRules exercises P102/P103/P200 through an in-memory
// graph (same shape as the TS validate tests; keeps the CLI test deterministic
// without depending on where the go tool runs it from).
func TestValidateImportRules(t *testing.T) {
	head := "pcd 1.0\n"
	v := func(src string, probe pdl.ImportSource) []pdl.Diagnostic {
		res := pdl.Parse(src)
		if res.Doc == nil {
			t.Fatalf("parse aborted: %+v", res.Diagnostics)
		}
		return pdl.Validate(res.Doc, pdl.Options{File: "a.pcd", Imports: probe})
	}

	t.Run("two-file cycle", func(t *testing.T) {
		ds := v(head+"import b as \"b.pcd\"\nperson a \"A\"\n", mapImports{
			graph: map[string][]string{"b.pcd": {"a.pcd"}},
		})
		got := filterCodes(ds, "P102")
		if len(got) != 1 {
			t.Fatalf("P102 x%d, want 1: %+v", len(got), ds)
		}
	})
	t.Run("missing import is P200 warning", func(t *testing.T) {
		ds := v(head+"import x as \"nope.pcd\"\nperson a \"A\"\n", mapImports{
			missing: map[string]bool{"nope.pcd": true},
		})
		got := filterCodes(ds, "P200")
		if len(got) != 1 || got[0].Severity != pdl.SevWarning {
			t.Fatalf("want exactly one P200 warning: %+v", ds)
		}
	})
	t.Run("escape is P103 error", func(t *testing.T) {
		ds := v(head+"import x as \"../../../etc/passwd\"\nperson a \"A\"\n", mapImports{
			escapes: map[string]bool{"../../../etc/passwd": true},
		})
		got := filterCodes(ds, "P103")
		if len(got) != 1 || got[0].Severity != pdl.SevError {
			t.Fatalf("want exactly one P103 error: %+v", ds)
		}
	})
	t.Run("clean diamond", func(t *testing.T) {
		ds := v(head+"import b as \"b.pcd\"\nimport c as \"c.pcd\"\nperson a \"A\"\n", mapImports{
			graph: map[string][]string{"b.pcd": {"d.pcd"}, "c.pcd": {"d.pcd"}, "d.pcd": {}},
		})
		if got := filterCodes(ds, "P102"); len(got) != 0 {
			t.Fatalf("diamond flagged P102: %+v", ds)
		}
	})
}

func filterCodes(ds []pdl.Diagnostic, code string) []pdl.Diagnostic {
	var out []pdl.Diagnostic
	for _, d := range ds {
		if d.Code == code {
			out = append(out, d)
		}
	}
	return out
}

func TestConvertMermaidFlowchart(t *testing.T) {
	dir := t.TempDir()
	input := writeFile(t, dir, "architecture.mmd", `flowchart LR
  user((Customer))
  subgraph shop[Online shop]
    web[Web app]
    db[(Orders)]
  end
  user -->|uses| web
  web -.-> db
  style web fill:#fff
`)
	out := filepath.Join(dir, "nested", "architecture.pcd")
	var stdout, stderr strings.Builder
	// SPEC form: flags may follow the input path.
	if got := runConvert([]string{input, "-o", out}, &stdout, &stderr); got != 0 {
		t.Fatalf("convert exit %d, want 0; stderr=%s", got, stderr.String())
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	parsed := pdl.Parse(string(raw))
	if parsed.Doc == nil {
		t.Fatalf("output is not valid PDL: %+v", parsed.Diagnostics)
	}
	if parsed.Doc.Direction != "LR" || len(parsed.Doc.Objects) != 4 || len(parsed.Doc.Links) != 2 {
		t.Fatalf("unexpected conversion: %s", raw)
	}
	var groupFound bool
	for _, obj := range parsed.Doc.Objects {
		if obj.Kind == "group" && obj.ID == "shop" && len(obj.Contains) == 2 {
			groupFound = true
		}
	}
	if !groupFound {
		t.Fatalf("C4-style boundary was not preserved: %s", raw)
	}
	if !strings.Contains(stderr.String(), "M200") {
		t.Fatalf("unsupported style must be diagnosed, not silently dropped: %s", stderr.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "architecture.ir.json")); !os.IsNotExist(err) {
		t.Fatal("convert must write canonical PDL, not IR JSON")
	}
}

func TestConvertMermaidC4(t *testing.T) {
	dir := t.TempDir()
	input := writeFile(t, dir, "c4.mmd", `C4Context
  title Online shop
  Person(customer, "Customer")
  System_Ext(payments, "Payment provider")
  System_Boundary(shop, "Online shop") {
    Container(web, "Web app", "Go", "Serves the shop")
    ContainerDb(db, "Orders", "PostgreSQL")
  }
  Rel(customer, web, "Uses")
  BiRel(web, payments, "Charges", "HTTPS")
`)
	out := filepath.Join(dir, "c4.pcd")
	var stdout, stderr strings.Builder
	if got := runConvert([]string{"-o", out, input}, &stdout, &stderr); got != 0 {
		t.Fatalf("C4 convert exit %d, want 0; stderr=%s", got, stderr.String())
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	parsed := pdl.Parse(string(raw))
	if parsed.Doc == nil || parsed.Doc.Level != "context" || len(parsed.Doc.Objects) != 5 {
		t.Fatalf("unexpected C4 conversion: %s (%+v)", raw, parsed.Diagnostics)
	}
	if len(parsed.Doc.Links) != 2 || !parsed.Doc.Links[1].Bidir {
		t.Fatalf("C4 relationships were not preserved: %s", raw)
	}
	if !strings.Contains(string(raw), `technology "Go"`) || !strings.Contains(string(raw), "technology: HTTPS") {
		t.Fatalf("C4 technology metadata was dropped: %s", raw)
	}
}

func TestConvertCanonicalizesPCDAndDefaultsOutput(t *testing.T) {
	dir := t.TempDir()
	input := writeFile(t, dir, "ok.pcd", srcClean)
	var stdout, stderr strings.Builder
	if got := runConvert([]string{input}, &stdout, &stderr); got != 0 {
		t.Fatalf("exit %d, want 0", got)
	}
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	parsed := pdl.Parse(srcClean)
	want := pdl.PrintDoc(parsed.Doc)
	if string(raw) != want {
		t.Fatalf("canonical PDL diverges:\n got %s\nwant %s", raw, want)
	}

	mermaid := writeFile(t, dir, "default.mmd", "graph TD\na[A] --> b[B]\n")
	stdout.Reset()
	stderr.Reset()
	if got := runConvert([]string{mermaid}, &stdout, &stderr); got != 0 {
		t.Fatalf("default output exit %d: %s", got, stderr.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "default.pcd")); err != nil {
		t.Fatalf("default .pcd output missing: %v", err)
	}
}

func TestConvertErrors(t *testing.T) {
	dir := t.TempDir()
	abort := writeFile(t, dir, "abort.pcd", srcAbort)
	unsupported := writeFile(t, dir, "diagram.svg", "<svg/>")
	cases := []struct {
		args []string
		code int
	}{
		{[]string{abort}, 1},
		{[]string{filepath.Join(dir, "nope.pcd")}, 2},
		{nil, 2},
		{[]string{unsupported}, 2},
		{[]string{abort, abort}, 2},
	}
	for _, tc := range cases {
		var stdout, stderr strings.Builder
		if got := runConvert(tc.args, &stdout, &stderr); got != tc.code {
			t.Fatalf("args %v: exit %d, want %d (%s)", tc.args, got, tc.code, stderr.String())
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "abort.pcd")); err != nil {
		t.Fatal(err)
	}
}

// TestValidateHierarchy proves the CLI reads the child diagram a `drilldown`
// points at (FILE-FORMAT §3.2): a level mismatch is an error, a missing target is
// only a warning, so a half-built hierarchy still validates its parent.
func TestValidateHierarchy(t *testing.T) {
	const parent = "pcd 1.0\nsystem shop \"Shop\" {\n  drilldown %q\n}\n"
	cases := []struct {
		name     string
		child    string
		childDoc string
		want     int
		wantCode string
	}{
		{"level.pcd", "child.pcd", "pcd 1.0\nlevel context\ncontainer api \"API\"\n", 1, "P214"},
		{"ok.pcd", "child.pcd", "pcd 1.0\nlevel container\ncontainer api \"API\"\n", 0, ""},
		{"gone.pcd", "missing.pcd", "", 0, "P212"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			if tc.childDoc != "" {
				writeFile(t, dir, tc.child, tc.childDoc)
			}
			path := writeFile(t, dir, tc.name, fmt.Sprintf(parent, tc.child))
			var stdout, stderr strings.Builder
			if got := runValidate([]string{path}, &stdout, &stderr); got != tc.want {
				t.Fatalf("exit %d, want %d (stdout: %q)", got, tc.want, stdout.String())
			}
			if tc.wantCode != "" && !strings.Contains(stdout.String(), tc.wantCode) {
				t.Fatalf("stdout missing %s:\n%s", tc.wantCode, stdout.String())
			}
		})
	}
}
