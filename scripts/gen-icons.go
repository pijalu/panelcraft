// SPDX-License-Identifier: GPL-3.0-only
//
//go:build ignore

// gen-icons resizes the supplied PanelCraft artwork into the favicon, installable
// PWA, maskable and Apple touch sizes. It is a one-shot, build-ignored Go program
// using only the standard library, so reproducible icons need no rasterizer
// dependency and no binary target in the module.
//
//	go run scripts/gen-icons.go
//
// Source: web/assets/brand/panelcraft-icon.png. Its opaque dark plate fills every
// output edge; the centred diagram remains inside the maskable safe area.
package main

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

const sourcePath = "web/assets/brand/panelcraft-icon.png"

// channel interpolates one channel between four neighbouring source pixels.
func channel(a, b, c, d uint8, fx, fy float64) uint8 {
	top := float64(a) + (float64(b)-float64(a))*fx
	bottom := float64(c) + (float64(d)-float64(c))*fx
	return uint8(math.Round(top + (bottom-top)*fy))
}

// sample returns the bilinear sample at fractional source coordinates x, y.
func sample(src image.Image, x, y float64) color.NRGBA {
	x0 := int(math.Floor(x))
	y0 := int(math.Floor(y))
	fx := x - float64(x0)
	fy := y - float64(y0)
	at := func(px, py int) color.NRGBA {
		return color.NRGBAModel.Convert(src.At(px, py)).(color.NRGBA)
	}
	a := at(x0, y0)
	b := at(x0+1, y0)
	c := at(x0, y0+1)
	d := at(x0+1, y0+1)
	return color.NRGBA{
		R: channel(a.R, b.R, c.R, d.R, fx, fy),
		G: channel(a.G, b.G, c.G, d.G, fx, fy),
		B: channel(a.B, b.B, c.B, d.B, fx, fy),
		A: channel(a.A, b.A, c.A, d.A, fx, fy),
	}
}

// resize downsamples a square source with smooth bilinear interpolation. Source
// and destination centres are aligned; this generator only shrinks the artwork.
func resize(src image.Image, size int) *image.NRGBA {
	bounds := src.Bounds()
	out := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		sy := float64(bounds.Min.Y) + (float64(y)+0.5)*float64(bounds.Dy())/float64(size) - 0.5
		for x := 0; x < size; x++ {
			sx := float64(bounds.Min.X) + (float64(x)+0.5)*float64(bounds.Dx())/float64(size) - 0.5
			out.SetNRGBA(x, y, sample(src, sx, sy))
		}
	}
	return out
}

// maskableResize keeps the complete panel inside the central 80% safe zone
// while the source's opaque black background still bleeds to every edge.
func maskableResize(src image.Image, size int) *image.NRGBA {
	scaledSize := int(math.Round(float64(size) * 0.9))
	scaled := resize(src, scaledSize)
	out := image.NewNRGBA(image.Rect(0, 0, size, size))
	draw.Draw(out, out.Bounds(), image.NewUniform(color.Black), image.Point{}, draw.Src)
	offset := (size - scaledSize) / 2
	draw.Draw(out, scaled.Bounds().Add(image.Pt(offset, offset)), scaled, image.Point{}, draw.Src)
	return out
}

func readSource(file string) (image.Image, error) {
	f, err := os.Open(file)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, err
	}
	if img.Bounds().Dx() != img.Bounds().Dy() {
		return nil, fmt.Errorf("source must be square, got %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	}
	if img.Bounds().Dx() < 512 {
		return nil, fmt.Errorf("source must be at least 512px, got %d", img.Bounds().Dx())
	}
	return img, nil
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
	source, err := readSource(sourcePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "gen-icons: %v\n", err)
		os.Exit(1)
	}
	out := filepath.Join("web", "public", "icons")
	targets := []struct {
		name     string
		size     int
		maskable bool
	}{
		{"icon-192.png", 192, false},
		{"icon-512.png", 512, false},
		{"icon-maskable-192.png", 192, true},
		{"icon-maskable-512.png", 512, true},
		{"apple-touch-icon.png", 180, false},
	}
	for _, target := range targets {
		resizeForTarget := resize
		if target.maskable {
			resizeForTarget = maskableResize
		}
		if err := write(filepath.Join(out, target.name), resizeForTarget(source, target.size)); err != nil {
			fmt.Fprintf(os.Stderr, "gen-icons: %v\n", err)
			os.Exit(1)
		}
	}
}
