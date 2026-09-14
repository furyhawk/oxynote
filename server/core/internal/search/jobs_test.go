package search

import (
	"testing"

	"github.com/guregu/null/v5"
	"github.com/rs/xid"
	"github.com/stretchr/testify/assert"
)

func Test_BranchScope(t *testing.T) {
	t.Parallel()

	documentID, branchID := xid.New(), xid.New()

	assert.Equal(t, Job{
		OrganizationID: "org-1",
		DocumentID:     null.ValueFrom(documentID),
		BranchID:       null.ValueFrom(branchID),
	}, BranchScope("org-1", documentID, branchID))
}

func Test_DocumentScope(t *testing.T) {
	t.Parallel()

	documentID := xid.New()

	assert.Equal(t, Job{
		OrganizationID: "org-1",
		DocumentID:     null.ValueFrom(documentID),
	}, DocumentScope("org-1", documentID))
}

func Test_OrganizationScope(t *testing.T) {
	t.Parallel()

	assert.Equal(t, Job{
		OrganizationID: "org-1",
	}, OrganizationScope("org-1"))
}
