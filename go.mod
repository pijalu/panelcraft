module github.com/pijalu/panelcraft

go 1.27.3

// node_modules hosts npm deps; some packages ship Go code (e.g. flatted) that
// would otherwise be picked up by `go list ./...` and pollute gates/tests.
ignore node_modules
