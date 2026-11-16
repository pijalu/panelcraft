// SPDX-License-Identifier: GPL-3.0-only

// validate command (M1-WP9) — `panelcraft validate [flags] PATH...`.
// PATH may be a file or a directory (globbed for *.pcd, sorted). Exit codes
// per D-M1-20: 0 = no error-severity findings (warnings/info never fail,
// `panelcraft validate docs/architecture` stays green), 1 = at least one
// error-severity finding (P1xx / E1xx parse aborts), 2 = usage errors.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pijalu/panelcraft/internal/pdl"
)

// fsImports is the filesystem-backed import probe (§10 P102/P103/P200).
// The workspace is the process working directory; a path that climbs out of
// it is P103 (escape), a missing file is P200.
type fsImports struct{ workspace string }

func (f fsImports) resolve(from, path string) string {
	base := f.workspace
	if from != "" {
		base = filepath.Dir(from)
	}
	return filepath.Clean(filepath.Join(base, path))
}

func (f fsImports) Classify(from, path string) pdl.ClassResult {
	res := f.resolve(from, path)
	rel, err := filepath.Rel(f.workspace, res)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return pdl.ClassResult{Kind: pdl.ClassEscape}
	}
	if _, err := os.Stat(res); err != nil {
		return pdl.ClassResult{Kind: pdl.ClassMissing}
	}
	return pdl.ClassResult{Kind: pdl.ClassOK, Resolved: res}
}

func (f fsImports) ImportsOf(resolved string) []string {
	raw, err := os.ReadFile(resolved)
	if err != nil {
		return nil
	}
	res := pdl.Parse(string(raw))
	if res.Doc == nil {
		return nil
	}
	var out []string
	for _, imp := range res.Doc.Imports {
		out = append(out, imp.Path)
	}
	return out
}

// Read returns the file text so the decomposition rules (§3.2) can inspect the
// child diagram a `drilldown` points at. Slash paths are the format's spelling.
func (f fsImports) Read(resolved string) (string, bool) {
	raw, err := os.ReadFile(filepath.FromSlash(resolved))
	if err != nil {
		return "", false
	}
	return string(raw), true
}

// expandPaths resolves each PATH: files pass through, directories glob
// *.pcd (non-recursive, sorted). Any unresolvable path is a usage error (2).
func expandPaths(paths []string) ([]string, error) {
	var out []string
	for _, p := range paths {
		st, err := os.Stat(p)
		if err != nil {
			return nil, err
		}
		if !st.IsDir() {
			out = append(out, p)
			continue
		}
		matches, _ := filepath.Glob(filepath.Join(p, "*.pcd"))
		sort.Strings(matches)
		if len(matches) == 0 {
			return nil, fmt.Errorf("%s: no .pcd files", p)
		}
		out = append(out, matches...)
	}
	return out, nil
}

func printDiags(w io.Writer, path string, diags []pdl.Diagnostic) {
	for _, d := range diags {
		fmt.Fprintf(w, "%s:%d:%d: [%s] %s: %s\n", path, d.Line, d.Col, d.Severity, d.Code, d.Message)
	}
}

func countSeverities(diags []pdl.Diagnostic) (errs, warns, infos int) {
	for _, d := range diags {
		switch d.Severity {
		case pdl.SevError:
			errs++
		case pdl.SevWarning:
			warns++
		default:
			infos++
		}
	}
	return errs, warns, infos
}

// jsonFileReport is one file's findings in --json mode.
type jsonFileReport struct {
	File        string           `json:"file"`
	Diagnostics []pdl.Diagnostic `json:"diagnostics"`
}

type jsonReport struct {
	Files    []jsonFileReport `json:"files"`
	Errors   int              `json:"errors"`
	Warnings int              `json:"warnings"`
	Infos    int              `json:"infos"`
}

// runValidate executes the validate command; writes findings to stdout,
// usage errors to stderr; returns the process exit code (0/1/2).
func runValidate(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("validate", flag.ExitOnError)
	jsonOut := flags.Bool("json", false, "emit findings as JSON")
	if err := flags.Parse(args); err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	files, err := expandPaths(flags.Args())
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	if len(files) == 0 {
		fmt.Fprintf(stderr, "panelcraft: validate takes at least one PATH\n")
		return 2
	}
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	probe := fsImports{workspace: cwd}

	report := jsonReport{Files: []jsonFileReport{}}
	for _, path := range files {
		src, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(stderr, "panelcraft: %v\n", err)
			return 2
		}
		res := pdl.Parse(string(src))
		diags := res.Diagnostics
		if res.Doc != nil {
			diags = append(diags, pdl.Validate(res.Doc, pdl.Options{File: path, Imports: probe})...)
			pdl.SortByPosition(diags)
		}
		report.Files = append(report.Files, jsonFileReport{File: path, Diagnostics: diags})
		e, w, i := countSeverities(diags)
		report.Errors += e
		report.Warnings += w
		report.Infos += i
		if len(diags) > 0 && !*jsonOut {
			printDiags(stdout, path, diags)
		}
	}

	if *jsonOut {
		out, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			fmt.Fprintf(stderr, "panelcraft: %v\n", err)
			return 2
		}
		fmt.Fprintln(stdout, string(out))
		return codeFromCounts(report.Errors)
	}

	fmt.Fprintf(stdout, "%d files checked, %d errors, %d warnings, %d infos\n",
		len(report.Files), report.Errors, report.Warnings, report.Infos)
	return codeFromCounts(report.Errors)
}

func codeFromCounts(errs int) int {
	if errs > 0 {
		return 1
	}
	return 0
}
