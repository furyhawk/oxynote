package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	sq "github.com/Masterminds/squirrel"
	"github.com/dchest/uniuri"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jmoiron/sqlx"
	"github.com/lann/builder"
	"github.com/orlangure/gnomock"
	pgDocker "github.com/orlangure/gnomock/preset/postgres"
	"github.com/oxynote/oxynote/server/core/internal/tag"
	"github.com/oxynote/oxynote/server/core/pkg/cryptoutil"
	"github.com/oxynote/oxynote/server/core/pkg/errutil"
	"github.com/oxynote/oxynote/server/core/pkg/ioutil"
	"github.com/oxynote/oxynote/server/core/pkg/metricutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"
)

var _pgDSN string

const (
	_pgUser string = "pgtest"
	_pgPass string = "pgpass"

	// _dataSourceKey is the base64 credentials encryption key every
	// temporary test database is configured with.
	_dataSourceKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

	// _retiredDataSourceKey is a base64 credentials encryption key no
	// temporary test database is configured with unless a test says so.
	_retiredDataSourceKey = "ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA="
)

// _dataSourceKeys is the keyring every temporary test database is
// configured with.
var _dataSourceKeys = mustParseKeys(_dataSourceKey)

// mustParseKeys parses a keyring list or panics.
func mustParseKeys(list string) *cryptoutil.Keyring {
	keys, err := cryptoutil.ParseKeyring(list)
	if err != nil {
		panic("cannot parse test keyring: " + err.Error())
	}

	return keys
}

func TestMain(m *testing.M) {
	container, err := gnomock.Start(pgDocker.Preset(
		pgDocker.WithUser(
			_pgUser,
			_pgPass,
		),
	))
	if err != nil {
		panic("cannot set up: " + err.Error())
	}

	defer func() {
		err = gnomock.Stop(container)
		if err != nil {
			panic("cannot clean up: " + err.Error())
		}
	}()

	_pgDSN = container.Host + ":" + strconv.Itoa(container.DefaultPort())

	goleak.VerifyTestMain(m, goleak.IgnoreCurrent())
}

func Test_New(t *testing.T) {
	// error - db file not found
	opts := Options{
		DSN: filepath.Join(t.TempDir(), "test", "123"),
	}

	db, err := New(slog.New(slog.DiscardHandler), metricutil.NewFactory("test", nil), opts)
	assert.Error(t, err)
	assert.Nil(t, db)

	// success
	opts = Options{
		DSN: fmt.Sprintf("postgres://%s:%s@%s/postgres?sslmode=disable", _pgUser, _pgPass, _pgDSN),
	}

	db, err = New(slog.New(slog.DiscardHandler), metricutil.NewFactory("test", nil), opts)
	assert.NoError(t, err)
	require.NotNil(t, db)
	assert.NotZero(t, db.log)
	assert.NotNil(t, db.agent)
	assert.NotNil(t, db.closer)
	assert.NotZero(t, db.builder)

	assert.NoError(t, db.closer.Close())
}

func Test_DB_Close(t *testing.T) {
	db := &DB{
		closer: ioutil.CloserFunc(func() error {
			return assert.AnError
		}),
	}

	assert.Error(t, db.Close())

	db.closer = ioutil.CloserFunc(func() error {
		return nil
	})

	assert.NoError(t, db.Close())
}

func Test_DetectError(t *testing.T) {
	type tcase struct {
		Err    error
		Result error
	}

	cc := map[string]func(*testing.T) tcase{
		"Not found": func(*testing.T) tcase {
			return tcase{
				Err:    sql.ErrNoRows,
				Result: errutil.ErrNotFound,
			}
		},
		"Error pass through": func(*testing.T) tcase {
			return tcase{
				Err:    sql.ErrConnDone,
				Result: sql.ErrConnDone,
			}
		},
		"No error": func(*testing.T) tcase {
			return tcase{}
		},
		"Unmatched pgx constraint": func(*testing.T) tcase {
			return tcase{
				Err: &pgconn.PgError{
					Code: "123",
				},
				Result: &pgconn.PgError{
					Code: "123",
				},
			}
		},
		"Unmatched constraint": func(*testing.T) tcase {
			return tcase{
				Err:    errors.New("b"),
				Result: errors.New("b"),
			}
		},
		"Duplicate branch name": func(t *testing.T) tcase {
			db := prepTempDB(t)

			// renaming a branch onto a sibling's name trips the unique key
			// that DetectError has to recognise.
			branches := prepDocumentBranches(t, db, 2, nil)

			second := branches[1]
			second.BranchName = branches[0].BranchName

			err := db.UpdateDocumentBranchMetadata(context.Background(), *second)
			require.Error(t, err)

			return tcase{
				Err:    err,
				Result: errutil.New(http.StatusBadRequest, "document_branch.duplicate_name", "branch name is already in use"),
			}
		},
		"Duplicate file id": func(t *testing.T) tcase {
			db := prepTempDB(t)

			f := prepDocumentFiles(t, db, 1, nil)[0]

			err := db.InsertDocumentFile(context.Background(), f)
			require.Error(t, err)

			return tcase{
				Err:    err,
				Result: errutil.New(http.StatusConflict, "document_file.exists", "file id is already in use"),
			}
		},
		"Duplicate tag name": func(t *testing.T) tcase {
			db := prepTempDB(t)

			existing := prepTags(t, db, 1, nil)[0]

			dup := tag.NewTag(
				tag.CreateInput{TagName: existing.TagName, Color: "#000000"},
				existing.OrganizationID,
				prepUsers(t, db, 1)[0],
			)

			err := db.InsertTag(context.Background(), dup)
			require.Error(t, err)

			return tcase{
				Err:    err,
				Result: tag.ErrDuplicateTagName,
			}
		},
	}

	for cn, cfn := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			c := cfn(t)

			assert.Equal(t, c.Result, DetectError(c.Err))
		})
	}
}

func Test_DB_BeginTx(t *testing.T) {
	db := prepTempDB(t)

	// provided destination isn't a pointer
	require.PanicsWithValue(
		t,
		"dest is not a pointer",
		func() {
			require.NoError(t, db.BeginTx(context.Background(), struct{}{}))
		},
	)

	// provided destination is nil
	require.PanicsWithValue(
		t,
		"dest is not a pointer",
		func() {
			require.NoError(t, db.BeginTx(context.Background(), (*struct{})(nil)))
		},
	)

	// cannot fulfill destination requirements
	require.Panics(
		t,
		func() {
			require.NoError(t, db.BeginTx(context.Background(), &struct{}{}))
		},
	)

	type test2 interface {
		Commit() error
	}

	var val test2

	// context error
	nctx, cancel := context.WithCancel(context.Background())
	cancel()

	require.Error(t, db.BeginTx(nctx, &val))

	// success
	require.NoError(t, db.BeginTx(context.Background(), &val))
	assert.IsType(t, &Tx{}, val)
	assert.NoError(t, val.Commit())
}

func Test_Tx_Commit(t *testing.T) {
	db := prepTempDB(t)

	type test interface {
		Commit() error
	}

	var ntx test

	require.NoError(t, db.BeginTx(context.Background(), &ntx))
	require.NoError(t, ntx.Commit())
	require.Error(t, ntx.Commit())
}

func Test_Tx_Rollback(t *testing.T) {
	db := prepTempDB(t)

	type test interface {
		Rollback() error
	}

	var ntx test

	require.NoError(t, db.BeginTx(context.Background(), &ntx))
	require.NoError(t, ntx.Rollback())
	require.Error(t, ntx.Rollback())
}

// prepMockDB creates an agent backed by sqlmock for reaching error
// branches that a real database cannot produce (e.g. failures in the
// middle of a multi-statement transaction).
func prepMockDB(t *testing.T) (*agent, sqlmock.Sqlmock) {
	t.Helper()

	mockDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	require.NoError(t, err)

	t.Cleanup(func() {
		mockDB.Close() //nolint:errcheck,gosec // error provides no meaningful info
		require.NoError(t, mock.ExpectationsWereMet())
	})

	return &agent{
		sql:     sqlx.NewDb(mockDB, "sqlmock"),
		builder: sq.StatementBuilderType(builder.EmptyBuilder).PlaceholderFormat(sq.Dollar),
	}, mock
}

func prepTempDB(t *testing.T) *DB {
	name := uniuri.NewLenChars(10, []byte("abcdefghijklmnopqrstuvwxyz"))

	opts := Options{
		DSN:                       fmt.Sprintf("postgres://%s:%s@%s/%s?sslmode=disable", _pgUser, _pgPass, _pgDSN, name),
		DataSourceCredentialsKeys: _dataSourceKeys,
	}

	tmpDB, err := sqlx.Connect(
		"pgx",
		fmt.Sprintf("postgres://%s:%s@%s/postgres?sslmode=disable", _pgUser, _pgPass, _pgDSN),
	)
	require.NoError(t, err)

	_, err = tmpDB.Exec("CREATE DATABASE " + name)
	require.NoError(t, err)
	require.NoError(t, tmpDB.Close())

	db, err := New(slog.New(slog.DiscardHandler), metricutil.NewFactory("test", nil), opts)
	require.NoError(t, err)

	t.Cleanup(func() {
		db.Close() //nolint:errcheck,gosec // error provides no meaningful info
	})

	return db
}
