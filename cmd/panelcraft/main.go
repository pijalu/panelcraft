// SPDX-License-Identifier: GPL-3.0-only
// PanelCraft CLI entry (SPEC FR-X). M0: serve + version only; validate,
// convert and render land with M1 per docs/IMPLEMENTATION-PLAN.md §3.
package main

import (
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"runtime"

	"github.com/pijalu/panelcraft/internal/server"
	"github.com/pijalu/panelcraft/web"
)

// version is overridden at release build time via -ldflags.
var version = "0.1.0-dev"

const usage = `panelcraft — architecture diagrams, in your browser

Usage:
  panelcraft serve [--addr :8080] [--open] [--dev-dir DIR] [DIR]
  panelcraft validate [--json] PATH...
  panelcraft convert [--out DIR] PATH...
  panelcraft version

Commands:
  serve     serve the embedded SPA at /, DIR (optional) read-only at /files/*
  validate  validate .pcd files (PATH: file or dir, globbed *.pcd); exit 1
            only for error-severity findings, 2 for usage errors (D-M1-20)
  convert   parse .pcd files and write canonical IR JSON (<name>.ir.json);
            parse failures exit 1
  version   print version

render arrives with M2 (renderer).
`

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "serve":
		err = runServe(os.Args[2:])
	case "validate":
		os.Exit(runValidate(os.Args[2:], os.Stdout, os.Stderr))
	case "convert":
		os.Exit(runConvert(os.Args[2:], os.Stdout, os.Stderr))
	case "version":
		fmt.Printf("panelcraft %s (%s/%s)\n", version, runtime.GOOS, runtime.GOARCH)
	case "render":
		fmt.Fprintln(os.Stderr, "panelcraft render: not implemented yet — lands with M2 (docs/IMPLEMENTATION-PLAN.md §4)")
		os.Exit(2)
	case "help", "-h", "--help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "panelcraft: unknown command %q\n\n%s", os.Args[1], usage)
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "panelcraft: %v\n", err)
		os.Exit(1)
	}
}

func runServe(args []string) error {
	flags := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := flags.String("addr", ":8080", "listen address")
	open := flags.Bool("open", false, "open browser after start")
	devDir := flags.String("dev-dir", "", "serve web bundle from this dir instead of the embedded dist (dev mode)")
	if err := flags.Parse(args); err != nil {
		return err
	}

	filesDir := ""
	if flags.NArg() > 1 {
		return fmt.Errorf("serve takes at most one DIR argument")
	}
	if flags.NArg() == 1 {
		filesDir = flags.Arg(0)
	}

	opts := server.Options{FilesDir: filesDir}
	if *devDir != "" {
		opts.Assets = os.DirFS(*devDir)
	} else {
		sub, err := fs.Sub(web.Dist(), "dist")
		if err != nil {
			return fmt.Errorf("embedded bundle: %w", err)
		}
		opts.Assets = sub
	}

	handler, err := server.New(opts)
	if err != nil {
		return err
	}

	fmt.Printf("panelcraft %s serving on %s (files: %s)\n", version, *addr, orNone(filesDir))
	if *open {
		if err := openBrowser("http://localhost" + *addr); err != nil {
			fmt.Fprintf(os.Stderr, "panelcraft: could not open browser: %v\n", err)
		}
	}
	srv := &http.Server{Addr: *addr, Handler: handler}
	return srv.ListenAndServe()
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	return cmd.Start()
}

func orNone(s string) string {
	if s == "" {
		return "none"
	}
	return s
}
