// SPDX-License-Identifier: GPL-3.0-only

package main

import "strings"

// flagsFirst lets the documented `command input --flag value` form work with
// Go's flag package, which otherwise stops parsing at the first positional.
func flagsFirst(args []string, valueFlags map[string]bool) []string {
	flags := []string{}
	positional := []string{}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		name := arg
		if before, _, ok := strings.Cut(arg, "="); ok {
			name = before
		}
		if !strings.HasPrefix(arg, "-") {
			positional = append(positional, arg)
			continue
		}
		flags = append(flags, arg)
		if valueFlags[name] && !strings.Contains(arg, "=") && i+1 < len(args) {
			i++
			flags = append(flags, args[i])
		}
	}
	return append(flags, positional...)
}
