package search

import (
	"testing"

	"github.com/oxynote/oxynote/server/core/pkg/testutil"
	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m, testutil.IgnoreBleveWorkers())
}
