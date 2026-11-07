// SPDX-License-Identifier: GPL-3.0-only

package pdl

import (
	"os"
	"testing"
)

// TestSeedsSmoke dogfoods the port on the real architecture seeds.
func TestSeedsSmoke(t *testing.T) {
	for _, f := range []string{"../../docs/architecture/overview.pcd", "../../docs/architecture/modules.pcd"} {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		res := Parse(string(raw))
		if res.Doc == nil {
			t.Fatalf("%s failed to parse: %+v", f, res.Diagnostics)
		}
		for _, d := range res.Diagnostics {
			if d.Severity == SevError {
				t.Fatalf("%s: error diagnostic: %+v", f, d)
			}
		}
		errs := 0
		for _, d := range Validate(res.Doc, Options{}) {
			if d.Severity == SevError {
				errs++
			}
		}
		if errs != 0 {
			t.Fatalf("%s: %d validation errors", f, errs)
		}
		if got := PrintDoc(res.Doc); len(got) == 0 {
			t.Fatalf("%s: empty print", f)
		}
	}
}
