// SPDX-License-Identifier: GPL-3.0-only
//
//go:build ignore

// gen-icons draws the PanelCraft application icons (UX08-WP04). It is a
// one-shot, build-ignored Go program so the PWA ships checked-in PNGs without a
// rasterizer dependency (ADR-0004 stdlib-first) and without a binary target in
// the module.
//
//	go run scripts/gen-icons.go
//
// The mark stays legible at 192 px: a squared panel on a neutral plate, an
// accent panel in front of it, and the accent connector line between them —
// the same "one diagram, two surfaces" idea the editor shows. Colours match the
// chrome tokens (docs/STYLE-GUIDE.md) so the install surface agrees with the
// app it opens.
package main

import (
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

const (
	plateColor  = 0x1a1d21 // --pc-tab-active-fg light (near-black plate)
	panelColor  = 0xf4f6f9 // --pc-panel-header-bg light
	accentColor = 0x1d4ed8 // --pc-button-primary-bg light
	fgOnAccent  = 0xffffff // --pc-button-primary-fg light
)

func rgb(hex uint32) color.NRGBA {
	return color.NRGBA{R: uint8(hex >> 16), G: uint8(hex >> 8), B: uint8(hex), A: 0xff}
}

// canvas is a float-free RGBA surface with supersampled shapes: every public
// shape is a signed distance so edges stay smooth at 192 px without a library.
type canvas struct {
	img      *image.NRGBA
	size     int
	samples  int
	premult  bool
	coverage [][4]float64
}

func newCanvas(size int) *canvas {
	return &canvas{img: image.NewNRGBA(image.Rect(0, 0, size, size)), size: size, samples: 3}
}

// put blends c into the pixel with coverage a (0..1).
func (c *canvas) put(x, y int, col color.NRGBA, a float64) {
	if x < 0 || y < 0 || x >= c.size || y >= c.size || a <= 0 {
		return
	}
	dst := c.img.NRGBAAt(x, y)
	mix := func(d, s uint8) uint8 { return uint8(math.Round(float64(d)*(1-a) + float64(s)*a)) }
	c.img.SetNRGBA(x, y, color.NRGBA{R: mix(dst.R, col.R), G: mix(dst.G, col.G), B: mix(dst.B, col.B), A: 0xff})
}

// fill paints every pixel whose coverage of `inside` is non-zero.
func (c *canvas) fill(col color.NRGBA, inside func(x, y float64) bool) {
	step := 1.0 / float64(c.samples)
	offset := step / 2
	for y := 0; y < c.size; y++ {
		for x := 0; x < c.size; x++ {
			hits := 0
			for sy := 0; sy < c.samples; sy++ {
				for sx := 0; sx < c.samples; sx++ {
					px := float64(x) + offset + float64(sx)*step
					py := float64(y) + offset + float64(sy)*step
					if inside(px, py) {
						hits++
					}
				}
			}
			if hits > 0 {
				c.put(x, y, col, float64(hits)/float64(c.samples*c.samples))
			}
		}
	}
}

// roundedRect matches a rect with per-corner radius r.
func roundedRect(x0, y0, x1, y1, r float64) func(x, y float64) bool {
	return func(x, y float64) bool {
		if x < x0 || x > x1 || y < y0 || y > y1 {
			return false
		}
		cx := math.Max(x0+r, math.Min(x, x1-r))
		cy := math.Max(y0+r, math.Min(y, y1-r))
		dx, dy := x-cx, y-cy
		return dx*dx+dy*dy <= r*r
	}
}

// thickLine covers the segment (x0,y0)-(x1,y1) with half-width w/2.
func thickLine(x0, y0, x1, y1, w float64) func(x, y float64) bool {
	half := w / 2
	return func(x, y float64) bool {
		dx, dy := x1-x0, y1-y0
		length := math.Hypot(dx, dy)
		ux, uy := dx/length, dy/length
		px, py := x-x0, y-y0
		along := px*ux + py*uy
		across := math.Abs(px*uy - py*ux)
		return along >= 0 && along <= length && across <= half
	}
}

func circle(cx, cy, r float64) func(x, y float64) bool {
	return func(x, y float64) bool {
		dx, dy := x-cx, y-cy
		return dx*dx+dy*dy <= r*r
	}
}

// drawMark renders the icon at the requested pixel size. `bleed` fills the full
// square (maskable icons must survive a circular crop, so the plate bleeds and
// the mark keeps 20 % padding); the default keeps a rounded plate.
func drawMark(size int, bleed bool) *canvas {
	c := newCanvas(size)
	s := float64(size)
	plate := roundedRect(0, 0, s, s, s*0.22)
	if bleed {
		plate = func(x, y float64) bool { return true }
	}
	c.fill(rgb(plateColor), plate)

	// Two panels: the back one neutral, the front one accent, overlapping like a
	// stacked diagram. Both sit inside the maskable safe zone.
	back := roundedRect(s*0.20, s*0.26, s*0.56, s*0.60, s*0.06)
	front := roundedRect(s*0.44, s*0.42, s*0.80, s*0.76, s*0.06)
	c.fill(rgb(panelColor), back)
	c.fill(rgb(accentColor), front)

	// Connector between the two panels: the "flow" in the mark.
	line := thickLine(s*0.40, s*0.36, s*0.62, s*0.56, s*0.055)
	c.fill(rgb(accentColor), line)
	c.fill(rgb(fgOnAccent), circle(s*0.40, s*0.36, s*0.045))
	return c
}

func write(file string, img image.Image) error {
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	f, err := os.Create(file)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		return err
	}
	fmt.Printf("wrote %s (%d bytes)\n", file, fileSize(file))
	return nil
}

func fileSize(file string) int64 {
	info, err := os.Stat(file)
	if err != nil {
		return 0
	}
	return info.Size()
}

func main() {
	out := filepath.Join("web", "public", "icons")
	targets := []struct {
		name   string
		size   int
		bleed  bool
	}{
		{"icon-192.png", 192, false},
		{"icon-512.png", 512, false},
		{"icon-maskable-192.png", 192, true},
		{"icon-maskable-512.png", 512, true},
		{"apple-touch-icon.png", 180, true},
	}
	for _, target := range targets {
		img := drawMark(target.size, target.bleed).img
		if err := write(filepath.Join(out, target.name), img); err != nil {
			fmt.Fprintf(os.Stderr, "gen-icons: %v\n", err)
			os.Exit(1)
		}
	}
}
