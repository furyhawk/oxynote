package user

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m)
}

func Test_ImagePath(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "/api/users/u1/image", ImagePath("u1"))
}
