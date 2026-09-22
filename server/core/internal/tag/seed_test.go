package tag

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_SeedTags(t *testing.T) {
	t.Parallel()

	tags := SeedTags()
	require.Len(t, tags, 3)

	names := make([]string, 0, len(tags))

	for _, inp := range tags {
		names = append(names, inp.TagName)
		assert.NoError(t, inp.Validate())
	}

	assert.Equal(t, []string{"Production", "Staging", "Incidents"}, names)
}
