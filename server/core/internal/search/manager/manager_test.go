package manager

import (
	"context"
	"database/sql"
	"log/slog"
	"path/filepath"
	"testing"

	"github.com/oxynote/oxynote/server/core/internal/document"
	"github.com/oxynote/oxynote/server/core/internal/search"
	"github.com/oxynote/oxynote/server/core/pkg/testutil"
	"github.com/rs/xid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m, testutil.IgnoreBleveWorkers())
}

// jobs builds n sequential branch-scope jobs with IDs starting at start.
func jobs(start, n int) []search.Job {
	jj := make([]search.Job, 0, n)

	for i := range n {
		job := search.BranchScope("org-1", xid.New(), xid.New())
		job.ID = int64(start + i)
		job.Version = 1

		jj = append(jj, job)
	}

	return jj
}

// stubDocument builds a default-branch document with one paragraph.
func stubDocument(branchID xid.ID) *document.Document {
	return &document.Document{
		ID:             xid.New(),
		OrganizationID: "org-1",
		BranchID:       branchID,
		BranchName:     document.DefaultBranch,
		DocumentName:   "Runbook",
		Content: document.RootBlock{
			Type: document.BlockNodeDoc,
			Content: []document.Block{
				{
					Type:  document.BlockNodeParagraph,
					Attrs: document.Attributes{"uid": "p1"},
					Content: []document.Block{
						{Type: document.BlockNodeText, Text: "hello"},
					},
				},
			},
		},
		Default: true,
	}
}

// emptySource is a search.Source with no branches.
type emptySource struct{}

func (emptySource) FetchDocumentBranchesAfter(context.Context, xid.ID, int) ([]document.Document, error) {
	return nil, nil
}

func Test_NewManager(t *testing.T) {
	t.Parallel()

	man := NewManager(slog.New(slog.DiscardHandler), &DBMock{}, &IndexMock{})

	require.NotNil(t, man)
	assert.NotNil(t, man.log)
	assert.NotNil(t, man.db)
	assert.NotNil(t, man.index)
	assert.NotNil(t, man.pe)
}

func Test_Manager_Start(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	fetches := 0

	var man *Manager

	// the first pass runs at once; a trigger brings the second, which ends
	// the run.
	db := &DBMock{
		FetchSearchJobsFunc: func(context.Context, int64, int64) ([]search.Job, error) {
			fetches++

			switch fetches {
			case 1:
				man.Trigger()
			case 2:
				cancel()
			}

			return nil, nil
		},
	}

	man = NewManager(slog.New(slog.DiscardHandler), db, &IndexMock{})

	stopped := make(chan struct{})

	go func() {
		defer close(stopped)

		man.Start(ctx)
	}()

	<-stopped

	assert.Len(t, db.FetchSearchJobsCalls(), 2)
}

func Test_Manager_Trigger(t *testing.T) {
	t.Parallel()

	man := NewManager(slog.New(slog.DiscardHandler), &DBMock{}, &IndexMock{})

	// repeated triggers never block; the executor's own tests cover the
	// coalescing.
	assert.NotPanics(t, func() {
		man.Trigger()
		man.Trigger()
	})
}

func Test_Manager_run(t *testing.T) {
	t.Parallel()

	// an error is logged and swallowed
	db := &DBMock{
		FetchSearchJobsFunc: func(context.Context, int64, int64) ([]search.Job, error) {
			return nil, assert.AnError
		},
	}

	man := NewManager(slog.New(slog.DiscardHandler), db, &IndexMock{})

	assert.NotPanics(t, func() { man.run(context.Background()) })
	assert.Len(t, db.FetchSearchJobsCalls(), 1)
}

func Test_Manager_processJobs(t *testing.T) {
	t.Parallel()

	type check func(*testing.T, *DBMock, *IndexMock, error)

	checks := func(cc ...check) []check { return cc }

	hasError := func(expect bool) check {
		return func(t *testing.T, _ *DBMock, _ *IndexMock, err error) {
			if expect {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
		}
	}

	wasReplaceCalled := func(count int) check {
		return func(t *testing.T, _ *DBMock, idx *IndexMock, _ error) {
			require.Len(t, idx.ReplaceBranchCalls(), count)
		}
	}

	wasDeleteCalled := func(count int) check {
		return func(t *testing.T, db *DBMock, _ *IndexMock, _ error) {
			require.Len(t, db.DeleteSearchJobCalls(), count)
		}
	}

	isCancelled := func() check {
		return func(t *testing.T, _ *DBMock, _ *IndexMock, err error) {
			assert.Equal(t, context.Canceled, err)
		}
	}

	cc := map[string]struct {
		Batches          [][]search.Job
		CancelledContext bool
		FailJobs         map[int64]bool
		DeleteErr        error
		Checks           []check
	}{
		"Cancelled context stops the run": {
			CancelledContext: true,
			Checks: checks(
				isCancelled(),
				wasReplaceCalled(0),
			),
		},
		"Error returned by DB.FetchSearchJobs": {
			Batches: nil,
			Checks: checks(
				hasError(true),
				wasReplaceCalled(0),
			),
		},
		"Jobs are applied and deleted at their version": {
			Batches: [][]search.Job{jobs(1, 3)},
			Checks: checks(
				hasError(false),
				wasReplaceCalled(3),
				wasDeleteCalled(3),
				func(t *testing.T, db *DBMock, _ *IndexMock, _ error) {
					for i, call := range db.DeleteSearchJobCalls() {
						assert.Equal(t, int64(i+1), call.ID)
						assert.Equal(t, int64(1), call.Version)
					}
				},
			),
		},
		"Full batches keep paginating past the last job ID": {
			Batches: [][]search.Job{jobs(1, _processingBatch), jobs(101, 2)},
			Checks: checks(
				hasError(false),
				wasReplaceCalled(_processingBatch+2),
				wasDeleteCalled(_processingBatch+2),
				func(t *testing.T, db *DBMock, _ *IndexMock, _ error) {
					ff := db.FetchSearchJobsCalls()
					require.Len(t, ff, 2)
					assert.Equal(t, int64(0), ff[0].OffsetID)
					assert.Equal(t, int64(_processingBatch), ff[1].OffsetID)
				},
			),
		},
		"Failed job stays queued and the others still run": {
			Batches:  [][]search.Job{jobs(1, 3)},
			FailJobs: map[int64]bool{2: true},
			Checks: checks(
				hasError(false),
				wasReplaceCalled(3),
				wasDeleteCalled(2),
				func(t *testing.T, db *DBMock, _ *IndexMock, _ error) {
					ff := db.DeleteSearchJobCalls()
					require.Len(t, ff, 2)
					assert.Equal(t, int64(1), ff[0].ID)
					assert.Equal(t, int64(3), ff[1].ID)
				},
			),
		},
		"Persistently failing full batches advance and terminate": {
			// the offset moves past failing jobs, so a wall of
			// failures cannot refetch the same batch forever.
			Batches: [][]search.Job{
				jobs(1, _processingBatch),
				jobs(101, _processingBatch),
				nil,
			},
			FailJobs: map[int64]bool{-1: true},
			Checks: checks(
				hasError(false),
				wasReplaceCalled(2*_processingBatch),
				wasDeleteCalled(0),
			),
		},
		"Error returned by DB.DeleteSearchJob still advances": {
			Batches: [][]search.Job{
				jobs(1, _processingBatch),
				nil,
			},
			DeleteErr: assert.AnError,
			Checks: checks(
				hasError(false),
				wasReplaceCalled(_processingBatch),
				wasDeleteCalled(_processingBatch),
			),
		},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			fetches := 0

			db := &DBMock{
				FetchSearchJobsFunc: func(context.Context, int64, int64) ([]search.Job, error) {
					if fetches >= len(c.Batches) {
						if len(c.Batches) == 0 {
							return nil, assert.AnError
						}

						t.Fatal("unexpected extra fetch: the pagination did not terminate")
					}

					batch := c.Batches[fetches]
					fetches++

					return batch, nil
				},
				DeleteSearchJobFunc: func(context.Context, int64, int64) error {
					return c.DeleteErr
				},
				FetchDocumentUnsafeByBranchIDFunc: func(_ context.Context, branchID xid.ID) (*document.Document, error) {
					return stubDocument(branchID), nil
				},
			}

			applied := 0

			idx := &IndexMock{
				ReplaceBranchFunc: func(context.Context, xid.ID, map[string]search.Block) error {
					applied++

					// the fixture numbers jobs from one in fetch order; a
					// negative key fails every job.
					if c.FailJobs[int64(applied)] || c.FailJobs[-1] {
						return assert.AnError
					}

					return nil
				},
			}

			man := NewManager(slog.New(slog.DiscardHandler), db, idx)

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			if c.CancelledContext {
				cancel()
			}

			err := man.processJobs(ctx)

			for _, ch := range c.Checks {
				ch(t, db, idx, err)
			}
		})
	}
}

func Test_Manager_apply(t *testing.T) {
	t.Parallel()

	documentID, branchID := xid.New(), xid.New()

	cc := map[string]struct {
		Job  search.Job
		DB   *DBMock
		Err  error
		Call func(t *testing.T, idx *IndexMock)
	}{
		"Branch scope syncs the branch": {
			Job: search.BranchScope("org-1", documentID, branchID),
			DB: &DBMock{
				FetchDocumentUnsafeByBranchIDFunc: func(_ context.Context, branchID xid.ID) (*document.Document, error) {
					return stubDocument(branchID), nil
				},
			},
			Call: func(t *testing.T, idx *IndexMock) {
				require.Len(t, idx.ReplaceBranchCalls(), 1)
				assert.Equal(t, branchID, idx.ReplaceBranchCalls()[0].BranchID)
			},
		},
		"Document scope syncs the document": {
			Job: search.DocumentScope("org-1", documentID),
			DB: &DBMock{
				FetchDocumentBranchesUnsafeFunc: func(context.Context, xid.ID) ([]document.BranchSummary, error) {
					return nil, nil
				},
			},
			Call: func(t *testing.T, idx *IndexMock) {
				require.Len(t, idx.DeleteDocumentCalls(), 1)
				assert.Equal(t, documentID, idx.DeleteDocumentCalls()[0].DocumentID)
			},
		},
		"Organization scope removes the organization": {
			Job: search.OrganizationScope("org-1"),
			DB:  &DBMock{},
			Call: func(t *testing.T, idx *IndexMock) {
				require.Len(t, idx.DeleteOrganizationCalls(), 1)
				assert.Equal(t, "org-1", idx.DeleteOrganizationCalls()[0].OrganizationID)
			},
		},
		"Error returned by Index.DeleteOrganization": {
			Job: search.OrganizationScope("org-1"),
			DB:  &DBMock{},
			Err: assert.AnError,
			Call: func(t *testing.T, idx *IndexMock) {
				require.Len(t, idx.DeleteOrganizationCalls(), 1)
			},
		},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			idx := &IndexMock{
				DeleteOrganizationFunc: func(context.Context, string) error {
					return c.Err
				},
			}

			man := NewManager(slog.New(slog.DiscardHandler), c.DB, idx)

			err := man.apply(context.Background(), c.Job)

			if c.Err != nil {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			c.Call(t, idx)
		})
	}

	// applied against a real index, a set of jobs yields the same entries in
	// every order, and applying one twice changes nothing.
	t.Run("Jobs are order-independent and idempotent", func(t *testing.T) {
		t.Parallel()

		kept, gone := stubDocument(xid.New()), stubDocument(xid.New())
		removed := xid.New()

		db := &DBMock{
			FetchDocumentUnsafeByBranchIDFunc: func(_ context.Context, branchID xid.ID) (*document.Document, error) {
				if branchID == kept.BranchID {
					return kept, nil
				}

				return nil, sql.ErrNoRows
			},
			FetchDocumentBranchesUnsafeFunc: func(context.Context, xid.ID) ([]document.BranchSummary, error) {
				return nil, nil
			},
		}

		set := []search.Job{
			search.BranchScope("org-1", kept.ID, kept.BranchID),
			search.BranchScope("org-1", gone.ID, gone.BranchID),
			search.DocumentScope("org-1", removed),
			search.OrganizationScope("org-2"),
		}

		orders := [][]int{
			{0, 1, 2, 3},
			{3, 2, 1, 0},
			{1, 0, 3, 2},
			{0, 0, 2, 1, 3, 1},
		}

		var expected []search.Block

		for i, order := range orders {
			idx, err := search.Open(context.Background(), slog.New(slog.DiscardHandler), filepath.Join(t.TempDir(), "index"), emptySource{})
			require.NoError(t, err)

			// the branches to remove start out present, so the removals
			// have something to do.
			require.NoError(t, idx.ReplaceBranch(context.Background(), gone.BranchID, search.Entries(*gone)))

			man := NewManager(slog.New(slog.DiscardHandler), db, idx)

			for _, j := range order {
				require.NoError(t, man.apply(context.Background(), set[j]))
			}

			blocks, err := idx.SearchDocumentBlocks(context.Background(), "org-1", "hello runbook", 50)
			require.NoError(t, err)
			require.NoError(t, idx.Close())

			if i == 0 {
				expected = blocks
				require.Len(t, expected, 2, "the kept branch's paragraph and name")

				continue
			}

			assert.ElementsMatch(t, expected, blocks)
		}
	})
}

func Test_Manager_syncBranch(t *testing.T) {
	t.Parallel()

	branchID := xid.New()

	cc := map[string]struct {
		FetchErr   error
		ReplaceErr error
		DeleteErr  error
		Err        error
		Replaced   int
		Deleted    int
	}{
		"Error returned by DB.FetchDocumentUnsafeByBranchID": {
			FetchErr: assert.AnError,
			Err:      assert.AnError,
		},
		"Missing branch is removed from the index": {
			FetchErr: sql.ErrNoRows,
			Deleted:  1,
		},
		"Error returned by Index.DeleteBranch": {
			FetchErr:  sql.ErrNoRows,
			DeleteErr: assert.AnError,
			Err:       assert.AnError,
			Deleted:   1,
		},
		"Error returned by Index.ReplaceBranch": {
			ReplaceErr: assert.AnError,
			Err:        assert.AnError,
			Replaced:   1,
		},
		"Branch entries are replaced": {
			Replaced: 1,
		},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			doc := stubDocument(branchID)

			db := &DBMock{
				FetchDocumentUnsafeByBranchIDFunc: func(context.Context, xid.ID) (*document.Document, error) {
					if c.FetchErr != nil {
						return nil, c.FetchErr
					}

					return doc, nil
				},
			}

			idx := &IndexMock{
				ReplaceBranchFunc: func(context.Context, xid.ID, map[string]search.Block) error {
					return c.ReplaceErr
				},
				DeleteBranchFunc: func(context.Context, xid.ID) error {
					return c.DeleteErr
				},
			}

			man := NewManager(slog.New(slog.DiscardHandler), db, idx)

			err := man.syncBranch(context.Background(), branchID)

			if c.Err != nil {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			require.Len(t, idx.ReplaceBranchCalls(), c.Replaced)
			require.Len(t, idx.DeleteBranchCalls(), c.Deleted)

			if c.Replaced == 1 {
				call := idx.ReplaceBranchCalls()[0]
				assert.Equal(t, branchID, call.BranchID)
				assert.Equal(t, search.Entries(*doc), call.Entries)
			}

			if c.Deleted == 1 {
				assert.Equal(t, branchID, idx.DeleteBranchCalls()[0].BranchID)
			}
		})
	}
}

func Test_Manager_syncDocument(t *testing.T) {
	t.Parallel()

	documentID := xid.New()
	branches := []document.BranchSummary{{BranchID: xid.New()}, {BranchID: xid.New()}}

	cc := map[string]struct {
		Branches   []document.BranchSummary
		FetchErr   error
		BranchErr  error
		DeleteErr  error
		Err        error
		Replaced   int
		DocDeleted int
	}{
		"Error returned by DB.FetchDocumentBranchesUnsafe": {
			FetchErr: assert.AnError,
			Err:      assert.AnError,
		},
		"Document without branches is removed from the index": {
			DocDeleted: 1,
		},
		"Error returned by Index.DeleteDocument": {
			DeleteErr:  assert.AnError,
			Err:        assert.AnError,
			DocDeleted: 1,
		},
		"Every branch is synced": {
			Branches: branches,
			Replaced: 2,
		},
		"Error returned by a branch sync": {
			Branches:  branches,
			BranchErr: assert.AnError,
			Err:       assert.AnError,
			Replaced:  1,
		},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			db := &DBMock{
				FetchDocumentBranchesUnsafeFunc: func(context.Context, xid.ID) ([]document.BranchSummary, error) {
					return c.Branches, c.FetchErr
				},
				FetchDocumentUnsafeByBranchIDFunc: func(_ context.Context, branchID xid.ID) (*document.Document, error) {
					return stubDocument(branchID), nil
				},
			}

			idx := &IndexMock{
				ReplaceBranchFunc: func(context.Context, xid.ID, map[string]search.Block) error {
					return c.BranchErr
				},
				DeleteDocumentFunc: func(context.Context, xid.ID) error {
					return c.DeleteErr
				},
			}

			man := NewManager(slog.New(slog.DiscardHandler), db, idx)

			err := man.syncDocument(context.Background(), documentID)

			if c.Err != nil {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}

			require.Len(t, idx.ReplaceBranchCalls(), c.Replaced)
			require.Len(t, idx.DeleteDocumentCalls(), c.DocDeleted)

			if c.DocDeleted == 1 {
				assert.Equal(t, documentID, idx.DeleteDocumentCalls()[0].DocumentID)
			}
		})
	}
}
