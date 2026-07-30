package relay

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

func TestImage2ExactSizeValidation(t *testing.T) {
	if !isValidExactImageSize("1920*1072") {
		t.Fatal("1920*1072 should be accepted after separator normalization")
	}
	if !isValidExactImageSize("1920x1072") {
		t.Fatal("1920x1072 should be valid for exact image size models")
	}
	if isValidExactImageSize("1920x1080") {
		t.Fatal("1920x1080 should be rejected because 1080 is not divisible by 16")
	}
}

func TestRequiresExactImageSizeForAliases(t *testing.T) {
	if !requiresExactImageSize(nil, dto.ImageRequest{Model: "custom-image-2"}) {
		t.Fatal("image-2 aliases should require exact image size preservation")
	}
}

func TestPreserveExactImageSize(t *testing.T) {
	out, err := preserveExactImageSize([]byte(`{"model":"gpt-image-2","size":"1024x1024"}`), normalizeImageSize("1920*1072"))
	if err != nil {
		t.Fatalf("preserveExactImageSize returned error: %v", err)
	}

	var payload map[string]any
	if err := common.Unmarshal(out, &payload); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	if payload["size"] != "1920x1072" {
		t.Fatalf("size = %#v, want %q", payload["size"], "1920x1072")
	}
}

func TestPreserveExactImageSizeOverridesWrongPreset(t *testing.T) {
	out, err := preserveExactImageSize([]byte(`{"model":"gpt-image-2","size":"1024x1536"}`), "1920x1072")
	if err != nil {
		t.Fatalf("preserveExactImageSize returned error: %v", err)
	}

	var payload map[string]any
	if err := common.Unmarshal(out, &payload); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	if payload["size"] != "1920x1072" {
		t.Fatalf("size = %#v, want %q", payload["size"], "1920x1072")
	}
}

func TestPreserveExactImageSizeNestedParameters(t *testing.T) {
	out, err := preserveExactImageSize([]byte(`{"model":"gpt-image-2","parameters":{"size":"1024*1536"}}`), "1920x1072")
	if err != nil {
		t.Fatalf("preserveExactImageSize returned error: %v", err)
	}

	var payload map[string]any
	if err := common.Unmarshal(out, &payload); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	params, ok := payload["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("parameters = %#v, want object", payload["parameters"])
	}
	if params["size"] != "1920*1072" {
		t.Fatalf("parameters.size = %#v, want %q", params["size"], "1920*1072")
	}
}

func TestPreserveExactImageSizeRequiresTopLevelSize(t *testing.T) {
	_, err := preserveExactImageSize([]byte(`{"model":"gpt-image-2","parameters":{"aspect_ratio":"16:9"}}`), "1920x1072")
	if err == nil {
		t.Fatal("expected error when converted request does not preserve top-level size")
	}
	if !strings.Contains(err.Error(), "was not preserved") {
		t.Fatalf("error = %q, want preservation message", err.Error())
	}
}
