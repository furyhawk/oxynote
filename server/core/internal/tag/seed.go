package tag

// SeedTags returns the tags a fresh organization starts with, in display
// order. The welcome document goes under the first of them.
func SeedTags() []CreateInput {
	return []CreateInput{
		{TagName: "Production", Color: ColorHex("green")},
		{TagName: "Staging", Color: ColorHex("orange")},
		{TagName: "Incidents", Color: ColorHex("blue")},
	}
}
