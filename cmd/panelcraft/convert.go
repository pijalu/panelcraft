// SPDX-License-Identifier: GPL-3.0-only

// convert command (SPEC FR-X) — Mermaid → canonical PDL, or PDL canonicalisation.
// Semantic findings do not block conversion; fatal PDL parses do (exit 1),
// usage and IO errors are exit 2.
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

var convertValueFlags = map[string]bool{"--out": true, "-o": true}

// runConvert executes the convert command; returns the process exit code.
func runConvert(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("convert", flag.ContinueOnError)
	flags.SetOutput(stderr)
	out := flags.String("out", "", "output .pcd path (default: next to input)")
	flags.StringVar(out, "o", "", "output .pcd path")
	if err := flags.Parse(flagsFirst(args, convertValueFlags)); err != nil {
		return 2
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(stderr, "panelcraft: convert takes one input .mmd/.mermaid/.txt/.pcd file")
		return 2
	}
	input := flags.Arg(0)
	src, err := os.ReadFile(input)
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	doc, diags, code := convertDocument(input, string(src))
	if code != 0 {
		printDiags(stderr, input, diags)
		fmt.Fprintf(stderr, "panelcraft: %s: conversion failed, no output written\n", input)
		return code
	}
	printDiags(stderr, input, diags)
	target, err := convertTargetPath(input, *out)
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	if err := writeOutput(target, []byte(pdl.PrintDoc(doc))); err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	fmt.Fprintf(stdout, "wrote %s\n", target)
	return 0
}

func convertDocument(path, source string) (*ir.Doc, []pdl.Diagnostic, int) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".pcd":
		result := pdl.Parse(source)
		if result.Doc == nil {
			return nil, result.Diagnostics, 1
		}
		return result.Doc, result.Diagnostics, 0
	case ".mmd", ".mermaid", ".txt":
		result := pdl.FromMermaid(source)
		return result.Doc, result.Diagnostics, 0
	default:
		return nil, []pdl.Diagnostic{{
			Code: pdl.MermaidUnsupported, Message: "unsupported convert input type: " + ext,
			Line: 1, Col: 1, Severity: pdl.SevError,
		}}, 2
	}
}

func convertTargetPath(input, out string) (string, error) {
	defaultName := strings.TrimSuffix(filepath.Base(input), filepath.Ext(input)) + ".pcd"
	if out == "" {
		if strings.EqualFold(filepath.Ext(input), ".pcd") {
			return input, nil
		}
		return filepath.Join(filepath.Dir(input), defaultName), nil
	}
	if info, err := os.Stat(out); err == nil && info.IsDir() {
		return filepath.Join(out, defaultName), nil
	}
	if strings.HasSuffix(out, string(os.PathSeparator)) {
		return filepath.Join(out, defaultName), nil
	}
	if !strings.EqualFold(filepath.Ext(out), ".pcd") {
		return "", fmt.Errorf("--out must be a .pcd file or an existing directory")
	}
	return out, nil
}
