package db

import (
	"context"
	"database/sql"
	"strconv"
	"testing"

	sq "github.com/Masterminds/squirrel"
	"github.com/guregu/null/v5"
	"github.com/oxynote/oxynote/server/core/internal/search"
	"github.com/oxynote/oxynote/server/core/pkg/testutil"
	"github.com/rs/xid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func prepSearchJobs(t *testing.T, db *DB, count int, fn func(int, *search.Job)) []search.Job {
	t.Helper()

	res := make([]search.Job, count)

	for i := range count {
		job := search.BranchScope("org-"+strconv.Itoa(i), xid.New(), xid.New())
		job.Version = 1

		if fn != nil {
			fn(i, &job)
		}

		// the id column is a serial; let the database assign it so
		// the sequence stays usable for production inserts.
		q, args := db.builder.Insert("search_jobs").
			SetMap(map[string]any{
				"version":         job.Version,
				"organization_id": job.OrganizationID,
				"document_id":     job.DocumentID,
				"branch_id":       job.BranchID,
			}).
			Suffix("RETURNING id").
			MustSql()

		err := db.sql.Get(&job.ID, q, args...)
		require.NoError(t, err)

		res[i] = job
	}

	return res
}

// fetchSearchJobs reads every queued job in id order.
func fetchSearchJobs(t *testing.T, db *DB) []search.Job {
	t.Helper()

	q, args := db.builder.Select(
		"id",
		"version",
		"organization_id",
		"document_id",
		"branch_id",
	).From("search_jobs").
		OrderBy("id ASC").
		MustSql()

	var jobs []search.Job

	require.NoError(t, db.sql.Select(&jobs, q, args...))

	return jobs
}

func Test_agent_InsertSearchJob(t *testing.T) {
	type tcase struct {
		CancelledContext bool
		Job              search.Job
		Result           []search.Job
		Err              error
	}

	documentID, branchID := xid.New(), xid.New()

	cc := map[string]func(*testing.T, *DB) tcase{
		"Cancelled context": func(_ *testing.T, _ *DB) tcase {
			return tcase{
				CancelledContext: true,
				Job:              search.BranchScope("org-1", documentID, branchID),
				Err:              assert.AnError,
			}
		},
		"Successful insert of a branch scope": func(_ *testing.T, _ *DB) tcase {
			job := search.BranchScope("org-1", documentID, branchID)
			job.Version = 1

			return tcase{
				Job:    job,
				Result: []search.Job{job},
			}
		},
		"Successful insert of a document scope": func(_ *testing.T, _ *DB) tcase {
			job := search.DocumentScope("org-1", documentID)
			job.Version = 1

			return tcase{
				Job:    job,
				Result: []search.Job{job},
			}
		},
		"Successful insert of an organization scope": func(_ *testing.T, _ *DB) tcase {
			job := search.OrganizationScope("org-1")
			job.Version = 1

			return tcase{
				Job:    job,
				Result: []search.Job{job},
			}
		},
		"Pending scope gets its version bumped": func(t *testing.T, db *DB) tcase {
			pending := prepSearchJobs(t, db, 1, func(_ int, job *search.Job) {
				*job = search.BranchScope("org-1", documentID, branchID)
				job.Version = 1
			})[0]
			pending.Version = 2

			return tcase{
				Job:    search.BranchScope("org-1", documentID, branchID),
				Result: []search.Job{pending},
			}
		},
		"Pending scope with nulls gets its version bumped": func(t *testing.T, db *DB) tcase {
			pending := prepSearchJobs(t, db, 1, func(_ int, job *search.Job) {
				*job = search.OrganizationScope("org-1")
				job.Version = 1
			})[0]
			pending.Version = 2

			return tcase{
				Job:    search.OrganizationScope("org-1"),
				Result: []search.Job{pending},
			}
		},
		"Different scope of the same organization is its own job": func(t *testing.T, db *DB) tcase {
			pending := prepSearchJobs(t, db, 1, func(_ int, job *search.Job) {
				*job = search.OrganizationScope("org-1")
				job.Version = 1
			})[0]

			job := search.DocumentScope("org-1", documentID)
			job.Version = 1

			return tcase{
				Job:    job,
				Result: []search.Job{pending, job},
			}
		},
	}

	for cn, cfn := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			db := prepTempDB(t)
			c := cfn(t, db)

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			if c.CancelledContext {
				cancel()
			}

			err := db.InsertSearchJob(ctx, c.Job)
			testutil.RequireEqualError(t, c.Err, err)

			if err != nil {
				return
			}

			testutil.AssertFilterEqual(t, c.Result, fetchSearchJobs(t, db), int64(0))
		})
	}
}

func Test_agent_FetchSearchJobs(t *testing.T) {
	db := prepTempDB(t)

	// error - cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	res, err := db.FetchSearchJobs(ctx, 0, 10)
	require.Error(t, err)
	assert.Nil(t, res)

	// success - no jobs
	res, err = db.FetchSearchJobs(context.Background(), 0, 10)
	require.NoError(t, err)
	assert.Equal(t, []search.Job{}, res)

	// success - limited batch in id order, nullable scopes included
	jobs := prepSearchJobs(t, db, 3, func(i int, job *search.Job) {
		switch i {
		case 1:
			job.BranchID = null.Value[xid.ID]{}
		case 2:
			job.DocumentID = null.Value[xid.ID]{}
			job.BranchID = null.Value[xid.ID]{}
		}
	})

	res, err = db.FetchSearchJobs(context.Background(), 0, 2)
	assert.NoError(t, err)
	assert.Equal(t, jobs[:2], res)

	// success - offset skips earlier jobs
	res, err = db.FetchSearchJobs(context.Background(), jobs[0].ID, 10)
	assert.NoError(t, err)
	assert.Equal(t, jobs[1:], res)
}

func Test_agent_DeleteSearchJob(t *testing.T) {
	type tcase struct {
		CancelledContext bool
		ID               int64
		Version          int64
		Deleted          bool
		Err              error
	}

	cc := map[string]func(*testing.T, *DB) tcase{
		"Cancelled context": func(t *testing.T, db *DB) tcase {
			jobs := prepSearchJobs(t, db, 1, nil)

			return tcase{
				CancelledContext: true,
				ID:               jobs[0].ID,
				Version:          jobs[0].Version,
				Err:              assert.AnError,
			}
		},
		"Newer version keeps the job": func(t *testing.T, db *DB) tcase {
			jobs := prepSearchJobs(t, db, 1, func(_ int, job *search.Job) {
				job.Version = 2
			})

			return tcase{
				ID:      jobs[0].ID,
				Version: 1,
				Deleted: false,
			}
		},
		"Successful delete": func(t *testing.T, db *DB) tcase {
			jobs := prepSearchJobs(t, db, 1, nil)

			return tcase{
				ID:      jobs[0].ID,
				Version: jobs[0].Version,
				Deleted: true,
			}
		},
	}

	for cn, cfn := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			db := prepTempDB(t)
			c := cfn(t, db)

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			if c.CancelledContext {
				cancel()
			}

			err := db.DeleteSearchJob(ctx, c.ID, c.Version)
			testutil.RequireEqualError(t, c.Err, err)

			if err != nil {
				return
			}

			var id int64

			q, args := db.builder.Select("id").
				From("search_jobs").
				Where(sq.Eq{
					"id": c.ID,
				}).MustSql()

			err = db.sql.Get(&id, q, args...)

			if c.Deleted {
				testutil.AssertEqualError(t, sql.ErrNoRows, err)
				return
			}

			require.NoError(t, err)
		})
	}
}
