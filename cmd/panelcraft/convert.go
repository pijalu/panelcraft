// SPDX-License-Identifier: GPL-3.0-only

// convert command (M1-WP9) — `panelcraft convert [--out DIR] PATH...`.
// Parses each .pcd file and writes its canonical IR JSON as <name>.ir.json.
// Convert is a format transform: semantic findings do not block it (that is
// validate's job); parse aborts do (exit 1), usage errors are exit 2.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
	"github.com/pijalu/panelcraft/internal/pdl"
)

// runConvert executes the convert command; returns the process exit code.
func runConvert(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("convert", flag.ExitOnError)
	outDir := flags.String("out", "", "write output files here (default: next to each input)")
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
		fmt.Fprintf(stderr, "panelcraft: convert takes at least one PATH\n")
		return 2
	}
	if *outDir != "" {
		if err := os.MkdirAll(*outDir, 0o755); err != nil {
			fmt.Fprintf(stderr, "panelcraft: %v\n", err)
			return 2
		}
	}

	exit := 0
	for _, path := range files {
		code := convertOne(path, *outDir, stdout, stderr)
		if code > exit {
			exit = code
		}
	}
	return exit
}

func convertOne(path, outDir string, stdout, stderr io.Writer) int {
	src, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	res := pdl.Parse(string(src))
	if res.Doc == nil {
		printDiags(stderr, path, res.Diagnostics)
		fmt.Fprintf(stderr, "panelcraft: %s: parse failed, no IR written\n", path)
		return 1
	}
	out, err := ir.Marshal(res.Doc)
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %s: %v\n", path, err)
		return 1
	}
	target := irTargetPath(path, outDir)
	if err := os.WriteFile(target, out, 0o644); err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "wrote %s\n", target)
	return 0
}

// irTargetPath: foo.pcd → foo.ir.json (or DIR/foo.ir.json with --out).
func irTargetPath(path, outDir string) string {
	base := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)) + ".ir.json"
	if outDir != "" {
		return filepath.Join(outDir, base)
	}
	return filepath.Join(filepath.Dir(path), base)
}
