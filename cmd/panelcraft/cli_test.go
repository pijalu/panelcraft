// SPDX-License-Identifier: GPL-3.0-only

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/ir"
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

func TestConvert(t *testing.T) {
	dir := t.TempDir()
	path := writeFile(t, dir, "ok.pcd", srcClean)
	var stdout, stderr strings.Builder
	if got := runConvert([]string{path}, &stdout, &stderr); got != 0 {
		t.Fatalf("exit %d, want 0", got)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "ok.ir.json"))
	if err != nil {
		t.Fatalf("ir.json not written: %v", err)
	}
	res := pdl.Parse(srcClean)
	want, _ := ir.Marshal(res.Doc)
	if string(raw) != string(want) {
		t.Fatalf("ir.json diverges from ir.Marshal:\n got %s\nwant %s", raw, want)
	}

	// --out DIR
	outDir := filepath.Join(dir, "ir")
	if got := runConvert([]string{"--out", outDir, path}, &stdout, &stderr); got != 0 {
		t.Fatalf("--out exit %d, want 0", got)
	}
	if _, err := os.Stat(filepath.Join(outDir, "ok.ir.json")); err != nil {
		t.Fatalf("--out file missing: %v", err)
	}

	// parse abort → 1, no output
	abort := writeFile(t, dir, "abort.pcd", srcAbort)
	stdout.Reset()
	if got := runConvert([]string{abort}, &stdout, &stderr); got != 1 {
		t.Fatalf("abort exit %d, want 1", got)
	}
	if _, err := os.Stat(filepath.Join(dir, "abort.ir.json")); !os.IsNotExist(err) {
		t.Fatalf("abort must not write output")
	}
	if !strings.Contains(stderr.String(), "E104") {
		t.Fatalf("abort should print E104 to stderr:\n%s", stderr.String())
	}

	// usage errors → 2
	if got := runConvert([]string{filepath.Join(dir, "nope.pcd")}, &stdout, &stderr); got != 2 {
		t.Fatalf("missing file exit %d, want 2", got)
	}
	if got := runConvert(nil, &stdout, &stderr); got != 2 {
		t.Fatalf("no args exit %d, want 2", got)
	}
}
