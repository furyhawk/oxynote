package datasource

import (
	"context"
	"testing"
	"time"

	"github.com/oxynote/oxynote/server/core/internal/datasource/processor"
	"github.com/oxynote/oxynote/server/core/pkg/testutil"
	"github.com/prometheus/common/model"
	"github.com/stretchr/testify/assert"
)

// stubRunner is a runner of one type whose clients answer the query with
// fixed values. The clients embed their interface, so only the query
// method exists; any other call is a test bug.
type stubRunner struct {
	Runner

	typ        Type
	err        error
	prometheus *processor.PrometheusQueryResult
	postgreSQL *processor.PostgreSQLQueryResult
	mySQL      *processor.MySQLQueryResult
}

func (s stubRunner) Type() Type { return s.typ }

func (s stubRunner) Prometheus(context.Context) (Prometheus, error) {
	return stubPrometheus{res: s.prometheus, err: s.err}, nil
}

func (s stubRunner) PostgreSQL(context.Context) (PostgreSQL, error) {
	return stubPostgreSQL{res: s.postgreSQL, err: s.err}, nil
}

func (s stubRunner) MySQL(context.Context) (MySQL, error) {
	return stubMySQL{res: s.mySQL, err: s.err}, nil
}

// refusingRunner is a runner that hands out no client at all.
type refusingRunner struct {
	Runner

	typ Type
}

func (r refusingRunner) Type() Type { return r.typ }

func (refusingRunner) Prometheus(context.Context) (Prometheus, error) { return nil, assert.AnError }

func (refusingRunner) PostgreSQL(context.Context) (PostgreSQL, error) { return nil, assert.AnError }

func (refusingRunner) MySQL(context.Context) (MySQL, error) { return nil, assert.AnError }

type stubPrometheus struct {
	Prometheus

	res *processor.PrometheusQueryResult
	err error
}

func (s stubPrometheus) QueryRange(context.Context, string, processor.TimeRange) (*processor.PrometheusQueryResult, error) {
	return s.res, s.err
}

type stubPostgreSQL struct {
	PostgreSQL

	res *processor.PostgreSQLQueryResult
	err error
}

func (s stubPostgreSQL) Query(context.Context, string, processor.TimeRange) (*processor.PostgreSQLQueryResult, error) {
	return s.res, s.err
}

type stubMySQL struct {
	MySQL

	res *processor.MySQLQueryResult
	err error
}

func (s stubMySQL) Query(context.Context, string, processor.TimeRange) (*processor.MySQLQueryResult, error) {
	return s.res, s.err
}

func Test_Query(t *testing.T) {
	rows := &processor.PostgreSQLQueryResult{
		Columns: []string{"time", "value"},
		Rows:    [][]any{{1700000000.0, 10.0}},
	}

	cc := map[string]struct {
		Runner Runner
		Result *processor.QueryResult
		Err    error
	}{
		"Unsupported type": {
			Runner: stubRunner{typ: Type("bogus")},
			Err:    ErrTypeNotSupported,
		},
		"Error returned by Runner.Prometheus": {
			Runner: refusingRunner{typ: TypePrometheus},
			Err:    assert.AnError,
		},
		"Error returned by Runner.PostgreSQL": {
			Runner: refusingRunner{typ: TypePostgreSQL},
			Err:    assert.AnError,
		},
		"Error returned by Runner.MySQL": {
			Runner: refusingRunner{typ: TypeMySQL},
			Err:    assert.AnError,
		},
		"Error returned by Prometheus.QueryRange": {
			Runner: stubRunner{typ: TypePrometheus, err: assert.AnError},
			Err:    assert.AnError,
		},
		"Error returned by PostgreSQL.Query": {
			Runner: stubRunner{typ: TypePostgreSQL, err: assert.AnError},
			Err:    assert.AnError,
		},
		"Error returned by MySQL.Query": {
			Runner: stubRunner{typ: TypeMariaDB, err: assert.AnError},
			Err:    assert.AnError,
		},
		"Prometheus answered nothing": {
			Runner: stubRunner{typ: TypePrometheus},
			Result: &processor.QueryResult{Status: processor.QueryStatusNoData},
		},
		"PostgreSQL answered nothing": {
			Runner: stubRunner{typ: TypePostgreSQL},
			Result: &processor.QueryResult{Status: processor.QueryStatusNoData},
		},
		"MySQL answered nothing": {
			Runner: stubRunner{typ: TypeMySQL},
			Result: &processor.QueryResult{Status: processor.QueryStatusNoData},
		},
		"Prometheus result transformed": {
			Runner: stubRunner{typ: TypePrometheus, prometheus: &processor.PrometheusQueryResult{
				Type: model.ValMatrix,
				Result: model.Matrix{
					&model.SampleStream{
						Metric: model.Metric{"job": "a"},
						Values: []model.SamplePair{{Timestamp: model.Time(1700000000000), Value: 10}},
					},
				},
			}},
			Result: &processor.QueryResult{
				Status: processor.QueryStatusOK,
				Data: []processor.QueryResultSeries{
					{Labels: map[string]string{"job": "a"}, Metrics: [][2]any{{int64(1700000000), 10.0}}},
				},
			},
		},
		"PostgreSQL result transformed": {
			Runner: stubRunner{typ: TypePostgreSQL, postgreSQL: rows},
			Result: (&processor.PostgreSQLQueryResult{Columns: rows.Columns, Rows: rows.Rows}).Transform(processor.ChartTypeLine),
		},
		"MySQL result transformed": {
			Runner: stubRunner{typ: TypeMySQL, mySQL: &processor.MySQLQueryResult{Columns: rows.Columns, Rows: rows.Rows}},
			Result: (&processor.MySQLQueryResult{Columns: rows.Columns, Rows: rows.Rows}).Transform(processor.ChartTypeLine),
		},
	}

	for cn, c := range cc {
		t.Run(cn, func(t *testing.T) {
			t.Parallel()

			tr := processor.TimeRange{From: time.Unix(1700000000, 0), To: time.Unix(1700003600, 0)}

			res, err := Query(context.Background(), c.Runner, "up", tr, processor.ChartTypeLine)
			testutil.AssertEqualError(t, c.Err, err)

			if err != nil {
				return
			}

			assert.Equal(t, c.Result, res)
		})
	}
}
