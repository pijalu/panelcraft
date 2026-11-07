// SPDX-License-Identifier: GPL-3.0-only

package ir_test

import (
	"bytes"
	"encoding/json"
	"os"
	"testing"

	"github.com/pijalu/panelcraft/internal/ir"
)

func jsonUnmarshal(raw []byte, v *ir.Doc) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	return dec.Decode(v)
}

// TestMarshalParity unmarshals the committed TS-side fixture and re-marshals
// it — bytes must be identical (M1-WP1: TS⇄Go serializer parity by contract).
func TestMarshalParity(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/ir-fixture.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var doc ir.Doc
	if err := jsonUnmarshal(raw, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	out, err := ir.Marshal(&doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(out) != string(raw) {
		_ = os.WriteFile("/tmp/ir-go-marshal.json", out, 0o644)
		t.Fatalf("IR JSON parity broken (Go output: /tmp/ir-go-marshal.json)\nwant %d bytes, got %d bytes", len(raw), len(out))
	}
}
