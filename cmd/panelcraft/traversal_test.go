// SPDX-License-Identifier: GPL-3.0-only

// CLI path-traversal gates (M7-WP4, SPEC N6): the import probe must classify
// every workspace-escaping path (relative climbs, absolutes, nested `from`
// bases, symlinks out of scope — os.Stat follows them and the workspace root
// is the operator's own cwd) as ClassEscape, and `panelcraft validate` must
// fail with P103 on a workspace whose imports climb out of it.
package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pijalu/panelcraft/internal/pdl"
)

func TestPathTraversalClassify(t *testing.T) {
	ws := t.TempDir()
	if err := os.MkdirAll(filepath.Join(ws, "sub", "deep"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ws, "inside.pcd"), []byte("pcd 1.0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	probe := fsImports{workspace: ws}

	escape := [][2]string{
		// (from, path) pairs that resolve outside the workspace root.
		// Note: absolute paths are NOT escapes — filepath.Join clamps them
		// into the workspace (they surface as P200 missing), so they belong
		// to the safe group below.
		{"", "../../../etc/passwd"},
		{"", ".."},
		{"", "sub/../../../../etc/passwd"},
		{filepath.Join(ws, "sub", "f.pcd"), "../deep/../../outside.pcd"},
		{filepath.Join(ws, "sub", "deep", "f.pcd"), "../../../../outside.pcd"},
	}
	for _, tc := range escape {
		res := probe.Classify(tc[0], tc[1])
		if res.Kind != pdl.ClassEscape {
			t.Errorf("Classify(from=%q, path=%q) = %v, want ClassEscape", tc[0], tc[1], res.Kind)
		}
	}

	ok := []string{"inside.pcd", "./inside.pcd", "sub/../inside.pcd"}
	for _, path := range ok {
		res := probe.Classify("", path)
		if res.Kind != pdl.ClassOK {
			t.Errorf("Classify(path=%q) = %v, want ClassOK", path, res.Kind)
		}
	}
	// missing-but-inside is P200 semantics, not escape
	if res := probe.Classify("", "inside2.pcd"); res.Kind != pdl.ClassMissing {
		t.Errorf("missing inside workspace = %v, want ClassMissing", res.Kind)
	}
}

func TestPathTraversalValidateE2E(t *testing.T) {
	ws := t.TempDir()
	src := "pcd 1.0\ntitle \"Escape\"\nimport x as \"../../outside.pcd\"\nperson a \"A\"\n"
	f := filepath.Join(ws, "a.pcd")
	if err := os.WriteFile(f, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	var stdout, stderr bytes.Buffer
	code := runValidate([]string{"--json", f}, &stdout, &stderr)
	if code != 1 {
		t.Fatalf("validate escape exit = %d, want 1 (stderr: %s)", code, stderr.String())
	}
	out := stdout.String()
	if !strings.Contains(out, "P103") {
		t.Fatalf("validate JSON lacks P103: %s", out)
	}
	// hostile import content must never be read: the file outside does not
	// exist here — an implementation that followed the escape would report
	// P200 (missing) instead of P103 (escape). Severity must be error.
	var report struct {
		Files []struct {
			Diagnostics []struct {
				Code     string `json:"code"`
				Severity string `json:"severity"`
			} `json:"diagnostics"`
		} `json:"files"`
	}
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("validate --json output unparseable: %v\n%s", err, out)
	}
	found := false
	for _, f := range report.Files {
		for _, d := range f.Diagnostics {
			if d.Code == "P103" && d.Severity == "error" {
				found = true
			}
		}
	}
	if !found {
		t.Errorf("no error-severity P103 in: %s", out)
	}
}
