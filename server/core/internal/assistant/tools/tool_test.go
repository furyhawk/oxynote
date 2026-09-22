package tools

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func Test_plainSummary_Summary(t *testing.T) {
	t.Parallel()

	// a tool that proposes nothing describes nothing, and never fails
	// doing so: the gate is only ever applied to a write.
	got, err := plainSummary{}.Summary(testInput(testDeps(nil, nil, nil), NameGetDocument, `{`))
	require.NoError(t, err)
	assert.Equal(t, ActionSummary{}, got)
}

func Test_plainTraits_Traits(t *testing.T) {
	t.Parallel()

	// a plain read writes nothing, reaches no outbound connection and
	// belongs on every surface.
	assert.Equal(t, Traits{}, plainTraits{}.Traits())
}

func Test_Traits_DestroysContent(t *testing.T) {
	cc := map[string]struct {
		Traits Traits
		Result bool
	}{
		"Read":        {},
		"Plain write": {Traits: Traits{Write: true}},
		"Destructive": {Traits: Traits{Write: true, Destructive: true}, Result: true},
		"Overwriting": {Traits: Traits{Write: true, Overwrites: true}, Result: true},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, c.Result, c.Traits.DestroysContent())
		})
	}
}

func Test_Traits_OpenWorld(t *testing.T) {
	t.Parallel()

	assert.False(t, Traits{}.OpenWorld())
	assert.True(t, Traits{DataSource: true}.OpenWorld())
}

func Test_Traits_Access(t *testing.T) {
	cc := map[string]struct {
		Traits Traits
		Result Access
	}{
		"Read":                   {Result: AccessRead},
		"Write":                  {Traits: Traits{Write: true}, Result: AccessWrite},
		"Data source":            {Traits: Traits{DataSource: true}, Result: AccessDataSource},
		"Internal":               {Traits: Traits{Internal: true}, Result: AccessNone},
		"Internal write":         {Traits: Traits{Write: true, Internal: true}, Result: AccessNone},
		"Data source over write": {Traits: Traits{Write: true, DataSource: true}, Result: AccessDataSource},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, c.Result, c.Traits.Access())
		})
	}
}

func Test_plainTitle_Title(t *testing.T) {
	t.Parallel()

	// a tool too generic to announce says nothing, and never fails
	// doing so: the arguments are not even read.
	got, err := plainTitle{}.Title(testInput(testDeps(nil, nil, nil), NameListDocuments, `{`))
	require.NoError(t, err)
	assert.Empty(t, got)
}
