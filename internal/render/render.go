// SPDX-License-Identifier: GPL-3.0-only
// Package render drives the embedded, storage-free browser renderer through
// Chrome DevTools Protocol (SPEC S6/FR-X). Only loopback HTTP is used.
package render

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/chromedp"
	"github.com/pijalu/panelcraft/internal/server"
)

// Options controls one headless render. Assets is the built web/dist tree.
type Options struct {
	Assets fs.FS
	Width  int
	Theme  string
	View   string
	Chrome string
	Format string
}

type browserOptions struct {
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Theme  string `json:"theme"`
	View   string `json:"view,omitempty"`
}

type browserResult struct {
	SVG    string `json:"svg"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type browserResponse struct {
	OK     bool           `json:"ok"`
	Result *browserResult `json:"result"`
	Error  string         `json:"error"`
}

// Render returns a sanitized SVG or a PNG screenshot of the supplied PDL.
func Render(ctx context.Context, source string, opts Options) ([]byte, error) {
	if opts.Assets == nil {
		return nil, fmt.Errorf("embedded web assets are unavailable")
	}
	if opts.Chrome != "" {
		info, err := os.Stat(opts.Chrome)
		if err != nil || info.IsDir() {
			return nil, fmt.Errorf("chrome not found at %q; pass --chrome /path/to/chrome", opts.Chrome)
		}
	}
	listener, srv, err := serveAssets(opts.Assets)
	if err != nil {
		return nil, err
	}
	defer srv.Close()
	defer listener.Close()

	browserCtx, cancel := chromeContext(ctx, opts.Chrome)
	defer cancel()
	url := "http://" + listener.Addr().String() + "/?cli-render=1"
	var response browserResponse
	var png []byte
	height := opts.Width * 9 / 16
	tasks := chromedp.Tasks{
		emulation.SetEmulatedMedia().WithFeatures([]*emulation.MediaFeature{{
			Name: "prefers-color-scheme", Value: opts.Theme,
		}}),
		chromedp.EmulateViewport(int64(opts.Width), int64(height)),
		chromedp.Navigate(url),
		chromedp.Poll("typeof window.panelcraftRender === 'function'", nil,
			chromedp.WithPollingInterval(20*time.Millisecond), chromedp.WithPollingTimeout(10*time.Second)),
		chromedp.Evaluate(renderExpression(source, browserOptions{
			Width: opts.Width, Height: height, Theme: opts.Theme, View: opts.View,
		}), &response),
	}
	if opts.Format == "png" {
		tasks = append(tasks, chromedp.CaptureScreenshot(&png))
	}
	if err := chromedp.Run(browserCtx, tasks); err != nil {
		return nil, fmt.Errorf("headless Chrome failed; install Chrome or pass --chrome /path/to/chrome: %w", err)
	}
	if !response.OK || response.Result == nil {
		return nil, fmt.Errorf("browser render failed: %s", response.Error)
	}
	if opts.Format == "png" {
		return png, nil
	}
	return []byte(response.Result.SVG), nil
}

func serveAssets(assets fs.FS) (net.Listener, *http.Server, error) {
	handler, err := server.New(server.Options{Assets: assets})
	if err != nil {
		return nil, nil, fmt.Errorf("render server: %w", err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, nil, fmt.Errorf("render server listen: %w", err)
	}
	srv := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = srv.Serve(listener) }()
	return listener, srv, nil
}

func chromeContext(ctx context.Context, chrome string) (context.Context, context.CancelFunc) {
	allocatorOpts := append([]chromedp.ExecAllocatorOption{}, chromedp.DefaultExecAllocatorOptions[:]...)
	if chrome != "" {
		allocatorOpts = append(allocatorOpts, chromedp.ExecPath(chrome))
	}
	allocatorCtx, cancelAllocator := chromedp.NewExecAllocator(ctx, allocatorOpts...)
	browserCtx, cancelBrowser := chromedp.NewContext(allocatorCtx)
	timeoutCtx, cancelTimeout := context.WithTimeout(browserCtx, 30*time.Second)
	return timeoutCtx, func() {
		cancelTimeout()
		cancelBrowser()
		cancelAllocator()
	}
}

func renderExpression(source string, opts browserOptions) string {
	sourceJSON, _ := json.Marshal(source)
	optsJSON, _ := json.Marshal(opts)
	return fmt.Sprintf(`(() => {
  try {
    return { ok: true, result: window.panelcraftRender(%s, %s) };
  } catch (error) {
    return { ok: false, error: String(error && error.message || error) };
  }
})()`, sourceJSON, optsJSON)
}
