package mcp

import (
	"testing"

	"github.com/rs/xid"
	"github.com/stretchr/testify/assert"
)

func Test_resourceURI(t *testing.T) {
	t.Parallel()

	documentID, branchID := xid.New(), xid.New()

	assert.Equal(t, "oxynote://documents/"+documentID.String()+"/branches/"+branchID.String(), resourceURI(documentID, branchID))
}

func Test_parseResourceURI(t *testing.T) {
	documentID, branchID := xid.New(), xid.New()

	cc := map[string]struct {
		URI        string
		DocumentID xid.ID
		BranchID   xid.ID
		OK         bool
	}{
		"Branch URI":                         {URI: resourceURI(documentID, branchID), DocumentID: documentID, BranchID: branchID, OK: true},
		"URI outside the scheme":             {URI: "file:///etc/passwd"},
		"URI without an id":                  {URI: _resourceURIPrefix},
		"URI without a branch":               {URI: _resourceURIPrefix + documentID.String()},
		"Branch URI without a document":      {URI: _resourceURIPrefix + _resourceBranchSegment + branchID.String()},
		"Document segment that is not an id": {URI: _resourceURIPrefix + "doc" + _resourceBranchSegment + branchID.String()},
		"Branch segment that is not an id":   {URI: _resourceURIPrefix + documentID.String() + _resourceBranchSegment + "draft"},
		"Empty":                              {},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			gotDocumentID, gotBranchID, ok := parseResourceURI(c.URI)
			assert.Equal(t, c.OK, ok)
			assert.Equal(t, c.DocumentID, gotDocumentID)
			assert.Equal(t, c.BranchID, gotBranchID)
		})
	}
}
