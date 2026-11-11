// SPDX-License-Identifier: GPL-3.0-only

package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/pijalu/panelcraft/internal/ir"
	"github.com/pijalu/panelcraft/internal/pdl"
	headless "github.com/pijalu/panelcraft/internal/render"
	"github.com/pijalu/panelcraft/web"
)

var renderValueFlags = map[string]bool{
	"--out": true, "-o": true, "--width": true, "--theme": true,
	"--view": true, "--chrome": true,
}

// runRender executes SPEC S6/FR-X: one PDL file → SVG/PNG via headless Chrome.
func runRender(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("render", flag.ContinueOnError)
	flags.SetOutput(stderr)
	out := flags.String("out", "", "output .png or .svg path")
	flags.StringVar(out, "o", "", "output .png or .svg path")
	width := flags.Int("width", 1920, "output width in CSS pixels")
	theme := flags.String("theme", "light", "light or dark")
	view := flags.String("view", "", "named view")
	chrome := flags.String("chrome", "", "Chrome executable path")
	if err := flags.Parse(flagsFirst(args, renderValueFlags)); err != nil {
		return 2
	}
	format, code := renderFormat(flags, *out, *theme, *width, stderr)
	if code != 0 {
		return code
	}

	input := flags.Arg(0)
	src, err := os.ReadFile(input)
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	parsed := pdl.Parse(string(src))
	if parsed.Doc == nil {
		printDiags(stderr, input, parsed.Diagnostics)
		return 1
	}
	if *view != "" && !hasView(parsed.Doc.Views, *view) {
		fmt.Fprintf(stderr, "panelcraft: view %q not found in %s\n", *view, input)
		return 1
	}
	assets, err := fs.Sub(web.Dist(), "dist")
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: embedded web assets: %v\n", err)
		return 1
	}
	data, err := headless.Render(context.Background(), string(src), headless.Options{
		Assets: assets, Width: *width, Theme: *theme, View: *view,
		Chrome: *chrome, Format: format,
	})
	if err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 1
	}
	if err := writeOutput(*out, data); err != nil {
		fmt.Fprintf(stderr, "panelcraft: %v\n", err)
		return 2
	}
	fmt.Fprintf(stdout, "wrote %s\n", *out)
	return 0
}

func renderFormat(flags *flag.FlagSet, out, theme string, width int, stderr io.Writer) (string, int) {
	if flags.NArg() != 1 {
		fmt.Fprintln(stderr, "panelcraft: render takes one input .pcd file")
		return "", 2
	}
	if out == "" {
		fmt.Fprintln(stderr, "panelcraft: render requires --out out.png|svg")
		return "", 2
	}
	format := strings.ToLower(strings.TrimPrefix(filepath.Ext(out), "."))
	if format != "png" && format != "svg" {
		fmt.Fprintln(stderr, "panelcraft: --out must end in .png or .svg")
		return "", 2
	}
	if width <= 0 || width > 16384 {
		fmt.Fprintln(stderr, "panelcraft: --width must be between 1 and 16384")
		return "", 2
	}
	if theme != "light" && theme != "dark" {
		fmt.Fprintln(stderr, "panelcraft: --theme must be light or dark")
		return "", 2
	}
	return format, 0
}

func hasView(views []ir.View, name string) bool {
	for _, view := range views {
		if view.Name == name {
			return true
		}
	}
	return false
}

func writeOutput(path string, data []byte) error {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	return os.WriteFile(path, data, 0o644)
}
