package db

import (
	"context"

	sq "github.com/Masterminds/squirrel"
	"github.com/jmoiron/sqlx"
	"github.com/oxynote/oxynote/server/core/internal/search"
)

// InsertSearchJob queues the job's scope. A scope already pending has its
// version bumped instead, so the worker applies it once more if it was
// mid-application.
func (a *agent) InsertSearchJob(ctx context.Context, job search.Job) error {
	q, args := a.builder.Insert("search_jobs").
		SetMap(map[string]any{
			"organization_id": job.OrganizationID,
			"document_id":     job.DocumentID,
			"branch_id":       job.BranchID,
		}).
		Suffix("ON CONFLICT (organization_id, document_id, branch_id) DO UPDATE SET version = search_jobs.version + 1").
		MustSql()

	_, err := a.sql.ExecContext(ctx, q, args...)

	return err
}

// FetchSearchJobs retrieves a batch of search jobs with IDs greater than the
// given offset ID.
func (a *agent) FetchSearchJobs(ctx context.Context, offsetID, limit int64) ([]search.Job, error) {
	q, args := a.builder.Select(
		"id",
		"version",
		"organization_id",
		"document_id",
		"branch_id",
	).From("search_jobs").
		Where(sq.Gt{"id": offsetID}).
		OrderBy("id ASC").
		Limit(uint64(limit)).
		MustSql()

	jobs := []search.Job{}

	err := sqlx.SelectContext(ctx, a.sql, &jobs, q, args...)
	if err != nil {
		return nil, err
	}

	return jobs, nil
}

// DeleteSearchJob deletes the job at the given version. A job queued again
// meanwhile carries a newer version and stays.
func (a *agent) DeleteSearchJob(ctx context.Context, id, version int64) error {
	q, args := a.builder.Delete("search_jobs").
		Where(sq.Eq{
			"id":      id,
			"version": version,
		}).MustSql()

	_, err := a.sql.ExecContext(ctx, q, args...)

	return err
}
