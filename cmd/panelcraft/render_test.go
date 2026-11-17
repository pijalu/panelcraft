// SPDX-License-Identifier: GPL-3.0-only

package main

import (
	"bytes"
	"encoding/xml"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const renderSource = `pcd 1.0
person ada "Ada"
system web "Web"
ada -> web : "calls"
layout saved
position ada (40, 60)
position web (280, 60)
`

func TestRenderValidation(t *testing.T) {
	dir := t.TempDir()
	input := writeFile(t, dir, "diagram.pcd", renderSource)
	cases := []struct {
		name string
		args []string
		code int
		want string
	}{
		{"missing input", []string{"--out", filepath.Join(dir, "x.svg")}, 2, "one input"},
		{"missing output", []string{input}, 2, "--out"},
		{"extra input", []string{input, input, "--out", filepath.Join(dir, "x.svg")}, 2, "one input"},
		{"bad extension", []string{input, "--out", filepath.Join(dir, "x.pdf")}, 2, ".png or .svg"},
		{"bad width", []string{input, "--out", filepath.Join(dir, "x.svg"), "--width", "0"}, 2, "width"},
		{"bad theme", []string{input, "--out", filepath.Join(dir, "x.svg"), "--theme", "blue"}, 2, "theme"},
		{"missing chrome", []string{input, "--out", filepath.Join(dir, "x.svg"), "--chrome", filepath.Join(dir, "no-chrome")}, 1, "--chrome"},
		{"missing file", []string{filepath.Join(dir, "missing.pcd"), "--out", filepath.Join(dir, "x.svg")}, 2, "missing.pcd"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr strings.Builder
			if got := runRender(tc.args, &stdout, &stderr); got != tc.code {
				t.Fatalf("exit %d, want %d; stderr=%s", got, tc.code, stderr.String())
			}
			if !strings.Contains(stderr.String(), tc.want) {
				t.Fatalf("stderr %q does not contain %q", stderr.String(), tc.want)
			}
		})
	}
}

func TestRenderChromeSVGAndPNG(t *testing.T) {
	chrome := chromeForTest(t)
	dir := t.TempDir()
	input := writeFile(t, dir, "diagram.pcd", renderSource)

	t.Run("svg", func(t *testing.T) {
		out := filepath.Join(dir, "diagram.svg")
		var stdout, stderr strings.Builder
		args := []string{input, "--out", out, "--width", "800", "--theme", "dark", "--chrome", chrome}
		if got := runRender(args, &stdout, &stderr); got != 0 {
			t.Fatalf("render svg exit %d: %s", got, stderr.String())
		}
		raw, err := os.ReadFile(out)
		if err != nil {
			t.Fatal(err)
		}
		var doc struct {
			XMLName xml.Name
			Width   string `xml:"width,attr"`
			Height  string `xml:"height,attr"`
		}
		if err := xml.Unmarshal(raw, &doc); err != nil {
			t.Fatalf("invalid SVG: %v\n%s", err, raw)
		}
		if doc.XMLName.Local != "svg" || doc.Width != "800" || doc.Height != "450" {
			t.Fatalf("unexpected SVG root: %+v", doc)
		}
		if !bytes.Contains(raw, []byte(`data-id="ada"`)) || !bytes.Contains(raw, []byte("calls")) {
			t.Fatalf("SVG does not contain the diagram: %s", raw)
		}
	})

	t.Run("png", func(t *testing.T) {
		out := filepath.Join(dir, "diagram.png")
		var stdout, stderr strings.Builder
		args := []string{"--out", out, "--width", "640", "--chrome", chrome, input}
		if got := runRender(args, &stdout, &stderr); got != 0 {
			t.Fatalf("render png exit %d: %s", got, stderr.String())
		}
		raw, err := os.ReadFile(out)
		if err != nil {
			t.Fatal(err)
		}
		if len(raw) < 24 || !bytes.Equal(raw[:8], []byte("\x89PNG\r\n\x1a\n")) {
			t.Fatalf("not a PNG (%d bytes)", len(raw))
		}
		// PNG IHDR stores big-endian width and height at byte offsets 16 and 20.
		if got := int(raw[16])<<24 | int(raw[17])<<16 | int(raw[18])<<8 | int(raw[19]); got != 640 {
			t.Fatalf("PNG width %d, want 640", got)
		}
	})

}

func TestRenderChromeMermaidC4(t *testing.T) {
	chrome := chromeForTest(t)
	dir := t.TempDir()
	mermaid := writeFile(t, dir, "shop.mmd", `C4Container
Person(customer, "Customer")
System_Boundary(shop, "Online boutique") {
  Container(web, "Web application", "Go")
  ContainerDb(db, "Orders", "PostgreSQL")
}
System_Ext(payments, "Payment provider")
Rel(customer, web, "Browses and buys")
Rel(web, db, "Reads and writes")
Rel(web, payments, "Charges card")
`)
	pcd := filepath.Join(dir, "shop.pcd")
	var convertOut, convertErr strings.Builder
	if got := runConvert([]string{mermaid, "-o", pcd}, &convertOut, &convertErr); got != 0 {
		t.Fatalf("convert C4 exit %d: %s", got, convertErr.String())
	}
	out := filepath.Join(dir, "shop.svg")
	var stdout, stderr strings.Builder
	if got := runRender([]string{pcd, "--out", out, "--chrome", chrome}, &stdout, &stderr); got != 0 {
		t.Fatalf("render C4 exit %d: %s", got, stderr.String())
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`data-id="shop"`, `data-id="web"`, `data-id="db"`, `data-cli-render="true"`, "transition: none !important", "Browses and buys", "Charges card"} {
		if !bytes.Contains(raw, []byte(want)) {
			t.Fatalf("C4 SVG missing %q: %s", want, raw)
		}
	}
}

func chromeForTest(t *testing.T) string {
	t.Helper()
	if path := os.Getenv("PANELCRAFT_CHROME"); path != "" {
		return path
	}
	candidates := []string{
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	}
	if runtime.GOOS == "windows" {
		candidates = []string{`C:\Program Files\Google\Chrome\Application\chrome.exe`}
	}
	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	t.Skip("Chrome not installed; set PANELCRAFT_CHROME to run the S6 integration test")
	return ""
}
