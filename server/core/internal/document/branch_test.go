package document

import (
	"testing"

	"github.com/guregu/null/v5"
	"github.com/oxynote/oxynote/server/core/pkg/testutil"
	"github.com/rs/xid"
)

func Test_Document_AllowsBranchRename(t *testing.T) {
	cc := map[string]struct {
		Doc  Document
		Name null.String
		Err  error
	}{
		"Default branch renamed":        {Doc: Document{Default: true, BranchName: DefaultBranch}, Name: null.StringFrom("Renamed"), Err: ErrDefaultBranchRename},
		"Default branch keeps its name": {Doc: Document{Default: true, BranchName: DefaultBranch}, Name: null.StringFrom(DefaultBranch)},
		"Default branch without a name": {Doc: Document{Default: true, BranchName: DefaultBranch}},
		"Fork renamed":                  {Doc: Document{BranchName: "feature"}, Name: null.StringFrom("Renamed")},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			testutil.AssertEqualError(t, c.Err, c.Doc.AllowsBranchRename(c.Name))
		})
	}
}

func Test_Document_AllowsBranchDelete(t *testing.T) {
	t.Parallel()

	testutil.AssertEqualError(t, ErrDefaultBranchDelete, Document{Default: true}.AllowsBranchDelete())
	testutil.AssertEqualError(t, nil, Document{}.AllowsBranchDelete())
}

func Test_AllowsMerge(t *testing.T) {
	t.Parallel()

	from, to := xid.New(), xid.New()

	testutil.AssertEqualError(t, ErrBranchSelfMerge, AllowsMerge(from, from))
	testutil.AssertEqualError(t, nil, AllowsMerge(from, to))
}
