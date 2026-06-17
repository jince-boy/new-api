package gemini

import "testing"

func TestAspectRatioFromImageSize(t *testing.T) {
	tests := []struct {
		name string
		size string
		want string
	}{
		{name: "wide hd", size: "1920x1080", want: "16:9"},
		{name: "portrait hd", size: "1080x1920", want: "9:16"},
		{name: "square", size: "1024x1024", want: "1:1"},
		{name: "unsupported", size: "1000x777", want: ""},
		{name: "invalid", size: "1920", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := aspectRatioFromImageSize(tt.size); got != tt.want {
				t.Fatalf("aspectRatioFromImageSize(%q) = %q, want %q", tt.size, got, tt.want)
			}
		})
	}
}
