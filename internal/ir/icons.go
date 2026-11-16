// SPDX-License-Identifier: GPL-3.0-only

package ir

// Built-in icon names — the reserved handle namespace (IR v9, FILE-FORMAT
// §3.1). Mirrors web/src/engine/model/icons.ts; a project icon may not reuse
// one of these handles (validation P207), so both engines must agree on the
// set. Provenance and licensing for every asset: docs/ICONS.md.
var BuiltinIconNames = map[string]bool{
	// compute
	"server": true, "container": true, "cluster": true, "function": true, "gear": true,
	// storage
	"database": true, "cache": true, "storage": true, "backup": true, "folder": true,
	// network
	"cloud": true, "cdn": true, "network": true, "loadbalancer": true, "gateway": true,
	"proxy": true, "queue": true, "stream": true,
	// security
	"lock": true, "shield": true, "key": true, "certificate": true,
	// client
	"browser": true, "mobile": true, "user": true, "users": true,
	// platform
	"api": true, "mail": true, "code": true, "git": true, "package": true,
	"terminal": true,
	// ops
	"monitor": true, "logs": true, "alert": true, "deploy": true, "workflow": true,
	"clock": true,
	// data
	"chart": true, "search": true,
	// concept
	"document": true, "external": true, "group": true,
}

// IsBuiltinIcon reports whether name is a reserved built-in handle.
func IsBuiltinIcon(name string) bool { return BuiltinIconNames[name] }
