// SPDX-License-Identifier: GPL-3.0-only
// Package web carries the embedded SPA bundle (web/dist) into the Go binary.
// Build the web bundle first: npm run build  (output: web/dist).
package web

import (
	"embed"
)

//go:embed all:dist
var distFS embed.FS

// Dist returns the embedded SPA bundle (web/dist), rooted at "dist/".
func Dist() embed.FS {
	return distFS
}
