// Package manager runs the background search-indexing jobs.
package manager

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/oxynote/oxynote/server/core/internal/document"
	"github.com/oxynote/oxynote/server/core/internal/search"
	"github.com/oxynote/oxynote/server/core/pkg/errutil"
	"github.com/oxynote/oxynote/server/core/pkg/logutil"
	"github.com/oxynote/oxynote/server/core/pkg/timeutil"
	"github.com/rs/xid"
)

const (
	// _processingBatch defines how many search jobs to fetch in one batch.
	_processingBatch = 100

	// _processingInterval defines how often queued jobs are processed
	// when no nudge arrives, which covers jobs queued before a restart.
	_processingInterval = time.Second * 10
)

// Manager applies search jobs: for every queued scope it reads the
// current rows and makes the index match them.
type Manager struct {
	log   *slog.Logger
	db    DB
	index Index
	pe    *timeutil.PeriodicExec
}

// NewManager creates a new Manager with the given database and index.
func NewManager(log *slog.Logger, db DB, index Index) *Manager {
	m := &Manager{
		log:   log.With("component", "search-job-manager"),
		db:    db,
		index: index,
	}

	m.pe = timeutil.NewPeriodicExec(
		_processingInterval,
		0,
		m.run,
		logutil.RecoveryValue(m.log, logutil.NewRecoveryPlan("recovered from a panic while processing search jobs")),
		true,
	)

	return m
}

// Start processes the queued jobs right away, then again on every trigger
// and on the periodic interval, until the context ends.
func (m *Manager) Start(ctx context.Context) {
	m.log.Info("starting")
	defer m.log.Info("stopped")

	m.pe.Start(ctx)
}

// Trigger runs a pass right away. A job producer calls it once the job's
// transaction has committed, so the index follows a change without
// waiting for the periodic pass.
func (m *Manager) Trigger() {
	m.pe.Trigger()
}

// run processes the queued jobs once, reporting a failed pass.
func (m *Manager) run(ctx context.Context) {
	if err := m.processJobs(ctx); err != nil {
		m.log.With("error", err).
			Error("processing search jobs")
	}
}

// processJobs applies the queued jobs in a paginated manner. A job that
// fails stays in the database for the next pass; the jobs after it are
// unaffected, since every job describes a scope's current state rather
// than a change against its predecessors.
func (m *Manager) processJobs(ctx context.Context) error {
	var offsetID int64

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		jobs, err := m.db.FetchSearchJobs(ctx, offsetID, _processingBatch)
		if err != nil {
			return fmt.Errorf("fetching paginated search jobs: %w", err)
		}

		for _, job := range jobs {
			offsetID = job.ID

			if err := m.apply(ctx, job); err != nil {
				m.log.With("job_id", job.ID).
					With("error", err).
					Error("applying search job")

				continue
			}

			// a job queued again meanwhile carries a newer version, so the
			// delete leaves it for the next pass.
			if err := m.db.DeleteSearchJob(ctx, job.ID, job.Version); err != nil {
				m.log.With("job_id", job.ID).
					With("error", err).
					Error("deleting search job")
			}
		}

		if len(jobs) < _processingBatch {
			return nil
		}
	}
}

// apply brings the job's scope in line with the database.
func (m *Manager) apply(ctx context.Context, job search.Job) error {
	switch {
	case job.BranchID.Valid:
		return m.syncBranch(ctx, job.BranchID.V)
	case job.DocumentID.Valid:
		return m.syncDocument(ctx, job.DocumentID.V)
	default:
		// an organization is queued only by its teardown, which runs
		// while its rows still exist, so there is nothing to compare
		// against: the scope is always a removal.
		return m.index.DeleteOrganization(ctx, job.OrganizationID)
	}
}

// syncBranch replaces the branch's entries with what the database holds,
// or removes them when the branch is gone.
func (m *Manager) syncBranch(ctx context.Context, branchID xid.ID) error {
	doc, err := m.db.FetchDocumentUnsafeByBranchID(ctx, branchID)
	if err != nil {
		if errutil.IsNotFound(err) {
			return m.index.DeleteBranch(ctx, branchID)
		}

		return fmt.Errorf("fetching branch %s: %w", branchID, err)
	}

	return m.index.ReplaceBranch(ctx, branchID, search.Entries(*doc))
}

// syncDocument syncs every branch of the document, or removes the
// document's entries when it has none left.
func (m *Manager) syncDocument(ctx context.Context, documentID xid.ID) error {
	branches, err := m.db.FetchDocumentBranchesUnsafe(ctx, documentID)
	if err != nil {
		return fmt.Errorf("fetching branches of document %s: %w", documentID, err)
	}

	if len(branches) == 0 {
		return m.index.DeleteDocument(ctx, documentID)
	}

	for _, b := range branches {
		if err := m.syncBranch(ctx, b.BranchID); err != nil {
			return err
		}
	}

	return nil
}

// DB defines the database operations required by the Manager.
//
//go:generate ../../../scripts/codegen/mock -t internal DB db
type DB interface {
	// FetchSearchJobs should retrieve a batch of search jobs with IDs
	// greater than the given offset ID, limited to the specified number
	// of jobs.
	FetchSearchJobs(ctx context.Context, offsetID, limit int64) ([]search.Job, error)

	// DeleteSearchJob should delete the search job when it is still at
	// the given version.
	DeleteSearchJob(ctx context.Context, id, version int64) error

	// FetchDocumentUnsafeByBranchID should fetch the document joined
	// against the branch, across organizations.
	FetchDocumentUnsafeByBranchID(ctx context.Context, branchID xid.ID) (*document.Document, error)

	// FetchDocumentBranchesUnsafe should fetch the document's branches,
	// across organizations.
	FetchDocumentBranchesUnsafe(ctx context.Context, docID xid.ID) ([]document.BranchSummary, error)
}

// Index defines the index operations required by the Manager.
//
//go:generate ../../../scripts/codegen/mock -t internal Index index
type Index interface {
	// ReplaceBranch should make the branch's entries exactly the given
	// ones.
	ReplaceBranch(ctx context.Context, branchID xid.ID, entries map[string]search.Block) error

	// DeleteBranch should remove every entry of the branch.
	DeleteBranch(ctx context.Context, branchID xid.ID) error

	// DeleteDocument should remove every entry of the document.
	DeleteDocument(ctx context.Context, documentID xid.ID) error

	// DeleteOrganization should remove every entry of the organization.
	DeleteOrganization(ctx context.Context, organizationID string) error
}
