// SPDX-License-Identifier: GPL-3.0-only
// PanelCraft CLI entry (SPEC FR-X): embedded SPA server plus validate,
// Mermaid/PDL conversion and headless SVG/PNG rendering.
package main

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"runtime"

	"github.com/pijalu/panelcraft/internal/server"
	"github.com/pijalu/panelcraft/internal/storage"
	"github.com/pijalu/panelcraft/web"
)

// version is overridden at release build time via -ldflags.
var version = "0.1.0-dev"

const usage = `panelcraft — architecture diagrams, in your browser

Usage:
  panelcraft serve [--addr 127.0.0.1:8080] [--open] [--dev-dir DIR] [DIR]
  panelcraft serve -local DIR [-storage-type filesystem|git] [-depth N]
                   [-git-author-name NAME] [-git-author-email EMAIL]
  panelcraft validate [--json] PATH...
  panelcraft convert <in.mmd|in.pcd> [-o out.pcd]
  panelcraft render <file.pcd> --out out.png|svg [--width 1920]
                   [--theme dark|light] [--view NAME] [--chrome PATH]
  panelcraft version

Commands:
  serve     serve the embedded SPA; optional DIR is read-only at /files/*
            -local DIR enables confined writable filesystem or Git workspace storage
  validate  validate .pcd files (PATH: file or dir, globbed *.pcd); exit 1
            only for error-severity findings, 2 for usage errors (D-M1-20)
  convert   convert Mermaid to canonical .pcd (or canonicalise .pcd)
  render    render .pcd to standalone SVG or PNG via headless Chrome
  version   print version
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
		os.Exit(runRender(os.Args[2:], os.Stdout, os.Stderr))
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
	config, err := parseServeFlags(args)
	if err != nil {
		return err
	}
	opts := server.Options{FilesDir: config.filesDir}
	if config.localDir != "" {
		store, err := newWorkspaceStore(config)
		if err != nil {
			return err
		}
		defer store.Close()
		opts.Workspace = store
		opts.StorageType = config.storageType
	}
	if config.devDir != "" {
		opts.Assets = os.DirFS(config.devDir)
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

	fmt.Printf("panelcraft %s serving on %s (read-only files: %s, workspace: %s)\n",
		version, config.addr, orNone(config.filesDir), orNone(config.localDir))
	if config.open {
		if err := openBrowser(browserURL(config.addr)); err != nil {
			fmt.Fprintf(os.Stderr, "panelcraft: could not open browser: %v\n", err)
		}
	}
	srv := &http.Server{Addr: config.addr, Handler: handler}
	return srv.ListenAndServe()
}

type workspaceStore interface {
	storage.Store
	Close() error
}

func newWorkspaceStore(config serveConfig) (workspaceStore, error) {
	if config.storageType == "git" {
		return storage.NewGit(config.localDir, config.depth, storage.GitOptions{
			AuthorName: config.gitAuthorName, AuthorEmail: config.gitAuthorEmail,
		})
	}
	return storage.NewFilesystem(config.localDir, config.depth)
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
