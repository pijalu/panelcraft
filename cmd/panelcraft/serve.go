// SPDX-License-Identifier: GPL-3.0-only
package main

import (
	"flag"
	"fmt"
	"io"
	"net"
	"strings"
)

type serveConfig struct {
	addr        string
	open        bool
	devDir      string
	filesDir    string
	localDir    string
	storageType string
	depth       int
}

func parseServeFlags(args []string) (serveConfig, error) {
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	config := serveConfig{}
	flags.StringVar(&config.addr, "addr", "127.0.0.1:8080", "listen address")
	flags.BoolVar(&config.open, "open", false, "open browser after start")
	flags.StringVar(&config.devDir, "dev-dir", "", "serve web bundle from this directory")
	flags.StringVar(&config.localDir, "local", "", "store workspace files in this local directory")
	flags.StringVar(&config.storageType, "storage-type", "filesystem", "workspace storage backend")
	flags.IntVar(&config.depth, "depth", -1, "maximum workspace directory depth (-1 is unlimited)")
	if err := flags.Parse(args); err != nil {
		return serveConfig{}, err
	}
	if flags.NArg() > 1 {
		return serveConfig{}, fmt.Errorf("serve takes at most one DIR argument")
	}
	if config.localDir != "" && flags.NArg() == 1 {
		return serveConfig{}, fmt.Errorf("-local cannot be combined with the read-only DIR argument")
	}
	if flags.NArg() == 1 {
		config.filesDir = flags.Arg(0)
	}
	return validateServeConfig(config, flags)
}

func validateServeConfig(config serveConfig, flags *flag.FlagSet) (serveConfig, error) {
	if config.storageType == "filestorage" {
		config.storageType = "filesystem"
	}
	if config.storageType == "git" {
		return serveConfig{}, fmt.Errorf("git storage is not implemented yet")
	}
	if config.storageType != "filesystem" {
		return serveConfig{}, fmt.Errorf("unknown storage type %q", config.storageType)
	}
	if config.depth < -1 {
		return serveConfig{}, fmt.Errorf("depth must be -1 (unlimited) or a non-negative integer")
	}
	if config.localDir == "" {
		if flagProvided(flags, "depth") || flagProvided(flags, "storage-type") {
			return serveConfig{}, fmt.Errorf("workspace storage configuration requires -local DIR")
		}
		return config, nil
	}
	if !loopbackAddress(config.addr) {
		return serveConfig{}, fmt.Errorf("writable local storage requires a loopback listen address")
	}
	return config, nil
}

func flagProvided(flags *flag.FlagSet, name string) bool {
	provided := false
	flags.Visit(func(current *flag.Flag) {
		if current.Name == name {
			provided = true
		}
	})
	return provided
}

func loopbackAddress(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func browserURL(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "http://localhost" + addr
	}
	if host == "" || strings.EqualFold(host, "localhost") || (net.ParseIP(host) != nil && net.ParseIP(host).IsLoopback()) {
		return "http://localhost:" + port
	}
	return "http://" + addr
}
