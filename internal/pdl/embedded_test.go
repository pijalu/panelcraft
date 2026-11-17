// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"testing"
)

// TestEmbeddedDecompositionRoundTrip mirrors the TS parser/printer test: a
// linked path and an embedded recursive document are distinct IR values and
// survive a canonical print without losing the nested file.
func TestEmbeddedDecompositionRoundTrip(t *testing.T) {
	src := `pcd 1.0

system shop "Webshop" {
  drilldown embedded "containers/shop.pcd" {
    pcd 1.0
    title "Containers"
    level container

    container api "API" {
      drilldown "components/api.pcd"
      source {
        language "go"
        text "func Run() {}"
      }
    }
  }
}
`
	res := Parse(src)
	if res.Doc == nil {
		t.Fatalf("doc must parse: %v", res.Diagnostics)
	}
	drill := res.Doc.Objects[0].Drilldown
	if drill == nil || drill.Kind != "embedded" || drill.Path != "containers/shop.pcd" {
		t.Fatalf("drilldown = %+v, want embedded logical path", drill)
	}
	if drill.Doc == nil || drill.Doc.Title == nil || *drill.Doc.Title != "Containers" {
		t.Fatalf("embedded doc title = %+v", drill.Doc)
	}
	if got := drill.Doc.Objects[0].Drilldown; got == nil || got.Kind != "linked" || got.Path != "components/api.pcd" {
		t.Fatalf("nested linked target = %+v", got)
	}
	if printed := PrintDoc(res.Doc); printed != src {
		t.Fatalf("canonical print diverges:\n got %q\nwant %q", printed, src)
	}
}

// TestEmbeddedDecompositionRequiresMagicLine pins the parse-abort rule: a
// document block without `pcd 1.0` is never accepted as an embedded child.
func TestEmbeddedDecompositionRequiresMagicLine(t *testing.T) {
	res := Parse("pcd 1.0\nsystem a \"A\" {\n  drilldown embedded \"b.pcd\" {\n    title \"no magic\"\n  }\n}\n")
	if res.Doc != nil {
		t.Fatal("doc must not parse without a nested magic line")
	}
	if !hasCode(res.Diagnostics, ErrInvalidVersion) {
		t.Fatalf("codes = %v, want %s", codesOf(res.Diagnostics), ErrInvalidVersion)
	}
}
